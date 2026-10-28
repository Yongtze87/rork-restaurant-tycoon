import { z } from 'zod';
import { ZONES, zoneArrivalBonus, zoneForRing, zoneId, type ZoneId } from './zones';
import { HOME_ID, HOME_SIZE, PARCEL, WORLD_LIMIT, inHome, parseRegionId, regionBlock, regionCenter, regionOfPlot } from './world';
import { regionById, type BoostKind } from './ocean';

/**
 * The reef town and the world around it: one grid of plots the owner unlocks and builds on. The Home Reef
 * town (the restaurant and its depth-zone rings) is region (0, 0); claimed ocean regions add their own blocks
 * of plots around it on the same grid (see `world.ts`). Each plot is 4×4 tiles: buildings of different sizes and
 * roads sit on tiles, and a building works once a road joins it to the restaurant or a branch.
 * Construction runs on real (wall-clock) time, so it also finishes while the player is away. Everything here is pure; the engine applies results to the restaurant.
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
const tile = z.number().int().min(-WORLD_LIMIT * PARCEL).max(WORLD_LIMIT * PARCEL);
const plotSchema = z.object({ x: coordinate, z: coordinate, owned: z.boolean() });
export type Plot = Validated<z.infer<typeof plotSchema>>;
/** A building on the tile grid: (x, z) is its corner tile; `turned` swaps its width and depth. */
const buildingSchema = z.object({ id: z.number().int().nonnegative(), kind: buildingKind, x: tile, z: tile, turned: z.boolean().default(false), /** The restaurant with its east grotto: one tile wider. */ wide: z.boolean().default(false), level: z.number().int().min(0).max(MAX_LEVEL), job: jobSchema.nullable() });
export type Building = Validated<z.infer<typeof buildingSchema>>;
const ROAD_KEY = /^-?\d{1,7},-?\d{1,7}$/;
const center = Math.floor(TOWN_SIZE / 2);
const emptyPlot = (x: number, z: number): Plot => ({ x, z, owned: false });
export { PARCEL };
export const tileKey = (x: number, z: number): string => `${x},${z}`;
/** The two streets of a plot: its last row and last column of tiles. Neighbouring plots' streets join up. */
export const streetTiles = (px: number, pz: number): string[] => {
  const list: string[] = [];
  for (let i = 0; i < PARCEL; i++) list.push(tileKey(px * PARCEL + i, pz * PARCEL + PARCEL - 1));
  for (let i = 0; i < PARCEL - 1; i++) list.push(tileKey(px * PARCEL + PARCEL - 1, pz * PARCEL + i));
  return list;
};
/** Move a 5×5 town into the middle of the 9×9 grid, keeping every plot, building, level and job. */
function centreLegacyTown(raw: object): object {
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
  for (let z = 0; z < TOWN_SIZE; z++) for (let x = 0; x < TOWN_SIZE; x++) plots.push(moved.get(`${x},${z}`) ?? { ...emptyPlot(x, z), building: null, level: 0, job: null });
  return { ...raw, plots };
}
/** Towns from before tiles had one building per plot: each moves to its plot's corner, and every owned plot gets its streets. */
function tileLegacyTown(raw: object): object {
  if (Array.isArray((raw as { buildings?: unknown }).buildings)) return raw;
  const buildings: unknown[] = [], roads = new Set<string>();
  for (const plot of (raw as { plots: unknown[] }).plots) {
    const p = plot as { x?: unknown; z?: unknown; owned?: unknown; building?: unknown; level?: unknown; job?: unknown };
    if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
    if (p.owned) for (const key of streetTiles(p.x, p.z)) roads.add(key);
    if (typeof p.building === 'string') buildings.push({ id: buildings.length + 1, kind: p.building, x: p.x * PARCEL, z: p.z * PARCEL, turned: false, level: p.level, job: p.job ?? null });
  }
  return { ...raw, buildings, roads: [...roads], nextBuildingId: buildings.length + 1 };
}
export function migrateTown(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { plots?: unknown }).plots)) return raw;
  return tileLegacyTown(centreLegacyTown(raw));
}
export const townSchema = z.preprocess(migrateTown, z.object({
  /** The 81 home plots, then the plots of every claimed region (49 each). */
  plots: z.array(plotSchema).min(TOWN_SIZE * TOWN_SIZE).max(TOWN_SIZE * TOWN_SIZE + 49 * 2000)
    .refine(list => list.filter(inHome).length === TOWN_SIZE * TOWN_SIZE && new Set(list.map(p => `${p.x},${p.z}`)).size === list.length && list.every(p => regionOfPlot(p.x, p.z) !== null), 'Invalid plots'),
  buildings: z.array(buildingSchema).max(200_000).refine(list => list.filter(b => b.kind === 'restaurant').length === 1 && new Set(list.map(b => b.id)).size === list.length, 'Invalid buildings'),
  roads: z.array(z.string().regex(ROAD_KEY)).max(800_000),
  nextBuildingId: z.number().int().positive(),
  builders: z.number().int().min(1).max(MAX_BUILDERS),
  pearls: z.number().int().nonnegative(), charms: z.object({ current: z.number().int().nonnegative(), tide: z.number().int().nonnegative() }), lastGiftDay: z.string().max(10),
  zones: z.array(zoneId).max(4).default(['shallows']).refine(list => list.includes('shallows') && new Set(list).size === list.length, 'Invalid zones'),
}));
export type Town = Validated<z.infer<typeof townSchema>>;

