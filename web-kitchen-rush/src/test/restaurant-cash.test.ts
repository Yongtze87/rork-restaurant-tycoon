import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { CASH_COUNT_SECONDS, CashAnimation, type CashReceipt } from '@/management/cash-feedback';
import { SAVE_KEY } from '@/management/types';

const receipt = (amount: number, id = 1): CashReceipt => ({ id, amount, tip: 2, source: 'service', guestId: id + 20, clock: 0 });

describe('real income receipts', () => {
  it('emits one receipt per paid guest with the exact price and tip, never for expenses', () => {
    const engine = new RestaurantEngine(); engine.open();
    let seen = 0, paid = 0, count = 0, bonuses = 0;
    for (let i = 0; i < 2300 && engine.state.day === 1; i++) {
      engine.update(.1);
      for (const event of engine.incomeReceipts.filter(item => item.id > seen)) {
        seen = event.id;
        if (event.source === 'challenge') { bonuses += event.amount; expect(event.guestId).toBeNull(); continue; }
        count++;
        const guest = engine.state.guests.find(item => item.id === event.guestId)!;
        expect(guest.paid).toBe(true); expect(event.amount).toBe(guest.price + event.tip);
        expect(event.source).toBe('service'); expect(event.clock).toBeCloseTo(engine.state.clock);
        paid += event.amount; seen = event.id;
      }
      expect(engine.incomeReceipts.length).toBeLessThanOrEqual(12);
    }
    const report = engine.state.history[0];
    expect(count).toBe(report.served); expect(bonuses).toBe(engine.state.lifetimeChallengeBonus); expect(paid).toBe(report.revenue + report.tips);
    expect(engine.state.cash).toBe(1250 + report.profit + bonuses);
  });
  it('only emits successful sale, milestone and loan receipts with truthful sources', () => {
    const engine = new RestaurantEngine();
    engine.hire('chef'); engine.place({ id: -1, kind: 'plant', x: 1, z: 1, rotation: 0 });
    engine.claim('first-service'); engine.loan(); engine.sell(-99);
    expect(engine.incomeReceipts).toEqual([]);
    engine.sell(6); expect(engine.incomeReceipts[0]).toMatchObject({ source: 'sale', amount: 45, guestId: null });
    engine.state.lifetimeServed = 5; engine.claim('first-service'); engine.claim('first-service');
    expect(engine.incomeReceipts).toHaveLength(2);
    expect(engine.incomeReceipts[1]).toMatchObject({ source: 'milestone', amount: 180 });
    engine.state.cash = 100; engine.loan(); engine.loan();
    expect(engine.incomeReceipts).toHaveLength(3); expect(engine.incomeReceipts[2]).toMatchObject({ source: 'loan', amount: 600 });
  });
  it('does not save or replay receipts and reset clears them without recycling IDs', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    const engine = new RestaurantEngine(storage); engine.sell(6);
    expect(JSON.parse(store.get(SAVE_KEY)!)).not.toHaveProperty('incomeReceipts');
    const restored = new RestaurantEngine(storage);
    expect(restored.incomeReceipts).toEqual([]); expect(restored.state.cash).toBe(engine.state.cash);
    const id = engine.incomeReceipts[0].id; engine.reset(); expect(engine.incomeReceipts).toEqual([]);
    engine.sell(6); expect(engine.incomeReceipts[0].id).toBeGreaterThan(id);
  });
});

describe('visual cash counter', () => {
  it('eases up to the exact balance without overshooting or mutating credited money', () => {
    const animation = new CashAnimation(100);
    animation.sync(130, [receipt(30)]); expect(animation.displayed).toBe(100);
    animation.advance(.2, false, false); expect(animation.displayed).toBeGreaterThan(100); expect(animation.displayed).toBeLessThan(130);
    animation.advance(CASH_COUNT_SECONDS, false, false); expect(animation.displayed).toBe(130); expect(animation.balance).toBe(130);
    animation.advance(2, false, false); expect(animation.notice).toBeNull();
  });
  it('handles simultaneous payments and costs, then rapid payments without dropping amounts', () => {
    const animation = new CashAnimation(100);
    animation.sync(150, [receipt(25), receipt(25, 2)]); expect(animation.notice?.amount).toBe(50);
    animation.advance(.2, false, false); const shown = animation.displayed;
    animation.sync(138, []); expect(animation.displayed).toBe(shown - 12);
    animation.sync(168, [receipt(30, 3)]); expect(animation.displayed).toBe(shown - 12);
    expect(animation.notice).toMatchObject({ amount: 80, tip: 6 });
    animation.advance(1, false, false); expect(animation.displayed).toBe(168);
  });
  it('never celebrates a balance sync, deduction or initial balance', () => {
    const animation = new CashAnimation(1250); animation.sync(1100, []);
    expect(animation.displayed).toBe(1100); expect(animation.notice).toBeNull();
    animation.sync(1250, []); expect(animation.notice).toBeNull(); expect(animation.displayed).toBe(1250);
  });
  it('freezes while paused and reduced motion settles immediately without replay when re-enabled', () => {
    const animation = new CashAnimation(100); animation.sync(140, [receipt(40)]);
    animation.advance(1, true, false); expect(animation.displayed).toBe(100); expect(animation.notice).not.toBeNull();
    animation.advance(.1, true, true); expect(animation.displayed).toBe(140);
    animation.advance(.1, false, false); expect(animation.displayed).toBe(140);
    animation.advance(2, false, true); expect(animation.notice).toBeNull();
  });
});
