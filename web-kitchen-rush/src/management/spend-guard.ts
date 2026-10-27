import { restaurant } from './engine';

/** A purchase waiting for the owner to confirm, because it would leave too little to open next time. */
export interface Pending { what: string; cost: number; extraDaily: number; after: number; reserve: number; run: () => void }
let pending: Pending | null = null;
export const listeners = new Set<() => void>();
const set = (next: Pending | null) => { pending = next; listeners.forEach(l => l()); };

/**
 * Runs a purchase straight away when it leaves enough to open next time; otherwise asks first.
 * `extraDaily` is a daily cost the purchase adds (a new wage), so the check covers tomorrow's bills too.
 */
export function guardSpend(what: string, cost: number, run: () => void, extraDaily = 0): void {
  const { after, reserve } = restaurant.spendCheck(cost, extraDaily);
  if (after >= reserve || after < 0) run(); else set({ what, cost, extraDaily, after, reserve, run });
}

export const pendingSpend = (): Pending | null => pending;
export const clearSpend = (): void => set(null);