export interface BuildingInfo { name: string; description: string; adjacency: string; /** Tiles wide × deep (before turning). */ size: [number, number]; looks: [string, string, string]; buildCost: number; buildSeconds: number; }
export const BUILDINGS: Record<BuildingKind, BuildingInfo> = {
  restaurant: { size: [3, 3], name: 'Restaurant', description: 'Your restaurant. Each level draws guests a little more often.', adjacency: '', looks: ['Reef shack', 'Coral hall', 'Bubble-dome palace'], buildCost: 0, buildSeconds: 0 },
  kelpFarm: { size: [3, 2], name: 'Kelp farm', description: 'Grows your own kelp. Kelp dishes cost less to make.', adjacency: 'Near the restaurant or a branch: 50% stronger.', looks: ['Kelp patch', 'Kelp terraces', 'Glowing kelp forest'], buildCost: 300, buildSeconds: 90 },
  fishery: { size: [2, 3], name: 'Fishery', description: 'Catches your own fish. Fish dishes cost less to make.', adjacency: 'Near the restaurant or a branch: 50% stronger.', looks: ['Fish traps', 'Net house', 'Pearl-shell fishery'], buildCost: 350, buildSeconds: 120 },
  homes: { size: [2, 2], name: 'Mareen homes', description: 'Room for more crew. +1 crew slot, +1 more every 5 levels.', adjacency: 'Near a glow garden: crew work faster.', looks: ['Shell huts', 'Coral cottages', 'Pearl villas'], buildCost: 300, buildSeconds: 90 },
  garden: { size: [2, 1], name: 'Glow garden', description: 'A glowing attraction. Guests arrive more often.', adjacency: 'Near the restaurant or a branch: 50% stronger. Near homes: crew work faster.', looks: ['Anemone bed', 'Jelly garden', 'Bioluminescent grove'], buildCost: 250, buildSeconds: 60 },
  workshop: { size: [2, 3], name: 'Workshop', description: 'Mareen engineers. All building and upgrading finishes faster.', adjacency: '', looks: ['Driftwood shed', 'Stone workshop', 'Crystal forge'], buildCost: 500, buildSeconds: 150 },
  branch: { size: [3, 3], name: 'Branch restaurant', description: 'A second restaurant your crew runs on its own. It earns money at the end of every shift.', adjacency: 'One per region, outside the Home Reef. Producers and gardens near it are 50% stronger.', looks: ['Kelp kiosk', 'Coral bistro', 'Pearl brasserie'], buildCost: 1200, buildSeconds: 240 },
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
  for (let z = 0; z < TOWN_SIZE; z++) for (let x = 0; x < TOWN_SIZE; x++) plots.push({ ...emptyPlot(x, z), owned: x === center && z === center });
  const restaurant: Building = { id: 1, kind: 'restaurant', x: center * PARCEL, z: center * PARCEL, turned: false, wide: false, level: 1, job: null };
  return { plots, buildings: [restaurant], roads: streetTiles(center, center), nextBuildingId: 2, builders: 1, pearls: 5, charms: { current: 1, tide: 0 }, lastGiftDay: '', zones: ['shallows'] };
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
/** The plot a tile lies in. */
export const parcelOf = (x: number, z: number): { x: number; z: number } => ({ x: Math.floor(x / PARCEL), z: Math.floor(z / PARCEL) });
/** The plot holding a building's corner (its region, zone and modifiers). */
export const buildingPlot = (b: Pick<Building, 'x' | 'z'>) => parcelOf(b.x, b.z);
export const plotOfTile = (town: Pick<Town, 'plots'>, x: number, z: number): Plot | undefined => { const p = parcelOf(x, z); return plotAt(town, p.x, p.z); };

/** A building's tiles as an inclusive rectangle. */
export interface Rect { x0: number; z0: number; x1: number; z1: number; }
export interface Spot { kind: BuildingKind; x: number; z: number; turned: boolean; wide?: boolean; }
export const footprint = (kind: BuildingKind, turned: boolean, wide = false): { w: number; d: number } => { const [w0, d] = BUILDINGS[kind].size, w = w0 + (wide ? 1 : 0); return turned ? { w: d, d: w } : { w, d }; };
export const rectOf = (s: Pick<Spot, 'kind' | 'x' | 'z' | 'turned' | 'wide'>): Rect => { const { w, d } = footprint(s.kind, s.turned, s.wide); return { x0: s.x, z0: s.z, x1: s.x + w - 1, z1: s.z + d - 1 }; };
export function rectTiles(r: Rect): [number, number][] { const list: [number, number][] = []; for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) list.push([x, z]); return list; }
/** The tiles along a rectangle's four sides (not its corners): where a road must be for the building to reach it. */
export function rectEdge(r: Rect): [number, number][] {
  const list: [number, number][] = [];
  for (let x = r.x0; x <= r.x1; x++) list.push([x, r.z0 - 1], [x, r.z1 + 1]);
  for (let z = r.z0; z <= r.z1; z++) list.push([r.x0 - 1, z], [r.x1 + 1, z]);
  return list;
}
/** Empty tiles between two rectangles (0 when they touch). "Near" means at most one tile apart, e.g. across a road. */
export const gap = (a: Rect, b: Rect): number => Math.max(0, b.x0 - a.x1 - 1, a.x0 - b.x1 - 1, b.z0 - a.z1 - 1, a.z0 - b.z1 - 1);
export const NEAR = 1;

