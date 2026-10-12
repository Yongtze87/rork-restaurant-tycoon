import { SHIFTS } from './config';
import type { Mode, Progress } from './types';

/** Derive the mode's record from existing shift bests, keeping older saves intact. */
export function highScoreFor(progress: Progress, mode: Mode): { score: number; level: number } | null {
  let best: { score: number; level: number } | null = null;
  for (let level = 0; level < SHIFTS.length; level++) {
    const score = progress[mode][level] ?? 0;
    if (Number.isSafeInteger(score) && score > (best?.score ?? 0)) best = { score, level };
  }
  return best;
}
