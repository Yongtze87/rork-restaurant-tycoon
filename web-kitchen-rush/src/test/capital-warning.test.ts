import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { getCapitalWarning } from '@/management/capital-warning';

const warning = (e: RestaurantEngine) => getCapitalWarning(e.state, e.operatingCost());
const advance = (e: RestaurantEngine, seconds: number) => { for (let i = 0; i < seconds * 10; i++) e.update(.1); };

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
    const e = new RestaurantEngine(); e.state.expanded = true; e.state.staff[0].level = 3; e.state.debt = 600; e.state.cash = 190;
    expect(warning(e)).toMatchObject({ kind: 'closed', bills: 164, reserve: 194, debtPayment: 30 });
    e.state.debt = 8; e.state.cash = 170;
    expect(warning(e)).toMatchObject({ bills: 142, reserve: 172, debtPayment: 8 });
  });
  it('does not double-charge spent ingredients or subtract past sales; projection is read-only', () => {
    const e = new RestaurantEngine(); e.open(); e.state.cash = 110;
    e.state.totals.ingredients = 800; e.state.totals.revenue = 1000; e.state.totals.tips = 100;
    const before = structuredClone(e.state); expect(warning(e)?.reserve).toBe(120); expect(e.state).toEqual(before);
  });
  it('retains queued closure guidance even if guest payments restore the reserve; keeps explicit pause', () => {
    const e = new RestaurantEngine(); e.open(); e.state.cash = 110; e.pause(true); e.closeEarly();
    e.state.cash = 500; expect(warning(e)?.kind).toBe('closing'); advance(e, 2); expect(e.state.phase).toBe('service'); expect(e.paused).toBe(true);
    e.pause(false); advance(e, 1); expect(e.state.phase).toBe('planning'); expect(warning(e)).toBeNull();
  });
  it('uses safe closure with live guests, no new arrivals or immediate charge, and exactly one closing receipt', () => {
    const e = new RestaurantEngine(); e.open(); advance(e, 20); e.state.cash = 110;
    const ids = e.state.guests.map(g => g.id), cash = e.state.cash;
    expect(ids.length).toBeGreaterThan(0); e.closeEarly(); e.closeEarly();
    expect(e.state.cash).toBe(cash); expect(e.state.history).toHaveLength(0); expect(warning(e)?.kind).toBe('closing');
    for (let i = 0; i < 1000 && e.state.phase === 'service'; i++) {
      e.update(.1); expect(e.state.guests.every(g => ids.includes(g.id))).toBe(true);
    }
    expect(e.state.phase).toBe('planning'); expect(e.state.history).toHaveLength(1);
    const end = e.state.cash; advance(e, 300); expect(e.state.cash).toBe(end);
  });
  it('derives from restored/offline state without persisting any warning or repeating charges', async () => {
    let now = 1_800_000_000_000, raw = '';
    const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
    const e = new RestaurantEngine(storage, () => now); e.open(); e.state.cash = 0; e.suspend(); now += 900000;
    const restored = new RestaurantEngine(storage, () => now); await restored.resume();
    expect(warning(restored)).toMatchObject({ kind: 'closed', cash: -90 });
    const again = new RestaurantEngine(storage, () => now); await again.resume(); expect(again.state.cash).toBe(restored.state.cash);
    expect(Object.keys(JSON.parse(storage.getItem() ?? '{}'))).not.toContain('capitalWarning');
    expect(again.loan()).toBeNull(); expect(warning(again)).toBeNull(); again.reset(); expect(warning(again)).toBeNull();
  });
});
