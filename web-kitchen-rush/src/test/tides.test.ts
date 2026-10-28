import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { RestaurantEngine, OFFLINE_SERVICE_DAYS } from '@/management/engine';
import { TIDES, TIDE_KINDS, rollTide, tideEffectText, type TideKind } from '@/management/tides';
import { nightLevel, sceneNight } from '@/management/light';
import { DAY_LENGTH, SAVE_KEY, createRestaurant, restaurantSchema } from '@/management/types';

// These tests compare long offline replays with live play, so the crew may work more than one day while away.
beforeEach(() => { RestaurantEngine.offlineDays = Infinity; });
afterEach(() => { RestaurantEngine.offlineDays = OFFLINE_SERVICE_DAYS; });


function harness() {
  let now = 1_800_000_000_000, raw = '';
  const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
  return { storage, now: () => now, advance: (seconds: number) => { now += seconds * 1000; } };
}
function advance(e: RestaurantEngine, seconds: number) { for (let i = 0; i < seconds * 10; i++) e.update(.1); }
/** One real service day with the tide forced, summed over a few seeds to smooth out the guest stream. */
function serviceDays(tide: TideKind, setup: (e: RestaurantEngine) => void = () => {}) {
  const total = { served: 0, missed: 0, tips: 0, ingredients: 0 };
  for (const seed of [7777, 15554, 23331, 31108, 38885]) {
    const e = new RestaurantEngine(); e.state.seed = seed; setup(e); expect(e.open()).toBeNull(); e.state.tide = tide;
    for (let i = 0; i < 4000 && !e.state.history.length; i++) e.update(.1);
    const r = e.state.history[0]; expect(r.tide).toBe(tide);
    total.served += r.served; total.missed += r.missed; total.tips += r.tips; total.ingredients += r.ingredients;
  }
  return total;
}

