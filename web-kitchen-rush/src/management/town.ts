import { z } from 'zod';
import { ZONES, zoneArrivalBonus, zoneForRing, zoneId, type ZoneId } from './zones';
import { HOME_ID, HOME_SIZE, WORLD_LIMIT, inHome, parseRegionId, regionBlock, regionCenter, regionOfPlot } from './world';
import { regionById, type BoostKind } from './ocean';

/**
 * The reef town and the world around it: one grid of plots the owner unlocks and builds on. The Home Reef
 * town (the restaurant and its depth-zone rings) is region (0, 0); claimed ocean regions add their own blocks
 * of plots around it on the same grid (see `world.ts`). Construction runs on real (wall-clock) time, so it
 * also finishes while the player is away. Everything here is pure; the engine applies results to the restaurant.
 */
// Zod validates required fields at runtime; preserve them in the legacy non-strict TS project too.
export type Validated<T> = T extends (infer U)[] ? Validated<U>[] : T extends object ? { [K in keyof T]-?: Validated<T[K]> } : T;

/** 9×9: the Shallows (the original 5×5) in the middle, then a Coral Reef ring and a Twilight ring. */
export const TOWN_SIZE = HOME_SIZE;
/** Saves from before depth zones used a 5×5 town around the same restaurant. */
export const LEGACY_TOWN_SIZE = 5;
export const MAX_LEVEL = 15;
export const LEVELS_PER_LOOK = 5;
export const MAX_BUILDERS = 2;

export const buildingKind = z.enum(['restaurant', 'kelpFarm', 'fishery', 'homes', 'garden', 'workshop', 'branch']);
export type BuildingKind = z.infer<typeof buildingKind>;
const jobSchema = z.object({ kind: z.enum(['build', 'upgrade']), startedAt: z.number().finite().nonnegative(), endsAt: z.number().finite().nonnegative() });
export type Job = Validated<z.infer<typeof jobSchema>>;
const coordinate = z.number().int().min(-WORLD_LIMIT).max(WORLD_LIMIT);
const plotSchema = z.object({ x: coordinate, z: coordinate, owned: z.boolean(), building: buildingKind.nullable(), level: z.number().int().min(0).max(MAX_LEVEL), job: jobSchema.nullable() });
export type Plot = Validated<z.infer<typeof plotSchema>>;
const center = Math.floor(TOWN_SIZE / 2);
const emptyPlot = (x: number, z: number): Plot => ({ x, z, owned: false, building: null, level: 0, job: null });
/** Move a 5×5 town into the middle of the 9×9 grid, keeping every plot, building, level and job. */
export function migrateTown(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { plots?: unknown }).plots)) return raw;
  const old = (raw as { plots: unknown[] }).plots;
  if (old.length !== LEGACY_TOWN_SIZE * LEGACY_TOWN_SIZE) return raw;
  const shift = center - Math.floor(LEGACY_TOWN_SIZE / 2), moved = new Map<string, unknown>();
  for (const plot of old) {
    if (!plot || typeof plot !== 'object') return raw;
    const p = plot as { x: unknown; z: unknown };
    if (typeof p.x !== 'number' || typeof p.z !== 'number') return raw;
    moved.set(`${p.x + shift},${p.z + shift}`, { ...p, x: p.x + shift, z: p.z + shift });
  }
  const plots: unknown[] = [];
  for (let z = 0; z < TOWN_SIZE; z++) for (let x = 0; x < TOWN_SIZE; x++) plots.push(moved.get(`${x},${z}`) ?? emptyPlot(x, z));
  return { ...raw, plots };
}
export const townSchema = z.preprocess(migrateTown, z.object({
  /** The 81 home plots, then the plots of every claimed region (49 each). */
  plots: z.array(plotSchema).min(TOWN_SIZE * TOWN_SIZE).max(TOWN_SIZE * TOWN_SIZE + 49 * 2000)
    .refine(list => list.filter(inHome).length === TOWN_SIZE * TOWN_SIZE && new Set(list.map(p => `${p.x},${p.z}`)).size === list.length && list.every(p => regionOfPlot(p.x, p.z) !== null), 'Invalid plots'),
  builders: z.number().int().min(1).max(MAX_BUILDERS),
  pearls: z.number().int().nonnegative(), charms: z.object({ current: z.number().int().nonnegative(), tide: z.number().int().nonnegative() }), lastGiftDay: z.string().max(10),
  zones: z.array(zoneId).max(4).default(['shallows']).refine(list => list.includes('shallows') && new Set(list).size === list.length, 'Invalid zones'),
}));
export type Town = Validated<z.infer<typeof townSchema>>;

