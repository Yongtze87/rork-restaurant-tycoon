import type { RestaurantState } from './types';

/** A read-only cash safety signal; pending sales and unearned rewards are never counted. */
export interface CapitalWarning {
  kind: 'low' | 'critical';
  cash: number;
  bills: number;
  debtPayment: number;
  reserve: number;
}

/** Tonight's bills (wages, rent, loan repayment) plus a $30 ingredient buffer, against the register. */
export function getCapitalWarning(state: RestaurantState, operatingCost: number): CapitalWarning | null {
  const debtPayment = Math.min(30, state.debt);
  const bills = operatingCost + debtPayment, reserve = bills + 30;
  if (state.phase !== 'service' || state.cash > reserve) return null;
  return { kind: state.cash <= bills ? 'critical' : 'low', cash: state.cash, bills, debtPayment, reserve };
}
