import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { advanceDailyChallenges, challengeBonus, createDailyChallenges, isSpecialGuest } from '@/management/daily-challenges';
import { createRestaurant, restaurantSchema, type DailyChallenge, type Guest } from '@/management/types';

const challenge = (kind: DailyChallenge['kind'], target = 3): DailyChallenge => ({ day: 1, kind, target, progress: 0, reward: 50, rewarded: false });
const meal = { dish: 'salad' as const, special: true, waiting: 20, price: 24 };
function advance(e: RestaurantEngine, seconds: number): void { for (let i = 0; i < seconds * 10; i++) e.update(.1); }
function finish(e: RestaurantEngine): void { const day = e.state.day; for (let i = 0; i < 2600 && e.state.day === day; i++) e.update(.1); }
function harness() {
  let raw = '', now = 1_800_000_000_000;
  return { storage: { getItem: () => raw || null, setItem: (_k: string, v: string) => { raw = v; } }, now: () => now, advanceTime: (s: number) => { now += s * 1000; }, read: () => JSON.parse(raw) };
}

describe('daily challenge generation', () => {
  it('creates three distinct bounded tasks with zero fabricated progress without consuming service RNG', () => {
    const s = createRestaurant(), before = JSON.stringify(s), kinds = new Set<string>(), boards = new Set<string>();
    for (let day = 1; day <= 100; day++) {
      const board = createDailyChallenges({ ...s, day });
      expect(board).toHaveLength(3); expect(new Set(board.map(c => c.kind)).size).toBe(3);
      for (const c of board) { expect(c.day).toBe(day); expect(c.progress).toBe(0); expect(c.rewarded).toBe(false); expect(c.reward).toBeLessThanOrEqual(85); kinds.add(c.kind); }
      expect(board[0].target).toBeGreaterThanOrEqual(6); expect(board[0].target).toBeLessThanOrEqual(10);
      boards.add(JSON.stringify(board.map(({ day: _, ...c }) => c)));
      expect(restaurantSchema.safeParse({ ...s, day, dailyChallenges: board }).success).toBe(true);
    }
    expect(kinds.size).toBe(7); expect(boards.size).toBeGreaterThan(20); expect(JSON.stringify(s)).toBe(before);
    expect(createDailyChallenges(s)).toEqual(createDailyChallenges(s));
  });
  it.each(['salad', 'burger'] as const)('selects only cookable, enabled dishes after planning the %s menu', dish => {
    const e = new RestaurantEngine(); const other = dish === 'salad' ? 'burger' : 'salad'; e.setDish(other, false, 24);
    expect(e.state.dailyChallenges).toEqual([]); e.open(); expect(e.state.dailyChallenges[1].kind).toBe(dish);
    const board = structuredClone(e.state.dailyChallenges); expect(e.open()).toBeTruthy(); expect(e.state.dailyChallenges).toEqual(board);
  });
  it('scales currency goals to low prices, and excludes tips when the menu cannot produce them reliably', () => {
    const s = createRestaurant(); s.menu.salad.price = 10; s.menu.burger.price = 10;
    for (let day = 1; day <= 100; day++) {
      for (const c of createDailyChallenges({ ...s, day })) {
        if (c.kind === 'tips') expect(c.target).toBeLessThanOrEqual(13);
        if (c.kind === 'revenue') expect(c.target).toBeLessThanOrEqual(140);
      }
    }
    s.furniture = s.furniture.filter(f => !['plant', 'lamp'].includes(f.kind));
    for (let day = 1; day <= 20; day++) expect(createDailyChallenges({ ...s, day }).some(c => c.kind === 'tips')).toBe(false);
  });
  it('uses deterministic star designations without changing orders or spawning fake guests', () => {
    const e = new RestaurantEngine(); e.open(); advance(e, 80);
    expect(e.state.guests.length).toBeGreaterThan(0);
    e.state.guests.forEach(g => expect(g.special).toBe(isSpecialGuest(1, g.id)));
    const special = Array.from({ length: 1000 }, (_, i) => isSpecialGuest(1, i)).filter(Boolean).length;
    expect(special).toBeGreaterThan(600); expect(special).toBeLessThan(730);
  });
});

