import { CELL } from './types';
import type { InstanceSpec } from '@/scene/Primitives';

export interface CityLamp { x: number; z: number; }
export interface CityBuilding { x: number; z: number; height: number; color: string; facing: number; index: number; }
export const NEON_COLORS = ['#3B9C98', '#DC533C', '#F2B743'] as const;

/** Shared anchors keep luminous details attached to scenery through restaurant expansion. */
export function cityFixtures(columns: number): { lamps: CityLamp[]; buildings: CityBuilding[] } {
  const right = columns * CELL + 4.1, center = (columns - 1) * CELL / 2;
  const lamps: CityLamp[] = [], buildings: CityBuilding[] = [];
  for (const x of [-9.3, right + 3.8]) for (const z of [-3, 5, 14.4]) lamps.push({ x: x + .9, z: z + 2 });
  for (const x of [-1, 10, right - 2]) lamps.push({ x: x + 2, z: 22.5 });
  const colors = ['#F0AB70', '#8DA69A', '#B76544', '#E4C782', '#8999A3'];
  for (let i = 0; i < 6; i++) buildings.push({ x: center - 14 + i * 5.6, z: -13.2 - i % 2 * .7, height: 4.4 + i % 3 * 1.3, color: colors[i % 5], facing: 0, index: i });
  for (let i = 0; i < 3; i++) {
    buildings.push({ x: -14, z: -1 + i * 7, height: 3.2 + (2 - i) * .6, color: colors[(i + 2) % 5], facing: Math.PI / 2, index: i });
    buildings.push({ x: right + 8.5, z: -1 + i * 7, height: 3.2 + (2 - i) * .6, color: colors[i], facing: -Math.PI / 2, index: i + 1 });
  }
  return { lamps, buildings };
}

/** A smooth photocell response: off in bright sun, warm at dusk and during dark showers. */
export function cityLightLevel(sun: number, rain: number): number {
  const darkness = .72 * (1 - sun) + .28 * rain;
  const t = Math.max(0, Math.min(1, (darkness - .25) / .5));
  return t * t * (3 - 2 * t);
}

/** Slow, staggered shimmer, never a flash or an on/off flicker. No independent wall clock. */
export function neonShimmer(time: number, channel: number, reduced: boolean): number {
  return reduced ? 1 : .94 + .06 * Math.sin(time * .85 + channel * 2.1);
}

/** Thin cornice tubes and small sign frames; all geometry stays on the existing buildings. */
export function neonPieces(buildings: readonly CityBuilding[], channel: number): InstanceSpec[] {
  const pieces: InstanceSpec[] = [];
  buildings.forEach((b, i) => {
    if (i % NEON_COLORS.length !== channel) return;
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => pieces.push({ position: [b.x + x * Math.cos(b.facing) + z * Math.sin(b.facing), y - 1.03, b.z - x * Math.sin(b.facing) + z * Math.cos(b.facing)], scale: [sx, sy, sz], rotation: [0, b.facing, 0], color: NEON_COLORS[channel] });
    for (const side of [-1, 1]) {
      add(0, b.height + .015, side * 2.075, 4.5, .075, .075);
      add(side * 2.275, b.height + .015, 0, .075, .075, 4.15);
      add(0, 2.05 + side * .22, 2.13, 2.55, .055, .045);
      add(side * 1.25, 2.05, 2.13, .055, .44, .045);
    }
    for (let j = 0; j < 6; j++) add(-.72 + j * .29, 2.05, 2.105, .13, .1, .03);
  });
  return pieces;
}
