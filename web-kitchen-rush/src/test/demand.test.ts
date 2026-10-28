import { describe, expect, it } from 'vitest';
import { GUEST_STAY, RestaurantEngine, SEATS_PER_CREW, SEAT_FILL } from '@/management/engine';
import { capacity } from '@/management/types';
import { buyFurniture } from '@/management/sim/simulator';

/** A restaurant with extra tables, crew and stations, run for a few shifts; returns guests served per shift. */
function served({ tables = 0, chefs = 1, servers = 1, stations = 0 }, shifts = 3) {
  const e = new RestaurantEngine(), s = e.state; s.cash = 1e5; s.reputation = 4.5;
  for (let i = 0; i < tables; i++) buyFurniture(e, 'table'); for (let i = 0; i < stations; i++) buyFurniture(e, i % 2 ? 'grill' : 'prep');
  for (let i = 1; i < chefs; i++) e.hire('chef'); for (let i = 1; i < servers; i++) e.hire('server');
  e.open(); for (let i = 0; i < 8000 && s.history.length < shifts; i++) e.update(.1);
  return { e, perShift: s.history.reduce((sum, r) => sum + r.served, 0) / s.history.length };
}

describe('guests follow the seats the crew can serve', () => {
  it('draws more guests with more tables once the crew and kitchen can cover them', () => {
    const small = served({ chefs: 2, servers: 2 }), big = served({ tables: 4, chefs: 3, servers: 3, stations: 1 });
    expect(capacity(big.e.state)).toBe(14); expect(big.perShift).toBeGreaterThan(small.perShift * 1.25);
  });
  it('draws no extra guests for tables the crew cannot reach, so they do not drown in orders', () => {
    const lean = served({ tables: 0 }), wide = served({ tables: 6 });
    expect(lean.e.servableSeats()).toBe(SEATS_PER_CREW); expect(wide.e.servableSeats()).toBe(SEATS_PER_CREW);
    expect(wide.e.seatLimit().by).toBe('servers'); expect(Math.abs(wide.perShift - lean.perShift)).toBeLessThan(lean.perShift * .25);
    expect(wide.e.state.reputation).toBeGreaterThan(3.5);
  });
  it('sets the pace from the servable seats and the appeal, a little randomly', () => {
    const e = new RestaurantEngine(); e.state.reputation = 3; // appeal 1 at reputation 3
    const gaps = Array.from({ length: 200 }, () => e.arrivalGap()), mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeCloseTo(GUEST_STAY / (e.servableSeats() * SEAT_FILL), 0);
    expect(Math.min(...gaps)).toBeGreaterThan(mean * .75); expect(Math.max(...gaps)).toBeLessThan(mean * 1.25);
  });
  it('does not lower the rating for guests turned away by a full room', () => {
    const e = new RestaurantEngine(), s = e.state; e.open(); s.reputation = 4;
    s.totals = { ...s.totals, served: 20, missed: 10, full: 10 }; s.elapsed = 1e4; s.guests = []; s.dirty = []; e.update(.1);
    expect(s.history[0].rating).toBeGreaterThanOrEqual(4.5); expect(s.history[0].full).toBe(10);
  });
});
