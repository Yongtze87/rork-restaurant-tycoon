import type { Report } from './types';

/** A saved closing receipt or an explicitly unknown day, never a fabricated zero. */
export type RevenueDay = { day: number; report: Report | null; status: 'closed' | 'pending' | 'unavailable' };
/** Seven in-game days. Comparison uses the same closed-day prefix in the prior week. */
export type RevenueWeek = {
  number: number; start: number; end: number; days: RevenueDay[];
  sales: number; tips: number; total: number; count: number; unavailable: number;
  comparison: { previous: number; difference: number; percent: number | null; days: number } | null;
};
const weekOf = (day: number): number => Math.floor((day - 1) / 7) + 1;

/** Read-only projection of the existing 20-receipt history, including offline receipts. */
export function buildRevenueWeeks(history: readonly Report[]): RevenueWeek[] {
  const reports = new Map(history.map(report => [report.day, report]));
  const lastDay = Math.max(0, ...reports.keys());
  const numbers = [...new Set([...reports.keys()].map(weekOf))].sort((a, b) => a - b);
  if (!numbers.length) numbers.push(1);
  return numbers.map(number => {
    const start = (number - 1) * 7 + 1;
    const days: RevenueDay[] = Array.from({ length: 7 }, (_, offset) => {
      const day = start + offset, report = reports.get(day) ?? null;
      return { day, report, status: report ? 'closed' : day > lastDay ? 'pending' : 'unavailable' };
    });
    const saved = days.filter(day => day.report !== null);
    const sales = saved.reduce((sum, day) => sum + day.report!.revenue, 0);
    const tips = saved.reduce((sum, day) => sum + day.report!.tips, 0);
    const total = sales + tips;
    // Missing retained receipts must not masquerade as a complete or week-to-date total.
    const hasPrefix = saved.length > 0 && saved.every((day, index) => day.day === start + index);
    const prior = saved.map(day => reports.get(day.day - 7));
    const comparable = number > 1 && hasPrefix && days.every(day => day.status !== 'unavailable') && prior.every(report => report !== undefined);
    const previous = comparable ? prior.reduce((sum, report) => sum + report!.revenue + report!.tips, 0) : 0;
    return {
      number, start, end: start + 6, days, sales, tips, total, count: saved.length,
      unavailable: days.filter(day => day.status === 'unavailable').length,
      comparison: comparable ? { previous, difference: total - previous, percent: previous > 0 ? (total - previous) / previous * 100 : null, days: saved.length } : null,
    };
  });
}

/** A zero-based, rounded dollar ceiling shared by all seven columns. */
export function revenueAxisMax(week: RevenueWeek): number {
  const max = Math.max(1, ...week.days.map(day => day.report ? day.report.revenue + day.report.tips : 0));
  const unit = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / unit) * unit;
}
