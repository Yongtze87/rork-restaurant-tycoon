/** A transient receipt of money already credited by the simulation; never saved or replayed. */
export interface CashReceipt {
  id: number;
  amount: number;
  tip: number;
  source: 'service' | 'sale' | 'milestone' | 'loan' | 'challenge' | 'branch';
  guestId: number | null;
  clock: number;
}
export const RECEIPT_SECONDS = 2.4;
export const CASH_COUNT_SECONDS = .7;
export const CASH_NOTICE_SECONDS = 2;
export const incomeLabels = { service: 'Payment', sale: 'Furniture sold', milestone: 'Milestone', challenge: 'Daily challenge', loan: 'Loan received', branch: 'Branch income', income: 'Cash received' } as const;
export type CashNotice = { id: number; amount: number; tip: number; source: keyof typeof incomeLabels };

/** Visual-only counter. Expenses apply immediately, even during an unfinished income count-up. */
export class CashAnimation {
  balance: number;
  remaining = 0;
  notice: CashNotice | null = null;
  private from = 0;
  private elapsed = 0;
  constructor(balance: number) { this.balance = balance; }
  get displayed(): number { return Math.round(this.balance - this.remaining); }
  sync(balance: number, receipts: readonly CashReceipt[]): void {
    this.balance = balance;
    if (!receipts.length) return;
    const amount = receipts.reduce((sum, item) => sum + item.amount, 0);
    const tip = receipts.reduce((sum, item) => sum + item.tip, 0);
    const previous = this.notice;
    const source = receipts.every(item => item.source === receipts[0].source) && (!previous || previous.source === receipts[0].source) ? receipts[0].source : 'income';
    this.notice = { id: receipts[receipts.length - 1].id, amount: amount + (previous?.amount ?? 0), tip: tip + (previous?.tip ?? 0), source };
    this.from = this.remaining + amount; this.remaining = this.from; this.elapsed = 0;
  }
  advance(seconds: number, paused: boolean, reduced: boolean): void {
    if (reduced) { this.remaining = 0; this.from = 0; }
    if (paused || !Number.isFinite(seconds) || seconds <= 0) return;
    this.elapsed += seconds;
    this.remaining = reduced ? 0 : this.from * (1 - Math.min(1, this.elapsed / CASH_COUNT_SECONDS)) ** 3;
    if (this.elapsed >= CASH_NOTICE_SECONDS) this.notice = null;
  }
}
