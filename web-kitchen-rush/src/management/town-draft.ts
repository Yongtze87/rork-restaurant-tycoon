/** Picking tiles and placing town buildings: pure helpers shared by the town card and the shell. */
import { PARCEL, buildingAt, footprint, isRoad, network, parcelOf, placementError, rectEdge, siteIn, tileKey, type BuildingKind, type Plot, type Spot, type Town } from './town';

/** A tile on the town grid (tile coordinates; each plot is 4×4 tiles). */
export type TileRef = { x: number; z: number };
/** A building being placed (new) or moved (`id`). */
export interface TownDraft extends Spot { id?: number }
/** A free tile inside a plot (for selecting the plot), or its corner. */
export function plotTile(town: Town, plot: Pick<Plot, 'x' | 'z'>): TileRef {
  for (let lz = 0; lz < PARCEL; lz++) for (let lx = 0; lx < PARCEL; lx++) { const x = plot.x * PARCEL + lx, z = plot.z * PARCEL + lz; if (!isRoad(town, x, z) && !buildingAt(town, x, z)) return { x, z }; }
  return { x: plot.x * PARCEL, z: plot.z * PARCEL };
}
/** A plot already reached by a road joined to the restaurant or a branch. */
export function onNetwork(town: Town, plot: Pick<Plot, 'x' | 'z'>): boolean {
  const roads = network(town), r = { x0: plot.x * PARCEL, z0: plot.z * PARCEL, x1: plot.x * PARCEL + PARCEL - 1, z1: plot.z * PARCEL + PARCEL - 1 };
  return rectEdge(r).some(([x, z]) => roads.has(tileKey(x, z)));
}
export const hasBuilding = (town: Town, plot: Pick<Plot, 'x' | 'z'>) => { for (let lz = 0; lz < PARCEL; lz++) for (let lx = 0; lx < PARCEL; lx++) if (buildingAt(town, plot.x * PARCEL + lx, plot.z * PARCEL + lz)) return true; return false; };
/** Where a new building goes first: on the tapped tile if it fits (either way round), else the best free spot in that plot. */
export function draftAt(town: Town, kind: BuildingKind, tile: TileRef): TownDraft {
  for (const turned of [false, true]) { const spot = { kind, x: tile.x, z: tile.z, turned }; if (placementError(town, spot) === null) return spot; }
  const p = parcelOf(tile.x, tile.z); return siteIn(town, kind, p.x, p.z) ?? { kind, x: tile.x, z: tile.z, turned: false };
}
/** A draft centred on a tapped tile. */
export const centreDraft = (draft: TownDraft, tile: TileRef): TownDraft => { const { w, d } = footprint(draft.kind, draft.turned); return { ...draft, x: tile.x - Math.floor((w - 1) / 2), z: tile.z - Math.floor((d - 1) / 2) }; };
