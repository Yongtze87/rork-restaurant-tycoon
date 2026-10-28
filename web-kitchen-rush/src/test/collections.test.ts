import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { RestaurantEngine, OFFLINE_SERVICE_DAYS } from '@/management/engine';
import { ACHIEVEMENTS, FAMILY_IDS, FIVE_STAR_RATING, PERFECT_DAY_MIN_SERVED, achievement, claimableAchievements, isClaimable, recordDay, visibleSteps } from '@/management/collections';
import { BUILDABLE, TOWN_SIZE } from '@/management/town';
import { TIDE_KINDS, TIDES } from '@/management/tides';
import { DISH_IDS, SAVE_KEY, createRestaurant, freshCollections, restaurantSchema, type Report, INGREDIENT_IDS } from '@/management/types';

// These tests compare long offline replays with live play, so the crew may work more than one day while away.
beforeEach(() => { RestaurantEngine.offlineDays = Infinity; });
afterEach(() => { RestaurantEngine.offlineDays = OFFLINE_SERVICE_DAYS; });


function harness() {
  let now = 1_800_000_000_000, raw = '';
  const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
  return { storage, now: () => now, advance: (seconds: number) => { now += seconds * 1000; }, read: () => JSON.parse(raw) };
}
function advance(e: RestaurantEngine, seconds: number) { for (let i = 0; i < seconds * 10; i++) e.update(.1); }
const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);
const C = Math.floor(TOWN_SIZE / 2);
const day = (over: Partial<Report>): Report => ({ revenue: 0, ingredients: 0, served: 20, missed: 0, tips: 0, challenges: [], day: 2, wages: 60, rent: 30, debtPayment: 0, profit: 0, rating: 4, tide: 'feast', branch: 0, ...over });

describe('achievement definitions', () => {
  it('have unique ids, positive rewards and cover every dish, building, zone and tide', () => {
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.every(a => a.reward.pearls > 0 && a.target > 0)).toBe(true);
    for (const dish of DISH_IDS) expect(ACHIEVEMENTS.filter(a => a.chain === `dish-${dish}`).map(a => a.target)).toEqual([10, 50, 200]);
    for (const kind of BUILDABLE) expect(achievement(`own-${kind}`)).toBeDefined();
    for (const tide of TIDE_KINDS) if (TIDES[tide].weight > 0) expect(achievement(`tide-${tide}`)).toBeDefined();
    for (const group of INGREDIENT_IDS) expect(achievement(`season-${group}`)).toBeDefined();
    expect(['zone-reef', 'zone-twilight', 'zone-abyss'].every(id => achievement(id))).toBe(true);
    expect(FAMILY_IDS.every(f => ACHIEVEMENTS.some(a => a.family === f))).toBe(true);
  });
  it('start with nothing claimable on a fresh restaurant', () => {
    expect(claimableAchievements(createRestaurant())).toEqual([]);
  });
});

describe('counters', () => {
  it('count each paid dish exactly once, matching guests served, across many days', () => {
    const e = new RestaurantEngine(); e.open(); advance(e, 700);
    expect(e.state.history.length).toBeGreaterThan(2);
    expect(sum(e.state.collections.served)).toBe(e.state.lifetimeServed);
    expect(e.state.collections.served.salad + e.state.collections.served.burger).toBe(e.state.lifetimeServed);
    expect(e.state.collections.served.sushi).toBe(0);
  });
  it('record each closed day once: tides served under, perfect days and five-star days', () => {
    const e = new RestaurantEngine(); e.open(); advance(e, 700);
    const h = e.state.history, c = e.state.collections;
    expect([...c.tides].sort()).toEqual([...new Set(h.filter(r => r.served > 0).map(r => r.tide))].sort());
    expect(c.perfectDays).toBe(h.filter(r => r.missed === 0 && r.served >= PERFECT_DAY_MIN_SERVED).length);
    expect(c.fiveStarDays).toBe(h.filter(r => r.rating >= FIVE_STAR_RATING).length);
  });
  it('recordDay keeps each tide once, ignores empty days and checks the perfect-day and 5-star rules', () => {
    const c = freshCollections();
    recordDay(c, day({ served: 0, tide: 'whale' })); expect(c.tides).toEqual([]);
    recordDay(c, day({})); recordDay(c, day({})); expect(c.tides).toEqual(['feast']); expect(c.perfectDays).toBe(2);
    recordDay(c, day({ served: PERFECT_DAY_MIN_SERVED - 1 })); recordDay(c, day({ missed: 1 })); expect(c.perfectDays).toBe(2);
    recordDay(c, day({ rating: 4.94 })); expect(c.fiveStarDays).toBe(0); recordDay(c, day({ rating: 5 })); expect(c.fiveStarDays).toBe(1);
  });
  it('remembers the best furniture level even after the piece is sold', () => {
    const e = new RestaurantEngine(); e.state.cash = 100_000;
    for (let i = 0; i < 5; i++) expect(e.upgradeFurniture(6)).toBeNull();
    expect(e.state.collections.bestFurniture).toBe(6); expect(isClaimable(e.state, achievement('furniture-level-6')!)).toBe(true);
    expect(e.sell(6)).toBeNull(); expect(isClaimable(e.state, achievement('furniture-level-6')!)).toBe(true);
  });
  it('counts a building only once its construction is finished', () => {
    let now = 1_800_000_000_000; const e = new RestaurantEngine(undefined, () => now); e.state.cash = 100_000;
    e.unlockPlot(C + 1, C); e.build(C + 1, C, 'garden');
    expect(isClaimable(e.state, achievement('own-garden')!)).toBe(false);
    now += 3_600_000; e.update(.1); expect(isClaimable(e.state, achievement('own-garden')!)).toBe(true);
  });
  it('offline replay moves the counters exactly like live 1x play', async () => {
    const h = harness(), offline = new RestaurantEngine(h.storage, h.now), online = new RestaurantEngine(undefined, h.now);
    await online.resume(); offline.open(); online.open(); advance(offline, 10); advance(online, 10); offline.suspend();
    h.advance(800); advance(online, 800);
    const restored = new RestaurantEngine(h.storage, h.now); await restored.resume();
    expect(restored.state.history.length).toBeGreaterThan(2);
    expect(restored.state.collections).toEqual(online.state.collections);
    expect(sum(restored.state.collections.served)).toBe(restored.state.lifetimeServed);
  });
});

