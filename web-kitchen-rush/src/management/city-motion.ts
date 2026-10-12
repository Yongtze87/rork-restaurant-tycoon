import { CELL } from './types';

/** Rounded, distance-parametrized paths keep traffic in separated lanes at constant speed. */
export interface CityLoop { left: number; right: number; back: number; front: number; radius: number; length: number; }
export interface StreetPose { x: number; z: number; yaw: number; }
export function cityLoop(columns: number, offset = 0): CityLoop {
  const left = -5.5 - offset, right = columns * CELL + 4.1 + offset;
  const back = -5.7 - offset, front = 18.7 + offset, radius = 4.2 + offset;
  return { left, right, back, front, radius, length: 2 * (right - left + front - back - 4 * radius) + 2 * Math.PI * radius };
}
/** Mutates a reusable pose, avoiding per-frame geometry/vector allocations. */
export function sampleStreet(loop: CityLoop, distance: number, direction: 1 | -1, out: StreetPose): StreetPose {
  const { left, right, back, front, radius: r, length } = loop;
  let d = ((distance % length) + length) % length;
  const w = right - left - 2 * r, h = front - back - 2 * r, arc = Math.PI * r / 2;
  const line = (x: number, z: number, dx: number, dz: number) => { out.x = x + dx * d; out.z = z + dz * d; out.yaw = Math.atan2(dx * direction, dz * direction); };
  const turn = (x: number, z: number, start: number) => { const a = start + d / r; out.x = x + Math.cos(a) * r; out.z = z + Math.sin(a) * r; out.yaw = Math.atan2(-Math.sin(a) * direction, Math.cos(a) * direction); };
  if (d < w) line(left + r, back, 1, 0);
  else if ((d -= w) < arc) turn(right - r, back + r, -Math.PI / 2);
  else if ((d -= arc) < h) line(right, back + r, 0, 1);
  else if ((d -= h) < arc) turn(right - r, front - r, 0);
  else if ((d -= arc) < w) line(right - r, front, -1, 0);
  else if ((d -= w) < arc) turn(left + r, front - r, Math.PI / 2);
  else if ((d -= arc) < h) line(left, front - r, 0, -1);
  else { d -= h; turn(left + r, back + r, Math.PI); }
  return out;
}
/** Ambient traffic never advances the restaurant clock or creates paying guests. */
export function cityDelta(dt: number, phase: 'planning' | 'service' | 'report', paused: boolean, speed: number, hidden: boolean, reduced: boolean): number {
  if (!Number.isFinite(dt) || dt <= 0 || hidden || reduced || paused || phase === 'report') return 0;
  return Math.min(dt, .1) * (phase === 'service' ? speed : 1);
}
export const CITY_CARS = 6;
export const CITY_WALKERS = 6;