export interface BuildingInfo { name: string; description: string; adjacency: string; looks: [string, string, string]; buildCost: number; buildSeconds: number; }
export const BUILDINGS: Record<BuildingKind, BuildingInfo> = {
  restaurant: { name: 'Restaurant', description: 'Your restaurant. Each level draws guests a little more often.', adjacency: '', looks: ['Reef shack', 'Coral hall', 'Bubble-dome palace'], buildCost: 0, buildSeconds: 0 },
  kelpFarm: { name: 'Kelp farm', description: 'Grows your own kelp. Kelp dishes cost less to make.', adjacency: 'Next to the restaurant or a branch: 50% stronger.', looks: ['Kelp patch', 'Kelp terraces', 'Glowing kelp forest'], buildCost: 300, buildSeconds: 90 },
  fishery: { name: 'Fishery', description: 'Catches your own fish. Fish dishes cost less to make.', adjacency: 'Next to the restaurant or a branch: 50% stronger.', looks: ['Fish traps', 'Net house', 'Pearl-shell fishery'], buildCost: 350, buildSeconds: 120 },
  homes: { name: 'Mareen homes', description: 'Room for more crew. +1 crew slot, +1 more every 5 levels.', adjacency: 'Next to a glow garden: crew work faster.', looks: ['Shell huts', 'Coral cottages', 'Pearl villas'], buildCost: 300, buildSeconds: 90 },
  garden: { name: 'Glow garden', description: 'A glowing attraction. Guests arrive more often.', adjacency: 'Next to the restaurant or a branch: 50% stronger. Next to homes: crew work faster.', looks: ['Anemone bed', 'Jelly garden', 'Bioluminescent grove'], buildCost: 250, buildSeconds: 60 },
  workshop: { name: 'Workshop', description: 'Mareen engineers. All building and upgrading finishes faster.', adjacency: '', looks: ['Driftwood shed', 'Stone workshop', 'Crystal forge'], buildCost: 500, buildSeconds: 150 },
  branch: { name: 'Branch restaurant', description: 'A second restaurant your crew runs on its own. It earns money at the end of every shift.', adjacency: 'One per region, outside the Home Reef. Producers and gardens next to it are 50% stronger.', looks: ['Kelp kiosk', 'Coral bistro', 'Pearl brasserie'], buildCost: 1200, buildSeconds: 240 },
};
/** Buildings for any plot; a branch is offered too on region plots (see `buildableAt`). */
export const BUILDABLE: BuildingKind[] = ['kelpFarm', 'fishery', 'homes', 'garden', 'workshop'];
export const CHARMS = { current: { name: 'Current charm', seconds: 15 * 60 }, tide: { name: 'Tide charm', seconds: 60 * 60 } } as const;
export type CharmKind = keyof typeof CHARMS;
export const SHOP = {
  builder: { name: 'Second Mareen builder', pearls: 150 },
  charms: { name: '3 Current charms', pearls: 20 },
} as const;
/** Real-money packs are listed for design review only; no payment is possible until a store is chosen. */
export const PEARL_PACKS = [{ pearls: 60, price: '$0.99' }, { pearls: 330, price: '$4.99' }, { pearls: 720, price: '$9.99' }] as const;

