import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { getCapitalWarning } from '@/management/capital-warning';

const warning = (e: RestaurantEngine) => getCapitalWarning(e.state, e.operatingCost());

describe('capital warning', () => {
  it('is absent with healthy funds, warns at the inclusive reserve, clears on recovery', () => {
    const e = new RestaurantEngine(); e.open(); expect(warning(e)).toBeNull();
    e.state.cash = 120; expect(warning(e)).toEqual({ kind: 'low', cash: 120, bills: 90, reserve: 120, debtPayment: 0 });
    e.state.cash = 120.01; expect(warning(e)).toBeNull();
  });
  it.each([90, 0, -95])('marks cash %s as at risk of uncovered closing bills without clamping the balance', cash => {
    const e = new RestaurantEngine(); e.open(); e.state.cash = cash;
    expect(warning(e)).toMatchObject({ kind: 'critical', cash, bills: 90 });
  });
  it('adapts to trained staff, expansion and only the next repayment, not the entire loan', () => {
    const e = new RestaurantEngine(); e.open(); e.state.expanded = true; e.state.staff[0].level = 3; e.state.debt = 600; e.state.cash = 190;
    expect(warning(e)).toMatchObject({ kind: 'low', bills: 164, reserve: 194, debtPayment: 30 });
    e.state.debt = 8; e.state.cash = 170;
    expect(warning(e)).toMatchObject({ bills: 142, reserve: 172, debtPayment: 8 });
  });
  it('is quiet before the first opening', () => {
    const e = new RestaurantEngine(); e.state.cash = 10; expect(warning(e)).toBeNull();
  });
  it('does not double-charge spent ingredients or subtract past sales; projection is read-only', () => {
    const e = new RestaurantEngine(); e.open(); e.state.cash = 110;
    e.state.totals.ingredients = 800; e.state.totals.revenue = 1000; e.state.totals.tips = 100;
    const before = structuredClone(e.state); expect(warning(e)?.reserve).toBe(120); expect(e.state).toEqual(before);
  });
  it('stays open when short at closing: the bank covers the bills and the shortfall becomes a loan', () => {
    const e = new RestaurantEngine(); e.open(); e.state.cash = -1000;
    for (let i = 0; i < 3000 && e.state.history.length === 0; i++) e.update(.1);
    expect(e.state.history).toHaveLength(1); expect(e.state.phase).toBe('service'); expect(e.state.day).toBe(2);
    expect(e.state.cash).toBe(0); expect(e.state.debt).toBeGreaterThan(0); expect(e.event).toContain('bank covered');
    expect(warning(e)).toMatchObject({ kind: 'critical', cash: 0 });
  });
  it('derives from restored/offline state without persisting any warning or repeating charges', async () => {
    let now = 1_800_000_000_000, raw = '';
    const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
    const e = new RestaurantEngine(storage, () => now); e.open(); e.state.cash = -1000; e.suspend(); now += 900000;
    const restored = new RestaurantEngine(storage, () => now); await restored.resume();
    expect(restored.state.history.length).toBeGreaterThan(0); expect(restored.state.debt).toBeGreaterThan(0);
    const again = new RestaurantEngine(storage, () => now); await again.resume(); expect(again.state.cash).toBe(restored.state.cash); expect(again.state.debt).toBe(restored.state.debt);
    expect(Object.keys(JSON.parse(storage.getItem() ?? '{}'))).not.toContain('capitalWarning');
    again.reset(); expect(warning(again)).toBeNull();
  });
});