describe('committed service progress and one-time rewards', () => {
  it('counts matching dishes, stars, speed, sales and tips precisely and caps progress', () => {
    const all: DailyChallenge[] = (['special', 'salad', 'burger', 'served', 'quick', 'revenue', 'tips'] as const).map(kind => challenge(kind, kind === 'revenue' ? 25 : 3));
    advanceDailyChallenges(all, meal, 2);
    expect(all.map(c => c.progress)).toEqual([1, 1, 0, 1, 1, 25, 2]);
    expect(challengeBonus(all)).toBe(50);
    advanceDailyChallenges(all, { ...meal, dish: 'burger', special: false, waiting: 25.1 }, 0);
    expect(all.map(c => c.progress)).toEqual([1, 1, 1, 2, 1, 25, 2]);
    advanceDailyChallenges(all, { ...meal, waiting: 25 }, 2);
    expect(all.find(c => c.kind === 'quick')?.progress).toBe(2);
    for (let i = 0; i < 10; i++) advanceDailyChallenges(all, meal, 2);
    const before = JSON.stringify(all); expect(advanceDailyChallenges(all, meal, 2)).toEqual([]); expect(JSON.stringify(all)).toBe(before);
  });
  it('counts only first payments, credits and saves each bonus atomically, never as sales or guest receipts', () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open();
    e.state.dailyChallenges = [challenge('served', 1), challenge('revenue', 10), challenge('salad', 20)];
    for (let i = 0; i < 800 && e.state.totals.served === 0; i++) e.update(.1);
    expect(challengeBonus(e.state.dailyChallenges)).toBe(100);
    expect(e.state.cash).toBe(1250 + e.state.totals.revenue + e.state.totals.tips - e.state.totals.ingredients + 100);
    expect(e.incomeReceipts.filter(r => r.source === 'challenge')).toHaveLength(2);
    expect(e.incomeReceipts.filter(r => r.source === 'challenge').every(r => r.guestId === null)).toBe(true);
    expect(h.read().lifetimeChallengeBonus).toBe(100);
    const reload = new RestaurantEngine(h.storage, h.now); expect(reload.state).toEqual(e.state); expect(reload.incomeReceipts).toEqual([]);
    const guest = reload.state.guests.find(g => g.paid)!; const server = reload.state.staff.find(s => s.role === 'server')!;
    const before = structuredClone(reload.state.dailyChallenges), served = reload.state.totals.served;
    server.task = 'deliver'; server.guestId = guest.id; server.route = []; reload.state.nextArrival = 1000; reload.update(.1);
    expect(reload.state.dailyChallenges).toEqual(before); expect(reload.state.totals.served).toBe(served); expect(reload.state.lifetimeChallengeBonus).toBe(100);
  });
  it('ignores arrivals and missed guests and freezes progress on pause', () => {
    const e = new RestaurantEngine(); e.open(); advance(e, 2);
    expect(e.state.guests.length).toBeGreaterThan(0); expect(e.state.dailyChallenges.every(c => c.progress === 0)).toBe(true);
    const before = structuredClone(e.state); e.pause(true); advance(e, 400); expect(e.state.dailyChallenges).toEqual(before.dailyChallenges);
    e.pause(false); e.state.cash = 0; advance(e, 80); expect(e.state.totals.missed).toBeGreaterThan(0); expect(e.state.dailyChallenges.every(c => c.progress === 0)).toBe(true);
  });
  it('archives paid and expired objectives without including bonuses in service profit or carrying progress', () => {
    const e = new RestaurantEngine(); e.open(); e.state.dailyChallenges = [challenge('served', 1), challenge('salad', 100), challenge('burger', 100)]; finish(e);
    const report = structuredClone(e.state.history[0]); expect(challengeBonus(report.challenges)).toBe(50);
    expect(report.challenges[1].rewarded).toBe(false); expect(report.challenges[1].progress).toBeGreaterThan(0);
    expect(report.profit).toBe(report.revenue + report.tips - report.ingredients - report.wages - report.rent);
    expect(e.state.cash).toBe(1250 + report.profit + 50); expect(e.state.dailyChallenges.every(c => c.progress === 0 && c.day === 2)).toBe(true);
    finish(e); expect(e.state.history[0]).toEqual(report);
  });
  it('closing immediately pays nothing and renovation waits to roll a menu-compatible board', () => {
    const e = new RestaurantEngine(); e.open(); e.closeEarly(); e.update(.1);
    expect(e.state.lifetimeChallengeBonus).toBe(0); expect(e.state.dailyChallenges).toEqual([]);
    e.setDish('burger', false, 38); e.open(); expect(e.state.dailyChallenges[1].kind).toBe('salad');
    e.reset(); expect(e.state.dailyChallenges).toEqual([]); expect(e.state.lifetimeChallengeBonus).toBe(0);
  });
});