export function createTown(): Town {
  const plots: Plot[] = [];
  for (let z = 0; z < TOWN_SIZE; z++) for (let x = 0; x < TOWN_SIZE; x++) {
    const home = x === center && z === center;
    plots.push(home ? { x, z, owned: true, building: 'restaurant', level: 1, job: null } : emptyPlot(x, z));
  }
  return { plots, builders: 1, pearls: 5, charms: { current: 1, tide: 0 }, lastGiftDay: '', zones: ['shallows'] };
}
/** The depth zone a plot belongs to, by its ring around the restaurant. */
export const plotZone = (plot: Pick<Plot, 'x' | 'z'>): ZoneId => zoneForRing(Math.max(Math.abs(plot.x - center), Math.abs(plot.z - center)));

/** Plots by position, rebuilt when the list changes (claiming a region adds plots). */
const index = new WeakMap<Plot[], { size: number; map: Map<string, Plot> }>();
export function plotAt(town: Pick<Town, 'plots'>, x: number, z: number): Plot | undefined {
  let hit = index.get(town.plots);
  if (!hit || hit.size !== town.plots.length) { hit = { size: town.plots.length, map: new Map(town.plots.map(p => [`${p.x},${p.z}`, p])) }; index.set(town.plots, hit); }
  return hit.map.get(`${x},${z}`);
}
/** The region a plot belongs to ("0,0" for the home town). */
export const plotRegion = (plot: Pick<Plot, 'x' | 'z'>): string => regionOfPlot(plot.x, plot.z) ?? HOME_ID;
export const plotsIn = (town: Pick<Town, 'plots'>, id: string): Plot[] => town.plots.filter(p => regionOfPlot(p.x, p.z) === id);
/** Fresh plots for a newly claimed region: its middle plot (the branch site) comes owned. */
export function regionPlots(id: string): Plot[] {
  const p = parseRegionId(id)!, b = regionBlock(p.x, p.y), c = regionCenter(p.x, p.y), list: Plot[] = [];
  for (let z = b.z0; z < b.z0 + b.size; z++) for (let x = b.x0; x < b.x0 + b.size; x++) list.push({ ...emptyPlot(x, z), owned: x === c.x && z === c.z });
  return list;
}
/** Add the plots of every claimed region that has none yet (claims from older saves); returns how many regions were filled. */
export function ensureRegionPlots(town: Town, regions: readonly string[]): number {
  let filled = 0;
  for (const id of regions) {
    const p = parseRegionId(id); if (!p || id === HOME_ID) continue;
    const c = regionCenter(p.x, p.y); if (plotAt(town, c.x, c.z)) continue;
    town.plots.push(...regionPlots(id)); filled++;
  }
  return filled;
}
/** Region modifiers that apply to a plot (neutral at home). */
export const plotModifiers = (plot: Pick<Plot, 'x' | 'z'>) => regionById(plotRegion(plot))!.modifiers;
const boostOf = (plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind): number => inHome(plot) ? 1 : plotModifiers(plot).boost[kind as BoostKind] ?? 1;
export const branchIn = (town: Pick<Town, 'plots'>, id: string): Plot | undefined => id === HOME_ID ? undefined : plotsIn(town, id).find(p => p.building === 'branch');
/** What can be built on a plot: the usual buildings, plus a branch in a region that has none yet. */
export const buildableAt = (town: Town, plot: Pick<Plot, 'x' | 'z'>): BuildingKind[] => !inHome(plot) && !branchIn(town, plotRegion(plot)) ? ['branch', ...BUILDABLE] : BUILDABLE;
export const neighbours = (town: Town, plot: Pick<Plot, 'x' | 'z'>): Plot[] => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => plotAt(town, plot.x + dx, plot.z + dz)).filter((p): p is Plot => Boolean(p));
/** The art look (1–3) for a level: levels 1–5, 6–10 and 11–15 share one image each. */
export const lookFor = (level: number): 1 | 2 | 3 => Math.min(3, Math.max(1, Math.ceil(level / LEVELS_PER_LOOK))) as 1 | 2 | 3;
/** Owned plots in one region (the home town by default). */
export const ownedCount = (town: Town, id = HOME_ID): number => (id === HOME_ID ? town.plots.filter(inHome) : plotsIn(town, id)).filter(p => p.owned).length;
/** Home plot price grows polynomially: $250 for the first, about $3.8k by the 11th, $14k for the 25th, $93k for the last of 80. */
export const unlockCost = (town: Town): number => Math.round(250 * (1 + (ownedCount(town) - 1) * .4) ** 1.7 / 10) * 10;
/** Depth zones gate the home town's rings; region plots only need their region claimed. */
export const zoneOpen = (town: Town, plot: Pick<Plot, 'x' | 'z'>): boolean => !inHome(plot) || town.zones.includes(plotZone(plot));
export const canUnlock = (town: Town, plot: Plot): boolean => !plot.owned && zoneOpen(town, plot) && neighbours(town, plot).some(p => p.owned);
/** Why a plot can't be unlocked yet, or null when it can. */
export function plotLockReason(town: Town, plot: Plot): string | null {
  if (plot.owned) return 'You already own this plot.';
  if (!zoneOpen(town, plot)) return `Reach ${ZONES[plotZone(plot)].place} first.`;
  return neighbours(town, plot).some(p => p.owned) ? null : inHome(plot) ? 'Unlock a plot next to your town first.' : 'Unlock a plot next to one you own here first.';
}
/** A building's level only counts once its construction is complete. */
export const activeLevel = (plot: Plot): number => plot.job?.kind === 'build' ? 0 : plot.level;
const levelsOf = (town: Town, kind: BuildingKind): Plot[] => town.plots.filter(p => p.building === kind && activeLevel(p) > 0);
const nextTo = (town: Town, plot: Plot, kind: BuildingKind): boolean => neighbours(town, plot).some(p => p.building === kind && activeLevel(p) > 0);
/** Producers and gardens are stronger next to the restaurant or a branch. */
const hub = (town: Town, plot: Plot): boolean => nextTo(town, plot, 'restaurant') || nextTo(town, plot, 'branch');

