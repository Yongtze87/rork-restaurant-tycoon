/**
 * World geometry: one plot grid shared by the Home Reef town and every ocean region around it.
 * The world is a regular grid of 9×9-plot cells. Region (0, 0) is the home town and fills its cell;
 * every other region is the inner 7×7 block of its cell, so a one-plot seabed path runs around it.
 * Pure numbers only (no imports), so town, zones, ocean and the renderer can all share it.
 */
export const HOME_SIZE = 9;
/** Plots between the corners of two neighbouring cells. */
export const REGION_PITCH = 9;
/** Plots per side of a non-home region: 49 plots, room for a branch and a specialised cluster. */
export const REGION_SIZE = 7;
export const REGION_MARGIN = (REGION_PITCH - REGION_SIZE) / 2;
/** No coordinate in a save may go further out than this (2,000 regions in any direction). */
export const WORLD_LIMIT = REGION_PITCH * 2000;

export const regionId = (x: number, y: number): string => `${x},${y}`;
export const HOME_ID = '0,0';
export const REGION_ID = /^-?\d{1,6},-?\d{1,6}$/;
export function parseRegionId(id: string): { x: number; y: number } | null {
  if (!REGION_ID.test(id)) return null;
  const [x, y] = id.split(',').map(Number); return { x, y };
}
/** Rings of regions around the Home Reef (Chebyshev distance). */
export const ring = (x: number, y: number): number => Math.max(Math.abs(x), Math.abs(y));

export interface Block { x0: number; z0: number; size: number; }
/** The plots a region owns: the full cell at home, the inner 7×7 elsewhere. */
export function regionBlock(x: number, y: number): Block {
  if (x === 0 && y === 0) return { x0: 0, z0: 0, size: HOME_SIZE };
  return { x0: x * REGION_PITCH + REGION_MARGIN, z0: y * REGION_PITCH + REGION_MARGIN, size: REGION_SIZE };
}
/** The cell a world plot lies in (paths included). */
export const cellOf = (x: number, z: number): { x: number; y: number } => ({ x: Math.floor(x / REGION_PITCH), y: Math.floor(z / REGION_PITCH) });
/** The region a world plot belongs to, or null for the seabed path between regions. */
export function regionOfPlot(x: number, z: number): string | null {
  const c = cellOf(x, z), b = regionBlock(c.x, c.y);
  return x >= b.x0 && x < b.x0 + b.size && z >= b.z0 && z < b.z0 + b.size ? regionId(c.x, c.y) : null;
}
export const inHome = (p: { x: number; z: number }): boolean => p.x >= 0 && p.x < HOME_SIZE && p.z >= 0 && p.z < HOME_SIZE;
/** The middle plot of a region: the restaurant at home, the first owned plot (and branch site) elsewhere. */
export function regionCenter(x: number, y: number): { x: number; z: number } {
  const b = regionBlock(x, y), half = Math.floor(b.size / 2);
  return { x: b.x0 + half, z: b.z0 + half };
}
