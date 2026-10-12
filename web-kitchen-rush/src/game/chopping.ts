import type { ChefActionEffect, Item, Station } from './types';

/** Six contact beats keep the original 1.8-second preparation time. */
export const CHOP_SECONDS = 1.8;
export const CHOP_CUTS = 6;
export const CHOP_CONTACT_HOLD = .045;
export const KNIFE_LIFT_HEIGHT = .36;
/** Socket calibrated to the brown handle of the existing generated cleaver. */
export const KNIFE_GRIP: [number, number, number] = [0, .32, -.34];
export type Vegetable = 'tomato' | 'lettuce';

/** Narrow to ingredients that the chopping board can prepare. */
export function isVegetable(item: Item | null): item is Extract<Item, { state: string }> & { kind: Vegetable } {
  return item !== null && 'state' in item && (item.kind === 'tomato' || item.kind === 'lettuce');
}

/** Shared by simulation, knife and cut geometry; epsilon absorbs fixed-step rounding. */
export function completedCuts(progress: number): number {
  return Math.min(CHOP_CUTS, Math.max(0, Math.floor(progress * CHOP_CUTS + 1e-8)));
}

/** The uncut portion is clipped, never squashed, along this board-local plane. */
export function cutPosition(cut: number): number { return -.275 + cut * .55 / CHOP_CUTS; }

/** Item identity prevents a previous tomato's impact animating a replacement tomato. */
export function latestChop(effects: readonly ChefActionEffect[], station: Station): ChefActionEffect | undefined {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    if (effect.kind === 'chop' && effect.stationId === station.id && effect.item === station.item) return effect;
  }
}

/** A deliberate lift followed by a quicker downstroke, sampled from work progress. */
export function knifeLift(progress: number): number {
  const phase = (progress * CHOP_CUTS) % 1;
  if (phase < .16) return 0;
  if (phase < .68) { const t = (phase - .16) / .52; return t * t * (3 - 2 * t) * KNIFE_LIFT_HEIGHT; }
  const t = (phase - .68) / .32;
  return (1 - t * t * (3 - 2 * t)) * KNIFE_LIFT_HEIGHT;
}

/** Advance across the vegetable during the lift, never slide a grounded blade. */
export function knifeCutPosition(progress: number): number {
  const count = completedCuts(progress);
  if (count === 0) return cutPosition(1);
  const phase = (progress * CHOP_CUTS) % 1;
  const t = Math.max(0, Math.min(1, (phase - .2) / .45));
  return cutPosition(count + t * t * (3 - 2 * t));
}

/** Short, bounded settling motion for the newest cut, neutral for reduced motion. */
export function sliceSettle(age: number, reduced: boolean): { travel: number; hop: number } {
  if (reduced || age >= .24 || age < 0) return { travel: 1, hop: 0 };
  const t = age / .24;
  return { travel: 1 - (1 - t) ** 3, hop: Math.sin(t * Math.PI) * .055 };
}