describe('challenge persistence and offline progress', () => {
  it('retains unfinished progress, guest stars and the exact board across reload without rerolling', () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); advance(e, 55); e.save();
    expect(e.state.dailyChallenges.some(c => c.progress > 0)).toBe(true);
    expect(new RestaurantEngine(h.storage, h.now).state).toEqual(e.state);
  });
  it('awards identical bonuses live and offline across days, and never re-awards on reload', async () => {
    const h = harness(), live = new RestaurantEngine(undefined, h.now), away = new RestaurantEngine(h.storage, h.now);
    live.open(); away.open(); away.suspend(); h.advanceTime(900); advance(live, 900); await away.resume();
    expect(away.state.dailyChallenges).toEqual(live.state.dailyChallenges); expect(away.state.history).toEqual(live.state.history);
    expect(away.state.cash).toBe(live.state.cash); expect(away.state.lifetimeChallengeBonus).toBeGreaterThan(0);
    expect(away.awaySummary?.challengeBonus).toBe(away.state.lifetimeChallengeBonus); expect(away.incomeReceipts).toEqual([]);
    const restored = new RestaurantEngine(h.storage, h.now); await restored.resume(); expect(restored.state).toEqual(away.state);
  });
  it.each([50, 151])('migrates a legacy active save at %ss without retroactive bonuses or impossible late goals', seconds => {
    const h = harness(), old = new RestaurantEngine(undefined, h.now); old.open(); advance(old, seconds);
    const legacy = JSON.parse(JSON.stringify(old.state)); delete legacy.dailyChallenges; delete legacy.lifetimeChallengeBonus;
    legacy.guests.forEach((g: Partial<Guest>) => { delete g.special; }); legacy.history.forEach((r: { challenges?: unknown }) => { delete r.challenges; });
    h.storage.setItem('', JSON.stringify(legacy)); const e = new RestaurantEngine(h.storage, h.now);
    expect(e.loadWarning).toBe(''); expect(e.state.cash).toBe(old.state.cash); expect(e.state.dailyChallenges).toEqual([]);
    expect(e.state.guests.every(g => g.special === false)).toBe(true); finish(e);
    expect(e.state.history[0].challenges).toEqual([]); expect(e.state.dailyChallenges).toHaveLength(3);
  });
  it('rejects malformed reward flags and mismatched challenge days without overwriting the save', () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.open(); const s = h.read();
    s.dailyChallenges[0].rewarded = true; expect(restaurantSchema.safeParse(s).success).toBe(false);
    s.dailyChallenges[0].rewarded = false; s.dailyChallenges[0].day = 9; h.storage.setItem('', JSON.stringify(s));
    const invalid = new RestaurantEngine(h.storage, h.now); expect(invalid.loadWarning).not.toBe(''); invalid.save(); expect(h.read()).toEqual(s);
  });
});
