import type { Recipe } from './types';

/** Short-lived presentation cues, never persisted or used to calculate the score. */
export interface ServiceReward {
  readonly id: number;
  readonly orderId: number;
  readonly chefId: number;
  readonly recipe: Recipe;
  readonly points: number;
  readonly tip: number;
  readonly total: number;
  readonly x: number;
  readonly z: number;
  readonly slot: number;
  readonly startedAt: number;
}

export const SERVICE_REWARD_SECONDS = 1.8;
export const MAX_SERVICE_REWARDS = 4;

/** Pixel-space animation keeps the reward readable at every camera zoom. */
export function sampleServiceReward(reward: ServiceReward, elapsed: number, reducedMotion: boolean): { y: number; scale: number; opacity: number; glint: number } {
  const age = elapsed - reward.startedAt;
  const visible = age >= 0 && age < SERVICE_REWARD_SECONDS;
  const baseY = reward.slot * 72;
  if (reducedMotion || !visible) return { y: baseY, scale: 1, opacity: visible ? 1 : 0, glint: 0 };
  const t = age / SERVICE_REWARD_SECONDS;
  const scale = age < .16 ? .65 + .47 * (1 - (1 - age / .16) ** 3)
    : age < .32 ? 1.12 - .12 * ((age - .16) / .16) : 1;
  return {
    y: baseY - 48 * (1 - (1 - t) ** 2),
    scale,
    opacity: Math.min(1, (SERVICE_REWARD_SECONDS - age) / .45),
    glint: Math.max(0, 1 - age / .65),
  };
}
