import { describe, expect, it } from 'vitest';
import { GOALS, RestaurantEngine } from '@/management/engine';
import { accessPoints, findPath, layoutError, placementError } from '@/management/layout';
import { CATALOG, DAY_LENGTH, SAVE_KEY, createRestaurant, entrance, restaurantSchema, width } from '@/management/types';

function runDay(engine: RestaurantEngine) { if (engine.state.phase === 'planning') expect(engine.open()).toBeNull(); const day = engine.state.day; for (let i = 0; i < 2600 && engine.state.day === day; i++) engine.update(.1); }
describe('restaurant ownership', () => {
  it('starts with a playable, connected business and no invented results', () => { const e = new RestaurantEngine(); expect(e.readiness()).toEqual([]); expect(layoutError(e.state.furniture, 10)).toBeNull(); expect(e.state.history).toEqual([]); expect(e.state.lifetimeServed).toBe(0); });
  it('rejects overlaps, boundaries and blocked approaches without spending', () => { const e = new RestaurantEngine(), cash = e.state.cash; expect(e.place({ id: -1, kind: 'plant', x: 1, z: 1, rotation: 0 })).toBeTruthy(); expect(e.place({ id: -1, kind: 'plant', x: 1, z: 2, rotation: 0 })).toBeTruthy(); expect(e.place({ id: -1, kind: 'table', x: 9, z: 9, rotation: 0 })).toBeTruthy(); expect(e.state.cash).toBe(cash); });
  it('charges once, moves free, refunds 70%, preserves entrance', () => { const e = new RestaurantEngine(); expect(e.place({ id: -1, kind: 'plant', x: 0, z: 8, rotation: 0 })).toBeNull(); const item = e.state.furniture[e.state.furniture.length - 1]; const cash = e.state.cash; expect(e.place({ ...item, x: 1, z: 8 })).toBeNull(); expect(e.state.cash).toBe(cash); expect(e.place({ ...item, ...entrance })).toBeTruthy(); expect(e.sell(item.id)).toBeNull(); expect(e.state.cash).toBe(cash + Math.floor(CATALOG.plant.price * .7)); });
  it('requires resources for the first opening, then allows changes while open', () => { const e = new RestaurantEngine(); expect(e.sell(2)).toBeNull(); expect(e.open()).toContain('grill'); expect(e.setDish('burger', false, 38)).toBeNull(); expect(e.setDish('salad', false, 24)).toBeTruthy(); expect(e.open()).toBeNull(); expect(e.place({ id: -1, kind: 'plant', x: 0, z: 8, rotation: 0 })).toBeNull(); expect(e.hire('chef')).toBeNull(); });
  it('hires, trains, pays fair wages and keeps a minimum viable team', () => { const e = new RestaurantEngine(); expect(e.dismiss(10)).toBeTruthy(); expect(e.hire('chef')).toBeNull(); const staff = e.state.staff[e.state.staff.length - 1]; expect(e.train(staff.id)).toBeNull(); expect(staff.level).toBe(2); expect(e.dismiss(staff.id)).toBeNull(); });
  it('runs a full autonomous day with real revenue, costs, cleaning and no duplicate payments', () => { const e = new RestaurantEngine(), cash = e.state.cash; runDay(e); const report = e.state.history[0]; expect(e.state.phase).toBe('service'); expect(e.state.day).toBe(2); expect(report.served).toBeGreaterThan(3); expect(report.revenue).toBeGreaterThan(0); expect(report.ingredients).toBeGreaterThan(0); expect(report.wages).toBe(60); expect(e.state.cash).toBe(cash + report.profit + e.state.lifetimeChallengeBonus); const balance = e.state.cash; e.update(.25); expect(e.state.cash).toBe(balance); expect(e.state.guests).toEqual([]); expect(e.state.dirty).toEqual([]); expect(restaurantSchema.safeParse(e.state).success).toBe(true); });
  it('pauses all simulation and 3x advances the same clock', () => { const e = new RestaurantEngine(); e.open(); e.pause(true); e.update(.2); expect(e.state.elapsed).toBe(0); e.setSpeed(3); e.update(.2); expect(e.state.elapsed).toBeCloseTo(.6); });
  it('reserves seats uniquely, respects routes and serves only actual guests', () => { const e = new RestaurantEngine(); e.open(); for (let i = 0; i < 1300; i++) { e.update(.1); const guests = e.state.guests.filter(g => g.stage !== 'leaving'); expect(new Set(guests.map(g => `${g.tableId}:${g.seat}`)).size).toBe(guests.length); expect(e.state.staff.every(s => Number.isFinite(s.x))).toBe(true); } expect(e.state.totals.served).toBeGreaterThan(3); });
  it('goals pay exactly once and expansion unlocks after three completed days', () => { const e = new RestaurantEngine(); expect(e.expand()).toBeTruthy(); for (let i = 0; i < 3; i++) { runDay(e); e.nextDay(); } expect(e.claim(GOALS[0].id)).toBeNull(); const cash = e.state.cash; expect(e.claim(GOALS[0].id)).toBeTruthy(); expect(e.state.cash).toBe(cash); expect(e.expand()).toBeNull(); expect(width(e.state)).toBe(14); });
  it('restores an active day running without altering legacy records', () => { const values = new Map([['kitchen-rush-progress-v1', 'legacy']]); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; const e = new RestaurantEngine(storage); e.open(); for (let i = 0; i < 100; i++) e.update(.1); e.save(); const next = new RestaurantEngine(storage); expect(next.state).toEqual(e.state); expect(next.paused).toBe(false); expect(values.get('kitchen-rush-progress-v1')).toBe('legacy'); expect(values.has(SAVE_KEY)).toBe(true); });
  it('handles malformed saves and denied storage honestly', () => { const e = new RestaurantEngine({ getItem: () => '{bad', setItem: () => { throw new Error('denied'); } }); expect(e.loadWarning).not.toBe(''); expect(e.readiness()).toEqual([]); expect(e.save()).toBe(false); expect(e.saveFailed).toBe(true); });
  it('has bounded recovery and repays it once per closing', () => { const e = new RestaurantEngine(); e.state.cash = 90; expect(e.loan()).toBeNull(); expect(e.loan()).toBeTruthy(); runDay(e); expect(e.state.history).toHaveLength(1); expect(e.state.debt).toBe(570); });
});
describe('safe service persistence', () => {
  it('can reload every stage of a complete service day without losing money or guests', () => {
    let raw = '';
    const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
    const e = new RestaurantEngine(storage); e.open();
    const stages = new Set<string>();
    for (let i = 0; i < 2350 && e.state.phase === 'service'; i++) {
      e.update(.1); e.state.guests.forEach(g => stages.add(g.stage));
      if (i % 13 === 0) {
        expect(restaurantSchema.safeParse(e.state).success).toBe(true);
        e.save(); const reload = new RestaurantEngine(storage);
        expect(reload.loadWarning).toBe(''); expect(reload.state).toEqual(e.state);
      }
    }
    expect(stages.has('eating')).toBe(true); expect(stages.has('leaving')).toBe(true);
  });
  it('does not overwrite an unreadable save on auto-save or navigation', () => {
    let raw = '{invalid';
    const e = new RestaurantEngine({ getItem: () => raw, setItem: (_key, value) => { raw = value; } });
    e.welcome(); e.save(); expect(raw).toBe('{invalid'); expect(e.save(true)).toBe(true); expect(JSON.parse(raw).version).toBe(1);
  });
  it('clears today’s totals on automatic rollover', () => { const e = new RestaurantEngine(); runDay(e); e.nextDay(); expect(e.state.totals.served).toBe(0); expect(e.state.history[0].served).toBeGreaterThan(0); });
});
describe('editable routing', () => {
  it('rotates sockets along with furniture and checks every seat', () => { const s = createRestaurant(); for (let rotation = 0; rotation < 4; rotation++) { const item = { id: 99, kind: 'table' as const, x: 5, z: 7, rotation }; const error = placementError(s, item); if (!error) for (const access of accessPoints(item)) expect(findPath([...s.furniture, item], 10, entrance, access)).not.toBeNull(); } });
  it('never cuts diagonally through furniture', () => { const s = createRestaurant(), path = findPath(s.furniture, 10, entrance, { x: 1, z: 2 })!; expect(path).not.toBeNull(); let previous = entrance; for (const step of path) { expect(Math.abs(step.x - previous.x) + Math.abs(step.z - previous.z)).toBe(1); previous = step; } });
});
