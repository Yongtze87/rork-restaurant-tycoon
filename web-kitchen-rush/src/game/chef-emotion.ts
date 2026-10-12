/** Short-lived facial reactions use simulation time, not animation or wall-clock timers. */
export type ChefEmotion = 'happy' | 'disappointed';
export interface FaceWeights { happy: number; disappointed: number; }
export interface ChefEmotionCue { kind: ChefEmotion; startedAt: number; from: FaceWeights; }
export const EMOTION_SECONDS: Readonly<Record<ChefEmotion, number>> = { happy: 3, disappointed: 3.6 };

const smooth = (value: number): number => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** Blend from the interrupted face, hold briefly, then settle exactly to neutral. */
export function sampleChefEmotion(cue: ChefEmotionCue | undefined, time: number, reduced = false): FaceWeights {
  const neutral: FaceWeights = { happy: 0, disappointed: 0 };
  if (!cue) return neutral;
  const age = time - cue.startedAt, duration = EMOTION_SECONDS[cue.kind];
  if (age < 0 || time >= cue.startedAt + duration) return neutral;
  const target: FaceWeights = { happy: cue.kind === 'happy' ? 1 : 0, disappointed: cue.kind === 'disappointed' ? 1 : 0 };
  if (reduced) return target;
  const enter = smooth(age / .2), exit = smooth((duration - age) / .65);
  return {
    happy: (cue.from.happy + (target.happy - cue.from.happy) * enter) * exit,
    disappointed: (cue.from.disappointed + (target.disappointed - cue.from.disappointed) * enter) * exit,
  };
}
