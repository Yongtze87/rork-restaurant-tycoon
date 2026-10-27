import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { advanceDailyChallenges, challengeObjective, challengeTitle, createDailyChallenges } from '@/management/daily-challenges';
import { DISHES, DISH_IDS, MAX_PRICE, MIN_PRICE, createRestaurant, restaurantSchema, type DishId } from '@/management/types';
import { ZONE_IDS } from '@/management/zones';
import { plotAt, townEffects, createTown } from '@/management/town';

function storage(raw = '') { return { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; }, read: () => JSON.parse(raw) }; }
const reach = (e: RestaurantEngine, ...zones: ('reef' | 'twilight' | 'abyss')[]) => { e.state.town.zones.push(...zones); };
const margin = (dish: DishId) => DISHES[dish].fair - DISHES[dish].cost;

describe('data-driven menu', () => {
  it('defines valid dishes, two per zone, using only the existing stations', () => {
    expect(DISH_IDS).toHaveLength(8); expect(Object.keys(DISHES).sort()).toEqual([...DISH_IDS].sort());
    for (const dish of DISH_IDS) {
      const d = DISHES[dish];
      expect(['prep', 'grill']).toContain(d.station); expect(['kelp', 'fish']).toContain(d.ingredient); expect(ZONE_IDS).toContain(d.zone);
      expect(d.fair).toBeGreaterThanOrEqual(MIN_PRICE); expect(d.fair).toBeLessThanOrEqual(MAX_PRICE); expect(d.cost).toBeLessThan(d.fair); expect(d.seconds).toBeGreaterThan(0);
      expect(d.name.length).toBeGreaterThan(0); expect(d.plural.length).toBeGreaterThan(0); expect(d.description.length).toBeGreaterThan(10);
    }
    for (const zone of ZONE_IDS) {
      const dishes = DISH_IDS.filter(d => DISHES[d].zone === zone);
      expect(dishes.map(d => DISHES[d].station).sort()).toEqual(['grill', 'prep']);
    }
    expect(DISHES.salad).toMatchObject({ name: 'Kelp salad', cost: 7, fair: 24, seconds: 6, station: 'prep', ingredient: 'kelp', zone: 'shallows' });
    expect(DISHES.burger).toMatchObject({ name: 'Vent-seared fish cake', cost: 12, fair: 38, seconds: 10, station: 'grill', ingredient: 'fish', zone: 'shallows' });
  });
  it('makes deeper dishes pricier, slower and more profitable per guest', () => {
    const avg = (zone: string, value: (d: DishId) => number) => { const list = DISH_IDS.filter(d => DISHES[d].zone === zone); return list.reduce((s, d) => s + value(d), 0) / list.length; };
    for (let i = 1; i < ZONE_IDS.length; i++) {
      const [shallow, deep] = [ZONE_IDS[i - 1], ZONE_IDS[i]];
      expect(avg(deep, d => DISHES[d].fair)).toBeGreaterThan(avg(shallow, d => DISHES[d].fair));
      expect(avg(deep, d => DISHES[d].seconds)).toBeGreaterThan(avg(shallow, d => DISHES[d].seconds));
      expect(avg(deep, margin)).toBeGreaterThan(avg(shallow, margin));
    }
  });
  it('starts with only the Shallows dishes on the menu, and every dish has an entry', () => {
    const s = createRestaurant();
    expect(Object.keys(s.menu).sort()).toEqual([...DISH_IDS].sort());
    for (const dish of DISH_IDS) expect(s.menu[dish]).toEqual({ enabled: DISHES[dish].zone === 'shallows', price: DISHES[dish].fair });
    expect(restaurantSchema.safeParse(s).success).toBe(true);
  });
  it('refuses to enable or reprice dishes from zones not reached yet', () => {
    const e = new RestaurantEngine();
    expect(e.setDish('sushi', true, 44)).toBe('Reach the Coral Reef to cook sea-grape sushi.');
    expect(e.setDish('inkNoodles', false, 90)).toMatch(/Reach the Abyss/);
    expect(e.state.menu.sushi.enabled).toBe(false); expect(e.state.menu.inkNoodles.price).toBe(DISHES.inkNoodles.fair);
    reach(e, 'reef'); expect(e.setDish('sushi', true, 44)).toBeNull(); expect(e.state.menu.sushi).toEqual({ enabled: true, price: 44 });
    expect(e.setDish('lobster', true, 500)).toBeNull(); expect(e.state.menu.lobster.price).toBe(MAX_PRICE);
  });
  it('guests order only enabled dishes, and deeper dishes are cooked and paid like any other', () => {
    const e = new RestaurantEngine(); reach(e, 'reef'); e.state.cash = 5000;
    e.setDish('sushi', true, 44); e.setDish('lobster', true, 58); e.setDish('salad', false, 24);
    expect(e.open()).toBeNull();
    const ordered = new Set<string>();
    for (let i = 0; i < 1500; i++) { e.update(.1); e.state.guests.forEach(g => ordered.add(g.dish)); }
    expect([...ordered].sort()).toEqual(['burger', 'lobster', 'sushi']);
    expect(e.state.lifetimeServed).toBeGreaterThan(0); expect(restaurantSchema.safeParse(e.state).success).toBe(true);
  });
  it('keeps guest choice deterministic for the classic two-dish menu', () => {
    const a = new RestaurantEngine(), b = new RestaurantEngine();
    a.open(); b.open(); for (let i = 0; i < 600; i++) { a.update(.1); b.update(.1); }
    expect(a.state.guests.map(g => g.dish)).toEqual(b.state.guests.map(g => g.dish));
    expect(a.state.seed).toBe(b.state.seed);
  });
  it('checks the right station for every enabled dish before opening', () => {
    const e = new RestaurantEngine(); reach(e, 'twilight'); e.setDish('squidSkewers', true, 72); e.setDish('burger', false, 38);
    expect(e.sell(2)).toBeNull(); // the vent grill
    expect(e.open()).toBe('Add a vent grill for glow-squid skewers, or remove it from the menu.');
  });
});

