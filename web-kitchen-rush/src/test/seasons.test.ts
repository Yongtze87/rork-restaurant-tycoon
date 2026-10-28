import { describe, expect, it } from 'vitest';
import { PRICE_CHANGES_PER_DAY, RestaurantEngine } from '@/management/engine';
import { DISHES, SAVE_KEY } from '@/management/types';

const at = (h: number, m = 0, day = 15) => new Date(2027, 0, day, h, m).getTime();
function shift(e: RestaurantEngine): void { const n = e.state.history.length; for (let i = 0; i < 3000 && e.state.history.length === n; i++) e.update(.1); }
function engine(now = () => at(12)) { const e = new RestaurantEngine(undefined, now); e.open(); e.update(.1); return e; }

describe('dish seasons', () => {
  it('starts a season with a hidden stretch, lasting two or three real days, then moves to another group', () => {
    let now = at(12); const e = engine(() => now), first = e.state.season!;
    expect(['kelp', 'fish']).toContain(first.group); expect([2, 3]).toContain(first.length);
    expect(first.stretch).toBeGreaterThanOrEqual(.05); expect(first.stretch).toBeLessThanOrEqual(.35);
    for (let d = 1; d < first.length; d++) { now = at(12, 0, 15 + d); e.update(.1); expect(e.state.season).toEqual({ ...first, notes: e.state.season!.notes }); }
    now = at(12, 0, 15 + first.length); e.update(.1);
    expect(e.state.season!.group).not.toBe(first.group); expect(e.state.season!.start).toBe(first.length + 1);
  });
  it('keeps the same hidden stretch across a reload', () => {
    let raw = ''; const storage = { getItem: () => raw || null, setItem: (_k: string, v: string) => { raw = v; } };
    const e = new RestaurantEngine(storage, () => at(12)); e.open(); e.update(.1); e.save();
    const again = new RestaurantEngine(storage, () => at(12)); again.update(.1);
    expect(again.state.season).toEqual(e.state.season); expect(JSON.parse(raw)[SAVE_KEY]).toBeUndefined();
  });
  it('lets in-season dishes sell for more, and guests order them more often', () => {
    const e = engine(), season = e.state.season!, dish = season.group === 'kelp' ? 'salad' : 'burger', other = dish === 'salad' ? 'burger' : 'salad';
    expect(e.fairPrice(dish)).toBeCloseTo(DISHES[dish].fair * (1 + season.stretch * (DISHES[dish].stretch ?? 1)));
    expect(e.fairPrice(other)).toBe(DISHES[other].fair);
    for (let i = 0; i < 3; i++) shift(e);
    const sold = e.state.collections.served;
    expect(sold[dish]).toBeGreaterThan(sold[other]); expect(e.state.season!.notes[dish].sold).toBe(sold[dish]);
    expect(e.state.collections.seasonSold[season.group]).toBe(sold[dish]);
  });
  it('turns guests away over steep prices, and rewards bargains with bigger tips', () => {
    const steep = engine(), dish = 'salad';
    steep.setDish('burger', false, 38); steep.setDish(dish, true, Math.round(steep.fairPrice(dish) * 1.6)); shift(steep);
    const walked = steep.state.history[0].missed; expect(walked).toBeGreaterThan(3);
    const cheap = engine(); cheap.setDish('burger', false, 38); cheap.setDish(dish, true, Math.round(cheap.fairPrice(dish) * .8));
    for (let i = 0; i < 200 && !cheap.state.guests.length; i++) cheap.update(.1);
    expect(cheap.state.guests[0].reaction).toBe('bargain');
    // Tips are whole dollars, so compare over a few shifts.
    const fair = engine(); fair.setDish('burger', false, 38); for (let i = 0; i < 4; i++) { shift(fair); shift(cheap); }
    const rate = (e: RestaurantEngine) => e.state.history.reduce((a, r) => a + r.tips, 0) / e.state.history.reduce((a, r) => a + r.revenue, 0);
    expect(rate(cheap)).toBeGreaterThan(rate(fair));
  });
  it('costs reputation when a dish’s price keeps changing, and forgives at midnight', () => {
    let now = at(12); const e = engine(() => now); e.state.reputation = 4;
    for (let n = 1; n <= PRICE_CHANGES_PER_DAY + 1; n++) {
      shift(e); e.setDish('salad', true, e.state.menu.salad.price + 2);
      const before = e.state.reputation; shift(e);
      const rating = e.state.history[e.state.history.length - 1].rating, settled = Math.round((before * .65 + rating * .35) * 100) / 100;
      expect(e.state.pricing.changes.salad).toBe(n);
      if (n > PRICE_CHANGES_PER_DAY) { expect(e.state.reputation).toBeCloseTo(settled - .05); expect(e.event).toContain('changing price of the kelp salad'); }
      else expect(e.state.reputation).toBeCloseTo(settled);
    }
    now = at(12, 0, 16); e.update(.1); expect(e.state.pricing.changes).toEqual({});
  });
  it('auto price sets in-season dishes a little above suggested, does not count as a change, and turns off on a manual change', () => {
    const e = engine(); e.setAutoPrice(true);
    const dish = e.state.season!.group === 'kelp' ? 'salad' : 'burger', other = dish === 'salad' ? 'burger' : 'salad';
    expect(e.state.menu[dish].price).toBe(Math.round(DISHES[dish].fair * 1.05)); expect(e.state.menu[other].price).toBe(DISHES[other].fair);
    shift(e); expect(e.state.pricing.changes).toEqual({});
    e.setDish(other, true, e.state.menu[other].price + 2); expect(e.state.pricing.auto).toBe(false);
  });
});
