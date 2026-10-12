import type { Diner } from './diners';

export const DINER_ANGER_THRESHOLD = .2;
export const DINER_HAPPY_SECONDS = 3;
/** Presentation only; patience, outcomes and timestamps belong to the dining simulation. */
export type DinerEmotion = 'happy' | 'angry';
export interface DinerEmotionPose {
  readonly kind: DinerEmotion | null;
  readonly opacity: number;
  readonly scale: number;
  readonly lift: number;
}
const HIDDEN: DinerEmotionPose = { kind: null, opacity: 0, scale: 1, lift: 0 };
const ANGRY: DinerEmotionPose = { kind: 'angry', opacity: 1, scale: 1, lift: 0 };
const ease = (t: number): number => 1 - (1 - t) ** 3;

/** Sample the same simulation clock as the guest; never create a second patience timer. */
export function sampleDinerEmotion(guest: Readonly<Diner>, time: number, reduced: boolean): DinerEmotionPose {
  if (guest.stage === 'queued' || guest.stage === 'gone') return HIDDEN;
  if (guest.outcome === 'served') {
    if (guest.servedAt === null) return HIDDEN;
    // An early delivery also gets its thank-you when the guest finally reaches their meal.
    const startedAt = Math.max(guest.servedAt, guest.mealStarted ?? guest.servedAt);
    const age = time - startedAt;
    if (age < 0 || age >= DINER_HAPPY_SECONDS) return HIDDEN;
    const scale = reduced ? 1 : age < .18 ? .82 + .28 * ease(age / .18) : age < .36 ? 1.1 - .1 * ease((age - .18) / .18) : 1;
    return { kind: 'happy', opacity: reduced ? 1 : Math.min(1, (DINER_HAPPY_SECONDS - age) / .45), scale, lift: reduced ? 0 : 4 * ease(Math.min(1, age / .7)) };
  }
  return guest.outcome === 'missed' || guest.patience <= DINER_ANGER_THRESHOLD ? ANGRY : HIDDEN;
}