describe('older saves and challenges', () => {
  function legacySave() {
    const s = JSON.parse(JSON.stringify(createRestaurant()));
    s.menu = { salad: { enabled: true, price: 26 }, burger: { enabled: false, price: 40 } };
    s.dailyChallenges = [{ day: 1, kind: 'special', target: 6, progress: 2, reward: 65, rewarded: false }, { day: 1, kind: 'salad', target: 5, progress: 1, reward: 50, rewarded: false }, { day: 1, kind: 'revenue', target: 250, progress: 30, reward: 55, rewarded: false }];
    s.history = [{ revenue: 100, ingredients: 20, served: 4, missed: 0, tips: 5, day: 1, wages: 60, rent: 30, debtPayment: 0, profit: -5, rating: 4, challenges: [{ day: 1, kind: 'burger', target: 5, progress: 5, reward: 50, rewarded: true }] }];
    s.day = 1; delete s.town.zones;
    return s;
  }
  it('loads a salad/burger save with the new dishes off and at their suggested price', () => {
    const store = storage(JSON.stringify(legacySave())), e = new RestaurantEngine(store);
    expect(e.loadWarning).toBe('');
    expect(e.state.menu.salad).toEqual({ enabled: true, price: 26 }); expect(e.state.menu.burger).toEqual({ enabled: false, price: 40 });
    for (const dish of DISH_IDS.slice(2)) expect(e.state.menu[dish]).toEqual({ enabled: false, price: DISHES[dish].fair });
    expect(e.state.town.zones).toEqual(['shallows']);
  });
  it('migrates old salad/burger challenge kinds into dish challenges, keeping progress', () => {
    const e = new RestaurantEngine(storage(JSON.stringify(legacySave())));
    expect(e.state.dailyChallenges[1]).toEqual({ day: 1, kind: 'dish', dish: 'salad', target: 5, progress: 1, reward: 50, rewarded: false });
    expect(e.state.dailyChallenges[0].dish).toBeNull();
    expect(e.state.history[0].challenges[0]).toMatchObject({ kind: 'dish', dish: 'burger', rewarded: true });
    expect(challengeTitle(e.state.dailyChallenges[1])).toBe('Kelp lovers'); expect(challengeObjective(e.state.dailyChallenges[1])).toBe('Sell 5 kelp salads');
    expect(restaurantSchema.safeParse(e.state).success).toBe(true);
  });
  it('rejects a dish challenge without a dish, and a dish on another kind', () => {
    const s = createRestaurant();
    expect(restaurantSchema.safeParse({ ...s, dailyChallenges: [{ day: 1, kind: 'dish', target: 5, progress: 0, reward: 50, rewarded: false }] }).success).toBe(false);
    expect(restaurantSchema.safeParse({ ...s, dailyChallenges: [{ day: 1, kind: 'served', dish: 'salad', target: 5, progress: 0, reward: 50, rewarded: false }] }).success).toBe(false);
  });
  it('a dish challenge counts only its own dish', () => {
    const board = [{ day: 1, kind: 'dish' as const, dish: 'lobster' as const, target: 2, progress: 0, reward: 50, rewarded: false }];
    advanceDailyChallenges(board, { dish: 'sushi', special: false, waiting: 10, price: 44 }, 0); expect(board[0].progress).toBe(0);
    advanceDailyChallenges(board, { dish: 'lobster', special: false, waiting: 10, price: 58 }, 0); expect(board[0].progress).toBe(1);
  });
  it('rolls dish challenges for deeper dishes, keeping targets inside the save limits for expensive menus', () => {
    const s = createRestaurant(); s.town.zones = ['shallows', 'reef', 'twilight', 'abyss'];
    for (const dish of DISH_IDS) s.menu[dish] = { enabled: dish === 'inkNoodles', price: MAX_PRICE };
    for (let day = 1; day <= 60; day++) {
      const board = createDailyChallenges({ ...s, day });
      const dish = board.find(c => c.kind === 'dish'); expect(dish?.dish).toBe('inkNoodles');
      expect(restaurantSchema.safeParse({ ...s, day, dailyChallenges: board }).success).toBe(true);
    }
    expect(challengeObjective({ day: 1, kind: 'dish', dish: 'inkNoodles', target: 6, progress: 0, reward: 50, rewarded: false })).toBe('Sell 6 bowls of abyssal ink noodles');
  });
  it('saves and reloads a menu with deeper dishes', () => {
    const store = storage(), e = new RestaurantEngine(store); reach(e, 'reef'); e.setDish('sushi', true, 50); e.save(); expect(store.read().menu.sushi.price).toBe(50);
    const back = new RestaurantEngine(store); expect(back.state.menu.sushi).toEqual({ enabled: true, price: 50 }); expect(back.state.town.zones).toEqual(['shallows', 'reef']);
  });
});

