import type { RestaurantEngine } from '@/management/engine';
import { PARCEL, TOWN_SIZE, addRoads, plotAt, plotRegion, siteIn, streetTiles, type Building, type BuildingKind, type Town } from '@/management/town';
import { inHome, parseRegionId, regionCenter } from '@/management/world';

/** The restaurant's plot (the middle of the home town). */
export const C = Math.floor(TOWN_SIZE / 2);
/** The streets of every plot on an L-shaped route from one plot to another, so the two are joined by road. */
export function joinRoads(town: Town, from: { x: number; z: number }, to = { x: C, z: C }): void {
  const keys: string[] = [];
  for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) keys.push(...streetTiles(x, from.z));
  for (let z = Math.min(from.z, to.z); z <= Math.max(from.z, to.z); z++) keys.push(...streetTiles(to.x, z));
  addRoads(town, keys);
}
/** The plot a building there would reach by road: the restaurant's at home, the region's middle plot (its branch site) elsewhere. */
const hubPlot = (px: number, pz: number) => { if (inHome({ x: px, z: pz })) return { x: C, z: C }; const r = parseRegionId(plotRegion({ x: px, z: pz }))!; return regionCenter(r.x, r.y); };
/** Put a finished building on a plot's corner (tests only): the plot is owned and roads join it to the restaurant (or its region's branch site). */
export function put(town: Town, kind: BuildingKind, px: number, pz: number, level = 1, extra: Partial<Building> = {}): Building {
  plotAt(town, px, pz)!.owned = true; joinRoads(town, { x: px, z: pz }, hubPlot(px, pz));
  const b: Building = { id: town.nextBuildingId++, kind, x: px * PARCEL, z: pz * PARCEL, turned: false, wide: false, level, job: null, ...extra };
  town.buildings.push(b); return b;
}
/** The building whose corner is on a plot. */
export const on = (town: Town, px: number, pz: number): Building | undefined => town.buildings.find(b => b.x === px * PARCEL && b.z === pz * PARCEL);
/** Start a building through the engine on the first free spot of a plot. */
export function buildOn(e: RestaurantEngine, kind: BuildingKind, px: number, pz: number): string | null {
  const spot = siteIn(e.state.town, kind, px, pz) ?? { x: px * PARCEL, z: pz * PARCEL, turned: false };
  return e.build(kind, spot.x, spot.z, spot.turned);
}
