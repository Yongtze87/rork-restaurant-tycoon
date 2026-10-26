import type { Guest } from './types';

/** Current service mood; presentation only, never changes tips, reputation or saves. */
export type GuestMood = 'content' | 'uneasy' | 'unhappy' | 'served';

/** Uses simulation waiting time until delivery, then the engine's recorded outcome. */
export function guestSatisfaction(guest: Pick<Guest, 'stage' | 'waiting' | 'happy'>, patienceSeconds: number): number {
  if (guest.stage === 'leaving') return guest.happy ? 100 : 0;
  if (guest.stage === 'eating') return 100;
  if (guest.stage === 'arriving') return 100;
  return Math.round(Math.max(0, Math.min(1, 1 - guest.waiting / patienceSeconds)) * 100);
}

/** Color and face share the same thresholds, so the bar is not color-only feedback. */
export function guestMood(value: number, stage: Guest['stage'], happy: boolean): GuestMood {
  if (stage === 'eating' || stage === 'leaving' && happy) return 'served';
  return value <= 20 ? 'unhappy' : value <= 50 ? 'uneasy' : 'content';
}