describe('claiming', () => {
  it('pays pearls once, in tier order, with clear errors', () => {
    const e = new RestaurantEngine(), pearls = e.state.town.pearls;
    expect(e.claimAchievement('nope')).toBe('Choose an achievement first.');
    expect(e.claimAchievement('dish-salad-bronze')).toBe('Complete this achievement first.');
    e.state.collections.served.salad = 60;
    expect(e.claimAchievement('dish-salad-silver')).toBe('Complete this achievement first.');
    expect(e.rewardsReady()).toBe(1);
    expect(e.claimAchievement('dish-salad-bronze')).toBeNull(); expect(e.state.town.pearls).toBe(pearls + 3);
    expect(e.claimAchievement('dish-salad-bronze')).toBe('You already collected this reward.'); expect(e.state.town.pearls).toBe(pearls + 3);
    expect(visibleSteps(e.state, 'dish').find(a => a.chain === 'dish-salad')?.id).toBe('dish-salad-silver');
    expect(e.claimAchievement('dish-salad-silver')).toBeNull(); expect(e.state.town.pearls).toBe(pearls + 11);
    expect(e.claimAchievement('dish-salad-gold')).toBe('Complete this achievement first.');
    expect(e.state.collections.claimed).toEqual(['dish-salad-bronze', 'dish-salad-silver']); expect(e.rewardsReady()).toBe(0);
    expect(restaurantSchema.safeParse(e.state).success).toBe(true);
  });
  it('credits Tide charms and counts milestones in the ready badge', () => {
    const e = new RestaurantEngine(), charms = e.state.town.charms.tide;
    e.state.town.zones.push('reef'); e.state.lifetimeServed = 5;
    expect(e.rewardsReady()).toBe(2);
    expect(e.claimAchievement('zone-reef')).toBeNull(); expect(e.state.town.charms.tide).toBe(charms + 1);
    expect(e.event).toBe('Achievement: Coral Reef. +15 pearls and a Tide charm.');
    expect(e.rewardsReady()).toBe(1); expect(e.claim('first-service')).toBeNull(); expect(e.rewardsReady()).toBe(0);
  });
  it('keeps claims across a reload', () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now); e.state.collections.served.burger = 10;
    expect(e.claimAchievement('dish-burger-bronze')).toBeNull();
    const again = new RestaurantEngine(h.storage, h.now);
    expect(again.state.collections.claimed).toEqual(['dish-burger-bronze']); expect(again.claimAchievement('dish-burger-bronze')).toBe('You already collected this reward.');
  });
});

describe('old saves', () => {
  it('load without collections and are seeded from receipts and furniture, once', () => {
    const s = createRestaurant(); s.day = 4; s.lifetimeServed = 120; s.furniture[0].level = 7;
    s.history = [day({ day: 1, tide: 'calm', missed: 2 }), day({ day: 2, tide: 'murky' }), day({ day: 3, tide: 'shoal', served: 0, missed: 3 })];
    const { collections: _, ...legacy } = s;
    const h = harness(); h.storage.setItem(SAVE_KEY, JSON.stringify(legacy));
    const e = new RestaurantEngine(h.storage, h.now);
    expect(e.loadWarning).toBe('');
    expect(e.state.collections).toEqual({ ...freshCollections(), tides: ['calm', 'murky'], perfectDays: 1, bestFurniture: 7 });
    expect(claimableAchievements(e.state).map(a => a.id).sort()).toEqual(['furniture-level-6', 'perfect-day', 'served-100', 'tide-calm', 'tide-murky']);
    e.save(); const again = new RestaurantEngine(h.storage, h.now);
    expect(again.state.collections.perfectDays).toBe(1); expect(again.state.collections.tides).toEqual(['calm', 'murky']);
  });
  it('fill in fields missing from a partial collections object', () => {
    const s = createRestaurant(), raw = JSON.parse(JSON.stringify(s));
    raw.collections = { served: { salad: 4 } };
    const parsed = restaurantSchema.parse(raw);
    expect(parsed.collections).toEqual({ ...freshCollections(), served: { ...freshCollections().served, salad: 4 } });
    expect(restaurantSchema.safeParse({ ...raw, collections: { claimed: ['a', 'a'] } }).success).toBe(false);
  });
});
