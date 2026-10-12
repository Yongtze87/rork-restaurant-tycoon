/** A small visual-only jump, independent of collision, dash and successful-action cues. */
export interface ChefHopCue { startedAt: number; }
export const CHEF_HOP_SECONDS = .38;
export const CHEF_HOP_HEIGHT = .22;

/** Smooth takeoff/landing with zero endpoint velocity; sampled from the simulation clock. */
export function sampleChefHop(cue: ChefHopCue | undefined, elapsed: number, reducedMotion: boolean): number {
  if (!cue || reducedMotion) return 0;
  const age = elapsed - cue.startedAt;
  if (age <= 0 || age >= CHEF_HOP_SECONDS) return 0;
  return CHEF_HOP_HEIGHT * Math.sin(Math.PI * age / CHEF_HOP_SECONDS) ** 2;
}