describe('daily tides', () => {
  it('rolls the same tide for the same seed and day, and day 1 is always calm', () => {
    for (let day = 1; day < 200; day++) expect(rollTide(4242, day)).toBe(rollTide(4242, day));
    expect(new Set(Array.from({ length: 50 }, (_, i) => rollTide(4242, i + 2))).size).toBeGreaterThan(3);
    for (const seed of [1, 91273, 2 ** 31]) expect(rollTide(seed, 1)).toBe('calm');
    expect(createRestaurant().tide).toBe('calm');
  });
  it('produces every active tide over many days, with calm waters most common', () => {
    const counts = Object.fromEntries(TIDE_KINDS.map(k => [k, 0])) as Record<TideKind, number>;
    for (let day = 2; day < 3002; day++) counts[rollTide(91273 + day * 31, day)]++;
    // Plankton bloom and shoal run are retired (kelp and fish have seasons now): they never roll.
    for (const kind of TIDE_KINDS) if (TIDES[kind].weight > 0) expect(counts[kind]).toBeGreaterThan(100); else expect(counts[kind]).toBe(0);
    for (const kind of TIDE_KINDS) if (kind !== 'calm') expect(counts.calm).toBeGreaterThan(counts[kind] * 2);
  });
  it('keeps one tide all real day and rolls the next one from the saved seed, without consuming the guest random stream', () => {
    let now = new Date(2027, 0, 15, 23, 50).getTime(); const e = new RestaurantEngine(undefined, () => now); e.open();
    const day = e.state.day; for (let i = 0; i < 4000 && e.state.day === day; i++) e.update(.1);
    expect(e.state.day).toBe(2); expect(e.state.tide).toBe(rollTide(e.state.seed, 1));
    now += 20 * 60_000; e.update(.1); expect(e.state.calendar.index).toBe(2); expect(e.state.tide).toBe(rollTide(e.state.seed, 2));
    const seed = e.state.seed; e.tideEffects(); expect(e.state.seed).toBe(seed);
  });
  it('keeps every effect modest and describes it from the same numbers', () => {
    for (const kind of TIDE_KINDS) for (const value of Object.values(TIDES[kind].effects)) { expect(value).toBeGreaterThanOrEqual(.7); expect(value).toBeLessThanOrEqual(1.3); }
    expect(tideEffectText('calm')).toBe('No change today');
    expect(tideEffectText('feast')).toBe('Guests arrive 25% more often');
    expect(tideEffectText('whale')).toBe('Guests arrive 15% more often · tips +15%');
    expect(tideEffectText('plankton')).toBe('Kelp 30% cheaper');
  });

  describe('changes real service results compared with calm waters', () => {
    const calm = serviceDays('calm');
    it('feast tide brings more guests', () => { const r = serviceDays('feast'); expect(r.served + r.missed).toBeGreaterThan((calm.served + calm.missed) * 1.1); });
    it('whale passing brings more guests who tip more', () => {
      const r = serviceDays('whale'); expect(r.served + r.missed).toBeGreaterThan(calm.served + calm.missed); expect(r.tips / r.served).toBeGreaterThan(calm.tips / calm.served * 1.03);
    });
    it('strong current slows the crew', () => { expect(serviceDays('current').served).toBeLessThan(calm.served); });
    it('plankton bloom and shoal run make kelp and fish cheaper', () => {
      const e = new RestaurantEngine(); e.state.tide = 'plankton'; expect(e.dishCost('salad')).toBeCloseTo(4.9); expect(e.dishCost('burger')).toBe(12);
      e.state.tide = 'shoal'; expect(e.dishCost('salad')).toBe(7); expect(e.dishCost('burger')).toBeCloseTo(8.4);
      const plankton = serviceDays('plankton'), shoal = serviceDays('shoal');
      expect(plankton.served).toBe(calm.served); expect(plankton.ingredients).toBeLessThan(calm.ingredients);
      expect(shoal.served).toBe(calm.served); expect(shoal.ingredients).toBeLessThan(plankton.ingredients);
    });
    it('murky water makes guests leave sooner', () => {
      const leavesAfter = (tide: TideKind) => {
        const e = new RestaurantEngine(); e.open(); e.state.tide = tide; e.state.staff = e.state.staff.filter(s => s.role === 'server'); // nobody cooks
        for (let i = 0; i < 400 && !e.state.guests.some(g => g.stage === 'waiting'); i++) e.update(.1);
        const guest = e.state.guests.find(g => g.stage === 'waiting')!; let waited = 0;
        while (guest.stage !== 'leaving' && waited < 120) { e.update(.1); waited += .1; }
        return guest.waiting;
      };
      expect(leavesAfter('murky')).toBeLessThan(leavesAfter('calm') * .92);
    });
  });

  it('records the tide in each receipt and loads saves from before tides', () => {
    const e = new RestaurantEngine(); e.open(); e.state.tide = 'shoal';
    for (let i = 0; i < 4000 && !e.state.history.length; i++) e.update(.1);
    expect(e.state.history[0].tide).toBe('shoal');
    const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(e.state)); delete legacy.tide;
    (legacy.history as Record<string, unknown>[]).forEach(r => { delete r.tide; });
    const parsed = restaurantSchema.parse(legacy); expect(parsed.tide).toBe('calm'); expect(parsed.history[0].tide).toBe('calm');
    const h = harness(); h.storage.setItem(SAVE_KEY, JSON.stringify(legacy));
    const restored = new RestaurantEngine(h.storage, h.now); expect(restored.loadWarning).toBe(''); expect(restored.state.history[0].tide).toBe('calm');
  });
  it('rolls a planning-phase legacy save to the tide the day will open with', () => {
    const s = createRestaurant(); s.day = 5; const { tide: _, ...legacy } = s;
    const h = harness(); h.storage.setItem(SAVE_KEY, JSON.stringify(legacy));
    const e = new RestaurantEngine(h.storage, h.now); expect(e.state.tide).toBe(rollTide(s.seed, 5)); e.open(); expect(e.state.tide).toBe(rollTide(s.seed, 5));
  });
  it('replays offline days with their tides exactly like live play', async () => {
    const h = harness(), offline = new RestaurantEngine(h.storage, h.now), online = new RestaurantEngine(undefined, h.now);
    await online.resume(); offline.open(); online.open(); offline.suspend();
    h.advance(1800); advance(online, 1800);
    const restored = new RestaurantEngine(h.storage, h.now); await restored.resume();
    const { lastActiveAt: _a, ...a } = restored.state, { lastActiveAt: _b, ...b } = online.state;
    expect(a).toEqual(b); expect(online.state.history.length).toBeGreaterThan(3); expect(new Set(online.state.history.map(r => r.tide)).size).toBe(1);
  });
});

describe('evening glow', () => {
  it('stays at dusk until 19:00 and is fully dark from 21:30', () => {
    const at = (hour: number) => (hour - 17) / 5 * DAY_LENGTH;
    expect(nightLevel(0)).toBe(0); expect(nightLevel(at(19))).toBe(0); expect(nightLevel(at(21.5))).toBe(1); expect(nightLevel(DAY_LENGTH + 90)).toBe(1);
    expect(nightLevel(at(20.25))).toBeCloseTo(.5);
    let previous = 0;
    for (let t = 0; t <= DAY_LENGTH + 90; t += .5) { const n = nightLevel(t); expect(n).toBeGreaterThanOrEqual(previous); expect(n).toBeLessThanOrEqual(1); previous = n; }
  });
  it('shows dusk while planning, whatever the saved clock says', () => {
    expect(sceneNight({ phase: 'planning', elapsed: 140 })).toBe(0); expect(sceneNight({ phase: 'service', elapsed: 140 })).toBe(1);
  });
});
