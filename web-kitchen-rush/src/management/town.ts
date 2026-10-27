import { z } from 'zod';
import { ZONES, zoneArrivalBonus, zoneForRing, zoneId, type ZoneId } from './zones';

/**
 * The reef town around the restaurant: a grid of plots the owner unlocks and builds on.
 * Construction runs on real (wall-clock) time, so it also finishes while the player is away.
 * Everything here is pure; the engine applies results to the restaurant simulation.
 */
// Zod validates required fields at runtime; preserve them in the legacy non-strict TS project too.
export type Validated<T> = T extends (infer U)[] ? Validated<U>[] : T extends object ? { [K in keyof T]-?: Validated<T[K]> } : T;

/** 9×9: the Shallows (the original 5×5) in the middle, then a Coral Reef ring and a Twilight ring. */
export const TOWN_SIZE = 9;
/** Saves from before depth zones used a 5×5 town around the same restaurant. */
export const LEGACY_TOWN_SIZE = 5;
export const MAX_LEVEL = 15;
export const LEVELS_PER_LOOK = 5;
export const MAX_BUILDERS = 2;

export const buildingKind = z.enum(['restaurant', 'kelpFarm', 'fishery', 'homes', 'garden', 'workshop']);
export type BuildingKind = z.infer<typeof buildingKind>;
const jobSchema = z.object({ kind: z.enum(['build', 'upgrade']), startedAt: z.number().finite().nonnegative(), endsAt: z.number().finite().nonnegative() });
export type Job = Validated<z.infer<typeof jobSchema>>;
const plotSchema = z.object({ x: z.number().int().min(0).max(TOWN_SIZE - 1), z: z.number().int().min(0).max(TOWN_SIZE - 1), owned: z.boolean(), building: buildingKind.nullable(), level: z.number().int().min(0).max(MAX_LEVEL), job: jobSchema.nullable() });
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
  plots: z.array(plotSchema).length(TOWN_SIZE * TOWN_SIZE), builders: z.number().int().min(1).max(MAX_BUILDERS),
  pearls: z.number().int().nonnegative(), charms: z.object({ current: z.number().int().nonnegative(), tide: z.number().int().nonnegative() }), lastGiftDay: z.string().max(10),
  zones: z.array(zoneId).max(4).default(['shallows']).refine(list => list.includes('shallows') && new Set(list).size === list.length, 'Invalid zones'),
}));
export type Town = Validated<z.infer<typeof townSchema>>;

export interface BuildingInfo { name: string; description: string; adjacency: string; looks: [string, string, string]; buildCost: number; buildSeconds: number; }
export const BUILDINGS: Record<BuildingKind, BuildingInfo> = {
  restaurant: { name: 'Restaurant', description: 'Your restaurant. Each level draws guests a little more often.', adjacency: '', looks: ['Reef shack', 'Coral hall', 'Bubble-dome palace'], buildCost: 0, buildSeconds: 0 },
  kelpFarm: { name: 'Kelp farm', description: 'Grows your own kelp. Kelp dishes cost less to make.', adjacency: 'Next to the restaurant: 50% stronger.', looks: ['Kelp patch', 'Kelp terraces', 'Glowing kelp forest'], buildCost: 350, buildSeconds: 90 },
  fishery: { name: 'Fishery', description: 'Catches your own fish. Fish dishes cost less to make.', adjacency: 'Next to the restaurant: 50% stronger.', looks: ['Fish traps', 'Net house', 'Pearl-shell fishery'], buildCost: 450, buildSeconds: 120 },
  homes: { name: 'Mareen homes', description: 'Room for more crew. +1 crew slot, +1 more every 5 levels.', adjacency: 'Next to a glow garden: crew work faster.', looks: ['Shell huts', 'Coral cottages', 'Pearl villas'], buildCost: 300, buildSeconds: 90 },
  garden: { name: 'Glow garden', description: 'A glowing attraction. Guests arrive more often.', adjacency: 'Next to the restaurant: 50% stronger. Next to homes: crew work faster.', looks: ['Anemone bed', 'Jelly garden', 'Bioluminescent grove'], buildCost: 250, buildSeconds: 60 },
  workshop: { name: 'Workshop', description: 'Mareen engineers. All building and upgrading finishes faster.', adjacency: '', looks: ['Driftwood shed', 'Stone workshop', 'Crystal forge'], buildCost: 500, buildSeconds: 150 },
};
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

