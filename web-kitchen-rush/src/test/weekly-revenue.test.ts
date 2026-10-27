import { describe, expect, it } from 'vitest';
import { buildRevenueWeeks, revenueAxisMax } from '@/management/weekly-revenue';
import { RestaurantEngine } from '@/management/engine';
import { freshTotals, type Report } from '@/management/types';

const receipt = (day: number, revenue = 100, tips = 10): Report => ({ ...freshTotals(), day, revenue, tips, wages: 60, rent: 30, debtPayment: 0, profit: revenue + tips - 90, rating: 4, challenges: [], tide: 'calm', branch: 0 });
const receipts = (count: number, start = 1): Report[] => Array.from({ length: count }, (_, i) => receipt(start + i));

describe('weekly revenue projection', () => {
  it('starts with a seven-day empty baseline and no fabricated zero receipts', () => {
    const [week] = buildRevenueWeeks([]);
    expect(week).toMatchObject({ number: 1, start: 1, end: 7, count: 0, total: 0, comparison: null });
    expect(week.days.every(day => day.report === null && day.status === 'pending')).toBe(true);
    expect(revenueAxisMax(week)).toBeGreaterThan(0);
  });
  it('groups by game-day boundaries and counts only saved sales and tips', () => {
    const history = receipts(10); history[0].challenges = [{ day: 1, kind: 'served', dish: null, target: 1, progress: 1, rewarded: true, reward: 85 }];
    history[0].debtPayment = 30; history[0].profit = -999;
    const [first, second] = buildRevenueWeeks(history);
    expect(first).toMatchObject({ start: 1, end: 7, sales: 700, tips: 70, total: 770, count: 7 });
    expect(second).toMatchObject({ start: 8, end: 14, total: 330, count: 3 });
    expect(second.days.slice(3).every(day => day.status === 'pending')).toBe(true);
  });
  it('compares a partial week with the same closed days, not a full prior week', () => {
    const history = [...receipts(7), receipt(8, 150, 15), receipt(9, 150, 15)];
    expect(buildRevenueWeeks(history)[1].comparison).toEqual({ previous: 220, difference: 110, percent: 50, days: 2 });
  });
  it.each([0, 50, 100, 200])('reports honest full-week changes for $%s daily sales', revenue => {
    const history = [...receipts(7).map(r => ({ ...r, tips: 0 })), ...receipts(7, 8).map(r => ({ ...r, revenue, tips: 0 }))];
    expect(buildRevenueWeeks(history)[1].comparison).toEqual({ previous: 700, difference: 7 * revenue - 700, percent: revenue - 100, days: 7 });
  });
  it('handles zero baselines without Infinity, NaN or invented percentage gains', () => {
    const history = [...receipts(7).map(r => ({ ...r, revenue: 0, tips: 0 })), receipt(8, 0, 0)];
    expect(buildRevenueWeeks(history)[1].comparison).toEqual({ previous: 0, difference: 0, percent: null, days: 1 });
    history[7].revenue = 55;
    expect(buildRevenueWeeks(history)[1].comparison).toEqual({ previous: 0, difference: 55, percent: null, days: 1 });
  });
  it('distinguishes $0 earned from unavailable historical receipts and future days', () => {
    const weeks = buildRevenueWeeks(receipts(20, 11).map(r => ({ ...r, revenue: 0, tips: 0 })));
    expect(weeks.map(w => w.number)).toEqual([2, 3, 4, 5]);
    expect(weeks[0].days[0]).toEqual({ day: 8, report: null, status: 'unavailable' });
    expect(weeks[0]).toMatchObject({ count: 4, unavailable: 3, comparison: null });
    expect(weeks[0].days[3].status).toBe('closed');
    expect(weeks[1].comparison).toBeNull();
    expect(weeks[2].comparison?.days).toBe(7);
    expect(weeks[3].days[2].status).toBe('pending');
  });
  it('does not compare gaps in the current or previous period', () => {
    expect(buildRevenueWeeks([receipt(1), receipt(3), receipt(8), receipt(9)])[1].comparison).toBeNull();
    expect(buildRevenueWeeks([...receipts(7), receipt(8), receipt(10)])[1].comparison).toBeNull();
    expect(buildRevenueWeeks([...receipts(7), receipt(8), receipt(15)])[1].comparison).toBeNull();
  });
  it('sorts without mutating history and never double-counts duplicate days', () => {
    const history = [receipt(9), receipt(1), receipt(8), receipt(1)];
    const before = JSON.stringify(history);
    const weeks = buildRevenueWeeks(history);
    expect(weeks.map(w => w.number)).toEqual([1, 2]); expect(weeks[0].total).toBe(110);
    expect(JSON.stringify(history)).toBe(before);
  });
  it('keeps the chart scale finite for zero, small, ordinary and large revenues', () => {
    for (const revenue of [0, .2, 27, 1098, 12345678]) {
      const week = buildRevenueWeeks([receipt(1, revenue, 0)])[0], max = revenueAxisMax(week);
      expect(Number.isFinite(max)).toBe(true); expect(max).toBeGreaterThanOrEqual(revenue); expect(max).toBeGreaterThan(0);
    }
  });
  it('uses exact real online/offline receipts and survives reload without changing finances', async () => {
    let now = 1_800_000_000_000, raw = '';
    const storage = { getItem: () => raw || null, setItem: (_: string, value: string) => { raw = value; } };
    const online = new RestaurantEngine(undefined, () => now), offline = new RestaurantEngine(storage, () => now);
    online.open(); offline.open(); offline.suspend(); now += 3000 * 1000;
    for (let i = 0; i < 30000; i++) online.update(.1);
    const restored = new RestaurantEngine(storage, () => now); await restored.resume();
    const before = JSON.stringify(restored.state);
    const weeks = buildRevenueWeeks(restored.state.history);
    expect(weeks).toEqual(buildRevenueWeeks(online.state.history));
    expect(weeks.reduce((sum, week) => sum + week.total, 0)).toBe(restored.state.history.reduce((sum, r) => sum + r.revenue + r.tips, 0));
    expect(JSON.stringify(restored.state)).toBe(before);
    expect(buildRevenueWeeks(new RestaurantEngine(storage, () => now).state.history)).toEqual(weeks);
  });
});
