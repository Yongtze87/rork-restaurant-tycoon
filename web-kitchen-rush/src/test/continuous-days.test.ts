import { describe, expect, it } from 'vitest';
import { OFFLINE_SERVICE_HOURS, RestaurantEngine } from '@/management/engine';
import { SAVE_KEY, createRestaurant, restaurantSchema } from '@/management/types';

function harness() {
  let now = 1_800_000_000_000, raw = '';
  const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
  return { storage, now: () => now, advance: (seconds: number) => { now += seconds * 1000; }, read: () => JSON.parse(raw) };
}
function advance(e: RestaurantEngine, seconds: number) { for (let i = 0; i < seconds * 10; i++) e.update(.1); }
function business(e: RestaurantEngine) { const { lastActiveAt: _, ...state } = e.state; return state; }

describe('continuous local restaurant', () => {
  it('rolls into consecutive days without a report phase, duplicate wages or goals', () => {
    const e = new RestaurantEngine(); e.open(); advance(e, 900);
    expect(e.state.day).toBeGreaterThan(3); expect(e.state.phase).toBe('service');
    expect(e.state.history.map(r => r.day)).toEqual(Array.from({ length: e.state.day - 1 }, (_, i) => i + 1));
    expect(e.state.cash).toBe(1250 + e.state.lifetimeChallengeBonus + e.state.history.reduce((sum, r) => sum + r.profit, 0) + e.state.totals.revenue + e.state.totals.tips - e.state.totals.ingredients);
    expect(e.state.claimed).toEqual([]); expect(restaurantSchema.safeParse(e.state).success).toBe(true);
  });
  it('offline replay is identical to live 1x service across multiple days and reload is idempotent', async () => {
    const h = harness(), offline = new RestaurantEngine(h.storage, h.now), online = new RestaurantEngine(undefined, h.now);
    await online.resume(); // the visible session also received today's daily gift
    offline.open(); online.open(); advance(offline, 21); advance(online, 21); offline.suspend();
    h.advance(900); advance(online, 900);
    const restored = new RestaurantEngine(h.storage, h.now); await restored.resume();
    expect(business(restored)).toEqual(business(online)); expect(restored.incomeReceipts).toEqual([]);
    expect(restored.awaySummary?.days).toBeGreaterThan(3); expect(restored.awaySummary?.served).toBeGreaterThan(0);
    const again = new RestaurantEngine(h.storage, h.now); await again.resume(); expect(again.state).toEqual(restored.state); expect(again.awaySummary).toBeNull();
  });
  it('uses 1x offline even when the last visible speed was 3x', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); e.setSpeed(3); e.suspend(); h.advance(10); await e.resume(); expect(e.state.clock).toBeCloseTo(10);
  });
  it('keeps an explicit pause across closing, reload and time away', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); advance(e, 10); e.pause(true); const clock = e.state.clock;
    e.suspend(); h.advance(10000); const restored = new RestaurantEngine(h.storage, h.now); await restored.resume();
    expect(restored.paused).toBe(true); expect(restored.state.clock).toBe(clock); restored.pause(false); advance(restored, 1); expect(restored.state.clock).toBeCloseTo(clock + 1);
  });
  it('does not reset the departure checkpoint on repeated pagehide events', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); e.suspend(); h.advance(60); e.suspend(); e.save();
    expect(h.read().lastActiveAt).toBe(h.now() - 60000); await e.resume(); expect(e.state.clock).toBeCloseTo(60);
  });
  it('finishes guests for renovation, then stays editable offline without charging idle days', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); advance(e, 40); e.closeEarly(); e.suspend(); h.advance(900); await e.resume();
    expect(e.state.phase).toBe('planning'); expect(e.state.day).toBe(2); expect(e.state.history).toHaveLength(1); expect(e.hire('chef')).toBeNull();
    const cash = e.state.cash; e.suspend(); h.advance(1000); await e.resume(); expect(e.state.cash).toBe(cash); expect(e.open()).toBeNull();
  });
  it('stops charging future days if the business lacks startup funds', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); e.state.cash = 0; e.suspend(); h.advance(900); await e.resume();
    expect(e.state.phase).toBe('planning'); expect(e.state.history).toHaveLength(1); expect(e.event).toContain('Waiting for the owner');
  });
  it('migrates old report saves once, preserving paid receipts and ignoring unknown offline time', async () => {
    const s = createRestaurant(); s.phase = 'report'; s.history = [{ ...s.totals, challenges: [], day: 1, wages: 60, rent: 30, debtPayment: 0, profit: -90, rating: 3, tide: 'calm' }]; s.cash = 1160;
    const { lastActiveAt: _, isPaused: _p, renovation: _r, ...legacy } = s;
    const h = harness(); h.storage.setItem(SAVE_KEY, JSON.stringify(legacy)); const e = new RestaurantEngine(h.storage, h.now); await e.resume();
    expect(e.state.day).toBe(2); expect(e.state.phase).toBe('service'); expect(e.state.cash).toBe(1160); expect(e.state.clock).toBe(0); expect(e.state.history).toHaveLength(1);
  });
  it('ignores backward clocks and does not destroy an unreadable save', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); e.suspend(); h.advance(-600); await e.resume(); expect(e.state.clock).toBe(0);
    let raw = '{broken'; const broken = new RestaurantEngine({ getItem: () => raw, setItem: (_k, value) => { raw = value; } }, h.now); await broken.resume(); expect(raw).toBe('{broken');
  });
  it('can hide and show during a replay without leaving the visible game suspended', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); e.suspend(); h.advance(900);
    const task = e.resume(); e.suspend(); await e.resume(); await task;
    const clock = e.state.clock; e.update(.1); expect(e.state.clock).toBeCloseTo(clock + .1); expect(e.catchingUp).toBe(false);
  });
  it('defers pause until earned offline progress is accounted for', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); e.suspend(); h.advance(900);
    const task = e.resume(); e.pause(true); await task;
    expect(e.state.clock).toBeCloseTo(900); expect(e.paused).toBe(true); expect(h.read().isPaused).toBe(true);
  });
  it('includes wall time spent replaying and does not erase it on the next save', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); e.suspend(); h.advance(900);
    const task = e.resume(); h.advance(60); await task; e.suspend();
    expect(e.state.clock).toBeCloseTo(960); expect(h.read().lastActiveAt).toBe(h.now());
    const restored = new RestaurantEngine(h.storage, h.now); await restored.resume(); expect(restored.state.clock).toBeCloseTo(960);
  });
  it('replays at most the offline cap of an eight-hour absence, with bounded history and valid checkpoints', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); e.suspend(); h.advance(8 * 3600); await e.resume();
    expect(e.state.clock).toBeCloseTo(OFFLINE_SERVICE_HOURS * 3600); expect(e.state.day).toBeGreaterThan(50); expect(e.state.history).toHaveLength(20);
    expect(e.awaySummary?.capped).toBe(true); expect(e.state.lastActiveAt).toBe(h.now());
    expect(restaurantSchema.safeParse(h.read()).success).toBe(true); expect(e.state.history[19].day).toBe(e.state.day - 1); expect(e.incomeReceipts).toEqual([]);
    // Coming back again doesn't replay the skipped hours.
    const clock = e.state.clock; await e.resume(); expect(e.state.clock).toBe(clock);
  });
  it('checkpoints long catch-up and yields, with reset cancelling the old session', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); e.suspend(); h.advance(10000);
    const recovering = e.resume(); expect(e.catchingUp).toBe(true); expect(h.read().lastActiveAt).toBeLessThan(h.now());
    e.reset(); await recovering; expect(e.state.day).toBe(1); expect(e.state.cash).toBe(1250); expect(e.catchingUp).toBe(false);
  });
});