/** Balance knobs for building upgrades and producers; see docs/BALANCE.md for the reasoning. */
export const TOWN_BALANCE = { restaurantUpgradeBase: 600, upgradeExponent: 1.6, producerPerLevel: .06, producerCap: .6, gardenPerLevel: .03, gardenCap: .5, workshopPerLevel: .03, workshopCap: .45, branchBase: 30, branchExponent: 1 } as const;
/** A branch's earnings per service day: base × level ^ exponent × the region's branch modifier × (1 + fame bonus), to the dollar. */
export const branchIncome = (level: number, regionIncome: number, fameBonus = 0): number => level > 0 ? Math.round(TOWN_BALANCE.branchBase * level ** TOWN_BALANCE.branchExponent * regionIncome * (1 + fameBonus)) : 0;
export function upgradeCost(kind: BuildingKind, nextLevel: number): number {
  const base = kind === 'restaurant' ? TOWN_BALANCE.restaurantUpgradeBase : BUILDINGS[kind].buildCost;
  return Math.round(base * .6 * nextLevel ** TOWN_BALANCE.upgradeExponent / 10) * 10;
}
/** Real seconds for a job before workshop speed-ups: about a minute early on, hours near the top. */
export function baseSeconds(kind: BuildingKind, nextLevel: number): number {
  return nextLevel === 1 ? BUILDINGS[kind].buildSeconds : Math.round(60 * 1.55 ** (nextLevel - 1));
}
export const workshopSpeedup = (town: Town): number => Math.min(TOWN_BALANCE.workshopCap, levelsOf(town, 'workshop').reduce((sum, p) => sum + activeLevel(p) * TOWN_BALANCE.workshopPerLevel * boostOf(p, 'workshop'), 0));
/** Real seconds for a job; `timeFactor` is the region's build time (1 at home). */
export const jobSeconds = (town: Town, kind: BuildingKind, nextLevel: number, timeFactor = 1): number => Math.max(5, Math.round(baseSeconds(kind, nextLevel) * (1 - workshopSpeedup(town)) * timeFactor));
export const busyBuilders = (town: Town): number => town.plots.filter(p => p.job).length;