/** Caches keyed on the arrays the engine replaces when roads or buildings change. */
const roadCache = new WeakMap<string[], Set<string>>();
export function roadSet(town: Pick<Town, 'roads'>): Set<string> {
  let hit = roadCache.get(town.roads); if (!hit) { hit = new Set(town.roads); roadCache.set(town.roads, hit); } return hit;
}
export const isRoad = (town: Pick<Town, 'roads'>, x: number, z: number): boolean => roadSet(town).has(tileKey(x, z));
const signature = (list: Building[]) => list.map(b => `${b.id}:${b.kind}:${b.x}:${b.z}:${b.turned ? 1 : 0}${b.wide ? 'w' : ''}`).join('|');
const occupancyCache = new WeakMap<Building[], { sig: string; map: Map<string, Building> }>();
/** Which building covers each tile. */
export function occupancy(town: Pick<Town, 'buildings'>): Map<string, Building> {
  const sig = signature(town.buildings); let hit = occupancyCache.get(town.buildings);
  if (!hit || hit.sig !== sig) { const map = new Map<string, Building>(); for (const b of town.buildings) for (const [x, z] of rectTiles(rectOf(b))) map.set(tileKey(x, z), b); hit = { sig, map }; occupancyCache.set(town.buildings, hit); }
  return hit.map;
}
export const buildingAt = (town: Pick<Town, 'buildings'>, x: number, z: number): Building | undefined => occupancy(town).get(tileKey(x, z));
export const buildingById = (town: Pick<Town, 'buildings'>, id: number): Building | undefined => town.buildings.find(b => b.id === id);
export const restaurantOf = (town: Pick<Town, 'buildings'>): Building => town.buildings.find(b => b.kind === 'restaurant')!;
const isHub = (b: Building) => b.kind === 'restaurant' || b.kind === 'branch';
const networkCache = new WeakMap<string[], { sig: string; set: Set<string> }>();
/** Road tiles joined, road by road, to the restaurant or a branch. Buildings along them work; the rest wait for a road. */
export function network(town: Pick<Town, 'roads' | 'buildings'>): Set<string> {
  const hubs = town.buildings.filter(isHub), sig = signature(hubs); const hit = networkCache.get(town.roads);
  if (hit && hit.sig === sig) return hit.set;
  const roads = roadSet(town), set = new Set<string>(), queue: [number, number][] = [];
  for (const h of hubs) for (const [x, z] of rectEdge(rectOf(h))) { const key = tileKey(x, z); if (roads.has(key) && !set.has(key)) { set.add(key); queue.push([x, z]); } }
  while (queue.length) {
    const [x, z] = queue.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const key = tileKey(x + dx, z + dz); if (roads.has(key) && !set.has(key)) { set.add(key); queue.push([x + dx, z + dz]); } }
  }
  networkCache.set(town.roads, { sig, set }); return set;
}
const touches = (r: Rect, tiles: Set<string>) => rectEdge(r).some(([x, z]) => tiles.has(tileKey(x, z)));
/** A building works once a road joins it to the restaurant or a branch, or it stands right against one (those two always work). */
export function connected(town: Pick<Town, 'roads' | 'buildings'>, b: Building): boolean {
  const r = rectOf(b); return isHub(b) || touches(r, network(town)) || town.buildings.some(h => isHub(h) && gap(r, rectOf(h)) === 0);
}
/** Why the restaurant can't grow by a row of tiles for the east grotto, or null. Roads in the way are lifted, buildings are not. */
export function grottoSpaceError(town: Town): string | null {
  const hall = restaurantOf(town); if (hall.wide) return null;
  const old = rectOf(hall), taken = occupancy(town);
  for (const [x, z] of rectTiles(rectOf({ ...hall, wide: true }))) {
    if (x >= old.x0 && x <= old.x1 && z >= old.z0 && z <= old.z1) continue;
    if (!plotOfTile(town, x, z)?.owned) return 'The grotto needs a row of your own land beside the restaurant in town. Unlock that plot first.';
    const other = taken.get(tileKey(x, z)); if (other) return `The grotto needs the row of tiles beside the restaurant in town. Move the ${BUILDINGS[other.kind].name.toLowerCase()} there first.`;
  }
  return null;
}
/** Grow the restaurant by its grotto row, lifting roads in the way. Returns how many road tiles were lifted. */
export function widenRestaurant(town: Town): number {
  const hall = restaurantOf(town), keys = new Set(rectTiles(rectOf({ ...hall, wide: true })).map(([x, z]) => tileKey(x, z))), before = town.roads.length;
  town.roads = town.roads.filter(k => !keys.has(k)); hall.wide = true; return before - town.roads.length;
}

