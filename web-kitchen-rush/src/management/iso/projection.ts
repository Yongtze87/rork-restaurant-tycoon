import type { Point } from '../types';

/** 2:1 isometric tile, in unscaled art pixels. Sprites are authored against this size. */
export const TILE_W = 64;
export const TILE_H = 32;

/** Screen position of the grid origin and the art-pixel-to-CSS-pixel scale. */
export interface View { scale: number; originX: number; originY: number; }
export interface ScreenPoint { x: number; y: number; }

export const isoX = (x: number, z: number): number => (x - z) * TILE_W / 2;
export const isoY = (x: number, z: number): number => (x + z) * TILE_H / 2;

/** Grid point (cell centers are integers) to CSS pixels; lift raises it in art pixels. */
export function toScreen(view: View, x: number, z: number, lift = 0): ScreenPoint {
  return { x: view.originX + isoX(x, z) * view.scale, y: view.originY + (isoY(x, z) - lift) * view.scale };
}

/** Inverse of toScreen on the floor plane; returns fractional grid coordinates. */
export function toGrid(view: View, sx: number, sy: number): Point {
  const u = (sx - view.originX) / view.scale / (TILE_W / 2), v = (sy - view.originY) / view.scale / (TILE_H / 2);
  return { x: (u + v) / 2, z: (v - u) / 2 };
}

/** The floor cell under a screen point, or null outside the editable grid. */
export function cellAt(view: View, sx: number, sy: number, columns: number, rows: number): Point | null {
  const p = toGrid(view, sx, sy), cell = { x: Math.round(p.x) || 0, z: Math.round(p.z) || 0 };
  return cell.x >= 0 && cell.x < columns && cell.z >= 0 && cell.z < rows ? cell : null;
}

/** Fit the whole grid plus headroom for tall props, then apply zoom and pan around that fit. */
export function fitView(width: number, height: number, columns: number, rows: number, zoom = 1, pan: ScreenPoint = { x: 0, y: 0 }): View {
  const left = isoX(-.5, rows - .5), right = isoX(columns - .5, -.5), top = isoY(-.5, -.5) - 96, bottom = isoY(columns - .5, rows - .5) + 40;
  const scale = Math.max(.05, Math.min(width / (right - left + 48), height / (bottom - top + 24)) * zoom);
  return { scale, originX: width / 2 - (left + right) / 2 * scale + pan.x, originY: height / 2 - (top + bottom) / 2 * scale + pan.y };
}

/** Painter's order: further from the viewer (smaller x + z) draws first. */
export const depthOf = (x: number, z: number): number => x + z;

/**
 * Sprites are drawn facing the viewer ("front") or away ("back"), mirrored for left/right.
 * Engine yaw is atan2(dx, dz), so the world heading is (sin, cos).
 */
export function facing(yaw: number): { back: boolean; flip: boolean } {
  const dx = Math.sin(yaw), dz = Math.cos(yaw), screenX = dx - dz, screenY = dx + dz;
  return { back: screenY < -1e-6, flip: screenX < -1e-6 };
}
