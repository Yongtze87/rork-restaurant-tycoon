import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { summarizeReport } from '@/management/report';
import type { Report } from '@/management/types';

const receipt: Report = { challenges: [], day: 1, revenue: 300, tips: 20, ingredients: 90, wages: 60, rent: 30, debtPayment: 0, profit: 140, served: 10, missed: 2, rating: 4 };
function finishDay(engine: RestaurantEngine): void {
  expect(engine.open()).toBeNull();
  engine.state.renovation = true;
  for (let i = 0; i < 2600 && engine.state.phase === 'service'; i++) engine.update(.1);
  expect(engine.state.phase).toBe('planning');
}

describe('daily business summaries', () => {
  it('totals sales and tips once and includes every service expense', () => {
    const result = summarizeReport(receipt);
    expect(result).toEqual({ totalRevenue: 320, totalCosts: 180, margin: 43.75, profitChange: null });
    expect(result.totalRevenue - result.totalCosts).toBe(receipt.profit);
  });
  it('shows loan repayments in the existing daily cash result without subtracting twice', () => {
    const report = { ...receipt, debtPayment: 30, profit: 110 };
    const result = summarizeReport(report);
    expect(result.totalCosts).toBe(210);
    expect(result.totalRevenue - result.totalCosts).toBe(report.profit);
  });
  it('does not manufacture a margin on a day with no revenue', () => {
    const result = summarizeReport({ ...receipt, revenue: 0, tips: 0, ingredients: 0, profit: -90 });
    expect(result.totalRevenue).toBe(0); expect(result.margin).toBeNull();
  });
  it.each([[140, -50, 190], [-20, -50, 30], [-90, 140, -230], [0, 0, 0]])('compares profit %s against %s as an absolute change of %s', (current, previous, expected) => {
    expect(summarizeReport({ ...receipt, profit: current }, { ...receipt, profit: previous }).profitChange).toBe(expected);
  });
  it('retains completed reports across reload, next-day hiring and rewards without extra charges', () => {
    let saved = '';
    const storage = { getItem: () => saved || null, setItem: (_key: string, value: string) => { saved = value; } };
    const engine = new RestaurantEngine(storage);
    finishDay(engine);
    const original = structuredClone(engine.state.history[0]);
    const cash = engine.state.cash;
    const restored = new RestaurantEngine(storage);
    expect(restored.state.phase).toBe('planning');
    expect(restored.state.history[0]).toEqual(original);
    restored.update(.25); expect(restored.state.cash).toBe(cash);
    restored.nextDay(); expect(restored.hire('chef')).toBeNull();
    expect(restored.claim('first-service')).toBeNull();
    finishDay(restored);
    expect(restored.state.history[0]).toEqual(original);
    expect(restored.state.history[1].wages).toBe(94);
    expect(restored.state.history[0].wages).toBe(60);
    expect(new RestaurantEngine(storage).state.history).toEqual(restored.state.history);
  });
});