/** The region a plot belongs to ("0,0" for the home town). */
export const plotRegion = (plot: Pick<Plot, 'x' | 'z'>): string => regionOfPlot(plot.x, plot.z) ?? HOME_ID;
export const buildingRegion = (b: Pick<Building, 'x' | 'z'>): string => plotRegion(buildingPlot(b));
export const plotsIn = (town: Pick<Town, 'plots'>, id: string): Plot[] => town.plots.filter(p => regionOfPlot(p.x, p.z) === id);
export const buildingsIn = (town: Pick<Town, 'buildings'>, id: string): Building[] => town.buildings.filter(b => buildingRegion(b) === id);
/** Fresh plots for a newly claimed region: its middle plot (the branch site) comes owned. */
export function regionPlots(id: string): Plot[] {
  const p = parseRegionId(id)!, b = regionBlock(p.x, p.y), c = regionCenter(p.x, p.y), list: Plot[] = [];
  for (let z = b.z0; z < b.z0 + b.size; z++) for (let x = b.x0; x < b.x0 + b.size; x++) list.push({ ...emptyPlot(x, z), owned: x === c.x && z === c.z });
  return list;
}
/** Add roads that are not there yet (the array is replaced, so caches see the change). */
export function addRoads(town: Town, keys: string[]): void { const have = roadSet(town), fresh = keys.filter(k => !have.has(k)); if (fresh.length) town.roads = [...town.roads, ...fresh]; }
/** A claimed region's plots appear with streets on its middle plot, ready for a branch. */
export function addRegion(town: Town, id: string): void {
  const p = parseRegionId(id)!, c = regionCenter(p.x, p.y);
  town.plots.push(...regionPlots(id)); addRoads(town, streetTiles(c.x, c.z));
}
/** Add the plots of every claimed region that has none yet (claims from older saves); returns how many regions were filled. */
export function ensureRegionPlots(town: Town, regions: readonly string[]): number {
  let filled = 0;
  for (const id of regions) {
    const p = parseRegionId(id); if (!p || id === HOME_ID) continue;
    const c = regionCenter(p.x, p.y); if (plotAt(town, c.x, c.z)) continue;
    addRegion(town, id); filled++;
  }
  return filled;
}
/** Region modifiers that apply to a plot (neutral at home). */
export const plotModifiers = (plot: Pick<Plot, 'x' | 'z'>) => regionById(plotRegion(plot))!.modifiers;
const boostOf = (plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind): number => inHome(plot) ? 1 : plotModifiers(plot).boost[kind as BoostKind] ?? 1;
export const branchIn = (town: Pick<Town, 'buildings'>, id: string): Building | undefined => id === HOME_ID ? undefined : town.buildings.find(b => b.kind === 'branch' && buildingRegion(b) === id);
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
/** Why a building can't stand here, or null when it can. `ignore` is a building being moved. Branch rules live in the engine. */
export function placementError(town: Town, spot: Spot, ignore?: number): string | null {
  const r = rectOf(spot), roads = roadSet(town), taken = occupancy(town);
  for (const [x, z] of rectTiles(r)) {
    if (!plotOfTile(town, x, z)?.owned) return 'Part of this spot is not your land yet.';
    if (roads.has(tileKey(x, z))) return 'A road is in the way.';
    const other = taken.get(tileKey(x, z)); if (other && other.id !== ignore) return 'Another building is in the way.';
  }
  return touches(r, roads) ? null : 'Buildings need a road along one side.';
}
/** Why a road can't go on a tile, or null. */
export function roadError(town: Town, x: number, z: number): string | null {
  if (!plotOfTile(town, x, z)?.owned) return 'Roads go on your own land.';
  if (isRoad(town, x, z)) return 'There is a road here already.';
  return buildingAt(town, x, z) ? 'A building is in the way.' : null;
}
/** A free spot for a building inside one plot, joined to the road network when possible; null when none fits. */
export function siteIn(town: Town, kind: BuildingKind, px: number, pz: number): Spot | null {
  let loose: Spot | null = null;
  for (const turned of [false, true]) for (let lz = 0; lz < PARCEL; lz++) for (let lx = 0; lx < PARCEL; lx++) {
    const spot: Spot = { kind, x: px * PARCEL + lx, z: pz * PARCEL + lz, turned }, r = rectOf(spot);
    if (r.x1 >= (px + 1) * PARCEL || r.z1 >= (pz + 1) * PARCEL || placementError(town, spot) !== null) continue;
    if (touches(r, network(town))) return spot;
    loose ??= spot;
  }
  return loose;
}
/** A building's level only counts once its construction is complete. */
export const activeLevel = (b: Pick<Building, 'level' | 'job'>): number => b.job?.kind === 'build' ? 0 : b.level;
/** Finished buildings that a road joins to the restaurant or a branch: the ones whose effects count. */
const working = (town: Town, kind: BuildingKind): Building[] => town.buildings.filter(b => b.kind === kind && activeLevel(b) > 0 && connected(town, b));
const nearKind = (town: Town, r: Rect, kind: BuildingKind, finishedOnly: boolean): boolean => town.buildings.some(b => b.kind === kind && (!finishedOnly || activeLevel(b) > 0) && gap(r, rectOf(b)) <= NEAR);
/** Producers and gardens are stronger near the restaurant or a branch. */
const hub = (town: Town, b: Building): boolean => nearKind(town, rectOf(b), 'restaurant', true) || nearKind(town, rectOf(b), 'branch', true);