export const plotAt = (town: Town, x: number, z: number): Plot | undefined => town.plots.find(p => p.x === x && p.z === z);
export const neighbours = (town: Town, plot: Pick<Plot, 'x' | 'z'>): Plot[] => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => plotAt(town, plot.x + dx, plot.z + dz)).filter((p): p is Plot => Boolean(p));
/** The art look (1–3) for a level: levels 1–5, 6–10 and 11–15 share one image each. */
export const lookFor = (level: number): 1 | 2 | 3 => Math.min(3, Math.max(1, Math.ceil(level / LEVELS_PER_LOOK))) as 1 | 2 | 3;
export const ownedCount = (town: Town): number => town.plots.filter(p => p.owned).length;
/** Plot price grows polynomially: $250 for the first, about $3.8k by the 11th, $14k for the 25th, $93k for the last of 80. */
export const unlockCost = (town: Town): number => Math.round(250 * (1 + (ownedCount(town) - 1) * .4) ** 1.7 / 10) * 10;
export const zoneOpen = (town: Town, plot: Pick<Plot, 'x' | 'z'>): boolean => town.zones.includes(plotZone(plot));
export const canUnlock = (town: Town, plot: Plot): boolean => !plot.owned && zoneOpen(town, plot) && neighbours(town, plot).some(p => p.owned);
/** Why a plot can't be unlocked yet, or null when it can. */
export function plotLockReason(town: Town, plot: Plot): string | null {
  if (plot.owned) return 'You already own this plot.';
  if (!zoneOpen(town, plot)) return `Reach ${ZONES[plotZone(plot)].place} first.`;
  return neighbours(town, plot).some(p => p.owned) ? null : 'Unlock a plot next to your town first.';
}
/** A building's level only counts once its construction is complete. */
export const activeLevel = (plot: Plot): number => plot.job?.kind === 'build' ? 0 : plot.level;
const levelsOf = (town: Town, kind: BuildingKind): Plot[] => town.plots.filter(p => p.building === kind && activeLevel(p) > 0);
const nextTo = (town: Town, plot: Plot, kind: BuildingKind): boolean => neighbours(town, plot).some(p => p.building === kind && activeLevel(p) > 0);

export function upgradeCost(kind: BuildingKind, nextLevel: number): number {
  const base = kind === 'restaurant' ? 800 : BUILDINGS[kind].buildCost;
  return Math.round(base * .6 * nextLevel ** 1.35 / 10) * 10;
}
/** Real seconds for a job before workshop speed-ups: about a minute early on, hours near the top. */
export function baseSeconds(kind: BuildingKind, nextLevel: number): number {
  return nextLevel === 1 ? BUILDINGS[kind].buildSeconds : Math.round(60 * 1.55 ** (nextLevel - 1));
}
export const workshopSpeedup = (town: Town): number => Math.min(.45, levelsOf(town, 'workshop').reduce((sum, p) => sum + activeLevel(p) * .03, 0));
export const jobSeconds = (town: Town, kind: BuildingKind, nextLevel: number): number => Math.max(5, Math.round(baseSeconds(kind, nextLevel) * (1 - workshopSpeedup(town))));
export const busyBuilders = (town: Town): number => town.plots.filter(p => p.job).length;

/** Combined effects of finished buildings and reached zones on the restaurant. Neutral for a brand-new town. */
export interface TownEffects { kelpCost: number; fishCost: number; extraCrew: number; arrivalBonus: number; crewSpeed: number; }
export function townEffects(town: Town): TownEffects {
  const restaurantPlot = town.plots.find(p => p.building === 'restaurant')!;
  const boost = (p: Plot) => nextTo(town, p, 'restaurant') ? 1.5 : 1;
  const producer = (kind: BuildingKind) => 1 - Math.min(.6, levelsOf(town, kind).reduce((sum, p) => sum + activeLevel(p) * .04 * boost(p), 0));
  const gardens = levelsOf(town, 'garden');
  return {
    kelpCost: producer('kelpFarm'), fishCost: producer('fishery'),
    extraCrew: Math.min(6, levelsOf(town, 'homes').reduce((sum, p) => sum + 1 + Math.floor(activeLevel(p) / LEVELS_PER_LOOK), 0)),
    arrivalBonus: (activeLevel(restaurantPlot) - 1) * .03 + gardens.reduce((sum, p) => sum + activeLevel(p) * .03 * boost(p), 0) + zoneArrivalBonus(town),
    crewSpeed: 1 + Math.min(.15, gardens.filter(p => nextTo(town, p, 'homes')).reduce((sum, p) => sum + activeLevel(p) * .01, 0)),
  };
}

const percent = (n: number) => `${Math.round(n * 100)}%`;
export const nextToKind = (town: Town, plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind) => neighbours(town, plot).some(p => p.building === kind);

/** What a building does at a level, in the player's terms. */
export function effectText(town: Town, plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind, level: number): string {
  const boost = nextToKind(town, plot, 'restaurant') ? 1.5 : 1;
  if (kind === 'restaurant') return level > 1 ? `Guests arrive ${percent((level - 1) * .03)} more often` : 'Upgrade to draw guests more often';
  if (kind === 'kelpFarm') return `Kelp dishes cost ${percent(Math.min(.6, level * .04 * boost))} less to make`;
  if (kind === 'fishery') return `Fish dishes cost ${percent(Math.min(.6, level * .04 * boost))} less to make`;
  if (kind === 'homes') return `+${1 + Math.floor(level / 5)} crew slot${level >= 5 ? 's' : ''}`;
  if (kind === 'garden') return `Guests arrive ${percent(level * .03 * boost)} more often${nextToKind(town, plot, 'homes') ? ` · crew ${percent(Math.min(.15, level * .01))} faster` : ''}`;
  return `All building finishes ${percent(Math.min(.45, level * .03))} faster`;
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