describe('ingredient town effects', () => {
  it('kelp farms cheapen kelp dishes and fisheries cheapen fish dishes, whatever the zone', () => {
    const e = new RestaurantEngine(), c = 4;
    Object.assign(plotAt(e.state.town, c + 1, c)!, { owned: true, building: 'kelpFarm', level: 10 }); // 10 × 4% × 1.5 → capped 60%
    expect(e.townEffects()).toMatchObject({ kelpCost: .4, fishCost: 1 });
    for (const dish of DISH_IDS) expect(e.dishCost(dish)).toBe(DISHES[dish].ingredient === 'kelp' ? Math.max(1, Math.round(DISHES[dish].cost * .4)) : DISHES[dish].cost);
    Object.assign(plotAt(e.state.town, c - 1, c)!, { owned: true, building: 'fishery', level: 5 });
    expect(e.townEffects().fishCost).toBeCloseTo(.7);
    expect(e.dishCost('lobster')).toBe(Math.round(20 * .7)); expect(e.dishCost('sushi')).toBe(Math.round(14 * .7)); expect(e.dishCost('jellySalad')).toBe(Math.round(18 * .4));
  });
  it('is neutral for a new town', () => { expect(townEffects(createTown())).toEqual({ kelpCost: 1, fishCost: 1, extraCrew: 0, arrivalBonus: 0, crewSpeed: 1 }); });
});