/** Balance knobs for building upgrades and producers; see docs/BALANCE.md for the reasoning. */
export const TOWN_BALANCE = { restaurantUpgradeBase: 600, upgradeExponent: 1.6, producerPerLevel: .06, producerCap: .6, gardenPerLevel: .03, gardenCap: .5, workshopPerLevel: .03, workshopCap: .45, branchBase: 30, branchExponent: 1, road: 10 } as const;
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
export const workshopSpeedup = (town: Town): number => Math.min(TOWN_BALANCE.workshopCap, working(town, 'workshop').reduce((sum, b) => sum + activeLevel(b) * TOWN_BALANCE.workshopPerLevel * boostOf(buildingPlot(b), 'workshop'), 0));
/** Real seconds for a job; `timeFactor` is the region's build time (1 at home). */
export const jobSeconds = (town: Town, kind: BuildingKind, nextLevel: number, timeFactor = 1): number => Math.max(5, Math.round(baseSeconds(kind, nextLevel) * (1 - workshopSpeedup(town)) * timeFactor));
export const busyBuilders = (town: Town): number => town.buildings.filter(b => b.job).length;

/** Combined effects of working buildings and reached zones on the restaurant. Neutral for a brand-new town. */
export interface TownEffects { kelpCost: number; fishCost: number; extraCrew: number; arrivalBonus: number; crewSpeed: number; }
/** Every town bonus before and after its cap, so the player can see where they stand. */
export interface TownBreakdown {
  /** Raw sums (before caps) and the caps they run up against. */
  gardens: number; gardenCap: number; kelp: number; fish: number; producerCap: number; homes: number; crewCap: number;
  restaurant: number; zones: number; crewSpeed: number; crewSpeedCap: number; workshop: number; workshopCap: number;
  /** Buildings that stand idle because no road reaches them. */ idle: number;
}
export function townBreakdown(town: Town): TownBreakdown {
  // Hub bonus × the region's specialisation; town-wide caps apply to the sums.
  const boost = (b: Building) => (hub(town, b) ? 1.5 : 1) * boostOf(buildingPlot(b), b.kind);
  const producer = (kind: BuildingKind) => working(town, kind).reduce((sum, b) => sum + activeLevel(b) * TOWN_BALANCE.producerPerLevel * boost(b), 0);
  const gardens = working(town, 'garden');
  return {
    gardens: gardens.reduce((sum, b) => sum + activeLevel(b) * TOWN_BALANCE.gardenPerLevel * boost(b), 0), gardenCap: TOWN_BALANCE.gardenCap,
    kelp: producer('kelpFarm'), fish: producer('fishery'), producerCap: TOWN_BALANCE.producerCap,
    homes: working(town, 'homes').reduce((sum, b) => sum + 1 + Math.floor(activeLevel(b) / LEVELS_PER_LOOK), 0), crewCap: 6,
    restaurant: (activeLevel(restaurantOf(town)) - 1) * .03, zones: zoneArrivalBonus(town),
    crewSpeed: gardens.filter(b => nearKind(town, rectOf(b), 'homes', true)).reduce((sum, b) => sum + activeLevel(b) * .01, 0), crewSpeedCap: .15,
    workshop: working(town, 'workshop').reduce((sum, b) => sum + activeLevel(b) * TOWN_BALANCE.workshopPerLevel * boostOf(buildingPlot(b), 'workshop'), 0), workshopCap: TOWN_BALANCE.workshopCap,
    idle: town.buildings.filter(b => activeLevel(b) > 0 && !connected(town, b)).length,
  };
}
export function townEffects(town: Town): TownEffects {
  const t = townBreakdown(town);
  return {
    kelpCost: 1 - Math.min(t.producerCap, t.kelp), fishCost: 1 - Math.min(t.producerCap, t.fish), extraCrew: Math.min(t.crewCap, t.homes),
    arrivalBonus: t.restaurant + Math.min(t.gardenCap, t.gardens) + t.zones, crewSpeed: 1 + Math.min(t.crewSpeedCap, t.crewSpeed),
  };
}
/** The few words a card shows for a building's effect at a level ("+5% guests"); the full sentence is `effectText`. */
export function shortEffect(town: Town, spot: Spot, level: number, fameBranch = 0): string {
  const kind = spot.kind, plot = parcelOf(spot.x, spot.z), boost = (nearHub(town, spot) ? 1.5 : 1) * boostOf(plot, kind), pct = (n: number) => `${Math.round(n * 100)}%`;
  if (kind === 'branch') return `$${branchIncome(level, plotModifiers(plot).branchIncome, fameBranch).toLocaleString('en-US')}/shift`;
  if (kind === 'restaurant') return `+${pct((level - 1) * .03)} guests`;
  if (kind === 'kelpFarm') return `Kelp −${pct(Math.min(TOWN_BALANCE.producerCap, level * TOWN_BALANCE.producerPerLevel * boost))}`;
  if (kind === 'fishery') return `Fish −${pct(Math.min(TOWN_BALANCE.producerCap, level * TOWN_BALANCE.producerPerLevel * boost))}`;
  if (kind === 'homes') return `+${1 + Math.floor(level / 5)} crew`;
  if (kind === 'garden') return `+${pct(level * TOWN_BALANCE.gardenPerLevel * boost)} guests`;
  return `Builds ${pct(Math.min(TOWN_BALANCE.workshopCap, level * TOWN_BALANCE.workshopPerLevel * boost))} faster`;
}

