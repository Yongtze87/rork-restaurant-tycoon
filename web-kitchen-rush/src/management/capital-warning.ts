import type { RestaurantState } from './types';

/** A read-only cash safety signal; pending sales and unearned rewards are never counted. */
export interface CapitalWarning {
  kind: 'low' | 'critical' | 'closing' | 'closed';
  cash: number;
  bills: number;
  debtPayment: number;
  reserve: number;
}

/** Uses the engine's daily operating cost plus the existing loan payment and ingredient buffer. */
export function getCapitalWarning(state: RestaurantState, operatingCost: number): CapitalWarning | null {
  const debtPayment = Math.min(30, state.debt);
  const bills = operatingCost + debtPayment, reserve = bills + 30;
  const closing = state.phase === 'service' && state.renovation;
  if (state.cash > reserve && !closing) return null;
  return {
    kind: closing ? 'closing' : state.phase !== 'service' ? 'closed' : state.cash <= bills ? 'critical' : 'low',
    cash: state.cash, bills, debtPayment, reserve,
  };
}