/** Combined effects of finished buildings and reached zones on the restaurant. Neutral for a brand-new town. */
export interface TownEffects { kelpCost: number; fishCost: number; extraCrew: number; arrivalBonus: number; crewSpeed: number; }
export function townEffects(town: Town): TownEffects {
  const restaurantPlot = town.plots.find(p => p.building === 'restaurant')!;
  // Neighbour bonus × the region's specialisation; town-wide caps still apply to the sum.
  const boost = (p: Plot) => (hub(town, p) ? 1.5 : 1) * boostOf(p, p.building!);
  const producer = (kind: BuildingKind) => 1 - Math.min(TOWN_BALANCE.producerCap, levelsOf(town, kind).reduce((sum, p) => sum + activeLevel(p) * TOWN_BALANCE.producerPerLevel * boost(p), 0));
  const gardens = levelsOf(town, 'garden');
  return {
    kelpCost: producer('kelpFarm'), fishCost: producer('fishery'),
    extraCrew: Math.min(6, levelsOf(town, 'homes').reduce((sum, p) => sum + 1 + Math.floor(activeLevel(p) / LEVELS_PER_LOOK), 0)),
    arrivalBonus: (activeLevel(restaurantPlot) - 1) * .03 + Math.min(TOWN_BALANCE.gardenCap, gardens.reduce((sum, p) => sum + activeLevel(p) * TOWN_BALANCE.gardenPerLevel * boost(p), 0)) + zoneArrivalBonus(town),
    crewSpeed: 1 + Math.min(.15, gardens.filter(p => nextTo(town, p, 'homes')).reduce((sum, p) => sum + activeLevel(p) * .01, 0)),
  };
}

const percent = (n: number) => `${Math.round(n * 100)}%`;
export const nextToKind = (town: Town, plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind) => neighbours(town, plot).some(p => p.building === kind);
/** The neighbour bonus applies here: next to the restaurant or a branch. */
export const nextToHub = (town: Town, plot: Pick<Plot, 'x' | 'z'>) => nextToKind(town, plot, 'restaurant') || nextToKind(town, plot, 'branch');

/** What a building does at a level, in the player's terms. `fameBranch` is the fame bonus on branch income. */
export function effectText(town: Town, plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind, level: number, fameBranch = 0): string {
  const boost = (nextToHub(town, plot) ? 1.5 : 1) * boostOf(plot, kind);
  if (kind === 'branch') return `Earns $${branchIncome(level, plotModifiers(plot).branchIncome, fameBranch).toLocaleString('en-US')} at the end of every shift`;
  if (kind === 'restaurant') return level > 1 ? `Guests arrive ${percent((level - 1) * .03)} more often` : 'Upgrade to draw guests more often';
  if (kind === 'kelpFarm') return `Kelp dishes cost ${percent(Math.min(TOWN_BALANCE.producerCap, level * TOWN_BALANCE.producerPerLevel * boost))} less to make`;
  if (kind === 'fishery') return `Fish dishes cost ${percent(Math.min(TOWN_BALANCE.producerCap, level * TOWN_BALANCE.producerPerLevel * boost))} less to make`;
  if (kind === 'homes') return `+${1 + Math.floor(level / 5)} crew slot${level >= 5 ? 's' : ''}`;
  if (kind === 'garden') return `Guests arrive ${percent(level * TOWN_BALANCE.gardenPerLevel * boost)} more often (all gardens: up to ${percent(TOWN_BALANCE.gardenCap)})${nextToKind(town, plot, 'homes') ? ` · crew ${percent(Math.min(.15, level * .01))} faster` : ''}`;
  return `All building finishes ${percent(Math.min(TOWN_BALANCE.workshopCap, level * TOWN_BALANCE.workshopPerLevel * boost))} faster`;
}
/** Finish every job whose end time has passed. Returns the plots that just completed. */
export function completeJobs(town: Town, now: number): Plot[] {
  const done = town.plots.filter(p => p.job && p.job.endsAt <= now);
  for (const plot of done) { if (plot.job!.kind === 'upgrade') plot.level++; plot.job = null; }
  return done;
}
/** Pearls to finish a job now: 1 per started 6 minutes left. */
export const finishCost = (job: Job, now: number): number => Math.max(1, Math.ceil(Math.max(0, job.endsAt - now) / 360_000));
export const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);