const percent = (n: number) => `${Math.round(n * 100)}%`;
/** A kind of building stands near this spot (finished or not). */
export const nearSpot = (town: Town, spot: Spot, kind: BuildingKind): boolean => nearKind(town, rectOf(spot), kind, false);
/** The hub bonus applies here: near the restaurant or a branch. */
export const nearHub = (town: Town, spot: Spot): boolean => nearSpot(town, spot, 'restaurant') || nearSpot(town, spot, 'branch');

/** What a building does at a level on a spot, in the player's terms. `fameBranch` is the fame bonus on branch income. */
export function effectText(town: Town, spot: Spot, level: number, fameBranch = 0): string {
  const kind = spot.kind, plot = parcelOf(spot.x, spot.z), boost = (nearHub(town, spot) ? 1.5 : 1) * boostOf(plot, kind);
  if (kind === 'branch') return `Earns $${branchIncome(level, plotModifiers(plot).branchIncome, fameBranch).toLocaleString('en-US')} at the end of every shift`;
  if (kind === 'restaurant') return level > 1 ? `Guests arrive ${percent((level - 1) * .03)} more often` : 'Upgrade to draw guests more often';
  if (kind === 'kelpFarm') return `Kelp dishes cost ${percent(Math.min(TOWN_BALANCE.producerCap, level * TOWN_BALANCE.producerPerLevel * boost))} less to make`;
  if (kind === 'fishery') return `Fish dishes cost ${percent(Math.min(TOWN_BALANCE.producerCap, level * TOWN_BALANCE.producerPerLevel * boost))} less to make`;
  if (kind === 'homes') return `+${1 + Math.floor(level / 5)} crew slot${level >= 5 ? 's' : ''}`;
  if (kind === 'garden') return `Guests arrive ${percent(level * TOWN_BALANCE.gardenPerLevel * boost)} more often (all gardens: up to ${percent(TOWN_BALANCE.gardenCap)})${nearSpot(town, spot, 'homes') ? ` · crew ${percent(Math.min(.15, level * .01))} faster` : ''}`;
  return `All building finishes ${percent(Math.min(TOWN_BALANCE.workshopCap, level * TOWN_BALANCE.workshopPerLevel * boost))} faster`;
}
/** Finish every job whose end time has passed. Returns the buildings that just completed. */
export function completeJobs(town: Town, now: number): Building[] {
  const done = town.buildings.filter(b => b.job && b.job.endsAt <= now);
  for (const b of done) { if (b.job!.kind === 'upgrade') b.level++; b.job = null; }
  return done;
}
/** Pearls to finish a job now: 1 per started 6 minutes left. */
export const finishCost = (job: Job, now: number): number => Math.max(1, Math.ceil(Math.max(0, job.endsAt - now) / 360_000));
export const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);
