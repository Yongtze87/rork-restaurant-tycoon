import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { BUILDINGS, MAX_LEVEL, TOWN_BALANCE, TOWN_SIZE, baseSeconds, createTown, finishCost, jobSeconds, lookFor, plotAt, townEffects, unlockCost, upgradeCost } from '@/management/town';
import { restaurantSchema } from '@/management/types';

function harness() {
  let now = 1_800_000_000_000, raw = '';
  const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
  return { storage, now: () => now, advance: (seconds: number) => { now += seconds * 1000; } };
}
const C = Math.floor(TOWN_SIZE / 2);
function rich(h = harness()) { const e = new RestaurantEngine(h.storage, h.now); e.state.cash = 100_000; return { e, h }; }

describe('town plots', () => {
  it('starts with only the restaurant plot and neutral effects', () => {
    const town = createTown();
    expect(town.plots.filter(p => p.owned)).toEqual([{ x: C, z: C, owned: true, building: 'restaurant', level: 1, job: null }]);
    expect(townEffects(town)).toEqual({ kelpCost: 1, fishCost: 1, extraCrew: 0, arrivalBonus: 0, crewSpeed: 1 });
  });
  it('unlocks only plots touching the town, charging a growing price', () => {
    const { e } = rich();
    expect(e.unlockPlot(C + 2, C + 2)).toMatch(/next to your town/);
    const first = unlockCost(e.state.town); expect(e.unlockPlot(C + 1, C)).toBeNull();
    expect(e.state.cash).toBe(100_000 - first);
    expect(unlockCost(e.state.town)).toBeGreaterThan(first);
    expect(e.unlockPlot(C + 2, C)).toBeNull();
    expect(e.unlockPlot(C + 1, C)).toMatch(/already own/);
  });
  it('refuses to unlock without the cash and changes nothing', () => {
    const e = new RestaurantEngine(); e.state.cash = 10;
    expect(e.unlockPlot(C + 1, C)).toMatch(/Unlocking costs/); expect(plotAt(e.state.town, C + 1, C)!.owned).toBe(false); expect(e.state.cash).toBe(10);
  });
});

describe('construction time', () => {
  it('builds in real time, applies effects only when finished, and survives a reload', () => {
    const { e, h } = rich();
    e.unlockPlot(C + 1, C); expect(e.build(C + 1, C, 'kelpFarm')).toBeNull();
    expect(e.state.cash).toBe(100_000 - unlockCost(createTown()) - BUILDINGS.kelpFarm.buildCost);
    expect(e.dishCost('salad')).toBe(7);
    h.advance(BUILDINGS.kelpFarm.buildSeconds - 1); e.update(.1); expect(plotAt(e.state.town, C + 1, C)!.job).not.toBeNull();
    const reloaded = new RestaurantEngine(h.storage, h.now); expect(reloaded.state.town).toEqual(e.state.town);
    h.advance(1); reloaded.update(.1);
    expect(plotAt(reloaded.state.town, C + 1, C)!.job).toBeNull(); expect(reloaded.lastCompletion?.text).toBe('Kelp farm is built.');
    // Level 1 next to the restaurant: 6% × 1.5 = 9% cheaper ($7 → $6.37; the cents carry between dishes).
    expect(reloaded.townEffects().kelpCost).toBeCloseTo(.91); expect(reloaded.dishCost('salad')).toBeCloseTo(6.37);
    expect(restaurantSchema.safeParse(reloaded.state).success).toBe(true);
  });
  it('finishes construction while the owner is away, even with the restaurant closed', async () => {
    const { e, h } = rich(); e.unlockPlot(C, C + 1); e.build(C, C + 1, 'homes'); e.suspend();
    h.advance(3600);
    const back = new RestaurantEngine(h.storage, h.now); await back.resume();
    expect(plotAt(back.state.town, C, C + 1)!.job).toBeNull(); expect(back.crewLimit()).toBe(7);
  });
  it('allows one job per builder, and a second builder bought with pearls', () => {
    const { e } = rich(); e.unlockPlot(C + 1, C); e.unlockPlot(C - 1, C);
    expect(e.build(C + 1, C, 'garden')).toBeNull();
    expect(e.build(C - 1, C, 'workshop')).toMatch(/builder is busy/);
    expect(e.buy('builder')).toMatch(/costs 150 pearls/);
    e.state.town.pearls = 200; expect(e.buy('builder')).toBeNull(); expect(e.state.town.pearls).toBe(50);
    expect(e.build(C - 1, C, 'workshop')).toBeNull(); expect(e.buy('builder')).toMatch(/every builder/);
  });
  it('grows from about a minute to hours, and the workshop shortens every job', () => {
    expect(baseSeconds('restaurant', 2)).toBe(93); expect(baseSeconds('garden', MAX_LEVEL) / 3600).toBeGreaterThan(7);
    const town = createTown(); Object.assign(town.plots[0], { owned: true, building: 'workshop', level: 10 });
    expect(jobSeconds(town, 'restaurant', 5)).toBe(Math.round(baseSeconds('restaurant', 5) * .7));
    expect(upgradeCost('kelpFarm', 3)).toBeGreaterThan(upgradeCost('kelpFarm', 2));
    expect([1, 5, 6, 10, 11, 15].map(lookFor)).toEqual([1, 1, 2, 2, 3, 3]);
  });
  it('upgrades raise the level only on completion and stop at the top level', () => {
    const { e, h } = rich();
    expect(e.upgrade(C, C)).toBeNull(); expect(plotAt(e.state.town, C, C)!.level).toBe(1);
    h.advance(baseSeconds('restaurant', 2)); e.update(.1);
    expect(plotAt(e.state.town, C, C)!.level).toBe(2); expect(e.townEffects().arrivalBonus).toBeCloseTo(.03);
    plotAt(e.state.town, C, C)!.level = MAX_LEVEL; expect(e.upgrade(C, C)).toMatch(/highest level/);
  });
});

describe('time skips', () => {
  it('charms cut 15 minutes or an hour; pearls finish the rest', () => {
    const { e, h } = rich(); plotAt(e.state.town, C, C)!.level = 10; e.upgrade(C, C); // level 11 takes about 80 minutes
    const job = () => plotAt(e.state.town, C, C)!.job;
    const before = job()!.endsAt; e.state.town.charms = { current: 1, tide: 1 };
    expect(e.useCharm(C, C, 'current')).toBeNull(); expect(job()!.endsAt).toBe(before - 15 * 60_000);
    expect(e.useCharm(C, C, 'current')).toMatch(/no Current charms/);
    expect(e.useCharm(C, C, 'tide')).toBeNull(); expect(job()!.endsAt).toBe(before - 75 * 60_000);
    const cost = finishCost(job()!, h.now()); e.state.town.pearls = cost - 1;
    expect(e.finishNow(C, C)).toMatch(/needs/); e.state.town.pearls = cost;
    expect(e.finishNow(C, C)).toBeNull(); expect(job()).toBeNull(); expect(plotAt(e.state.town, C, C)!.level).toBe(11); expect(e.state.town.pearls).toBe(0);
  });
  it('a charm larger than the time left completes the job immediately', () => {
    const { e } = rich(); e.unlockPlot(C + 1, C); e.build(C + 1, C, 'garden');
    expect(e.useCharm(C + 1, C, 'current')).toBeNull(); expect(plotAt(e.state.town, C + 1, C)!.job).toBeNull();
  });
  it('gives one daily gift per calendar day', async () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now), start = e.state.town.charms.current;
    await e.resume(); await e.resume(); expect(e.state.town.charms.current).toBe(start + 1);
    h.advance(86_400); await e.resume(); expect(e.state.town.charms.current).toBe(start + 2);
  });
  it('rewards milestones with a Tide charm and pearls', () => {
    const e = new RestaurantEngine(); e.state.lifetimeServed = 5; const pearls = e.state.town.pearls;
    expect(e.claim('first-service')).toBeNull(); expect(e.state.town.charms.tide).toBe(1); expect(e.state.town.pearls).toBe(pearls + 5);
  });
});

describe('town effects on the restaurant', () => {
  it('neighbours matter: producers and gardens are stronger next to the restaurant, gardens next to homes speed up crew', () => {
    const town = createTown(), set = (x: number, z: number, building: 'kelpFarm' | 'fishery' | 'garden' | 'homes', level: number) => Object.assign(plotAt(town, x, z)!, { owned: true, building, level });
    set(C + 1, C, 'kelpFarm', 5); set(0, 0, 'fishery', 5);
    expect(townEffects(town).kelpCost).toBeCloseTo(1 - 5 * .06 * 1.5); expect(townEffects(town).fishCost).toBeCloseTo(1 - 5 * .06);
    set(C, C + 1, 'garden', 4); set(C, C + 2, 'homes', 6);
    const e = townEffects(town); expect(e.arrivalBonus).toBeCloseTo(4 * .03 * 1.5); expect(e.crewSpeed).toBeCloseTo(1.04); expect(e.extraCrew).toBe(2);
  });
  it('cheaper ingredients and more crew slots change real service results', () => {
    const plain = new RestaurantEngine(), farmed = new RestaurantEngine();
    Object.assign(plotAt(farmed.state.town, C + 1, C)!, { owned: true, building: 'kelpFarm', level: 10 });
    Object.assign(plotAt(farmed.state.town, C - 1, C)!, { owned: true, building: 'fishery', level: 10 });
    for (const e of [plain, farmed]) { e.open(); for (let i = 0; i < 1200; i++) e.update(.1); }
    expect(farmed.state.totals.served + farmed.state.lifetimeServed).toBeGreaterThan(0);
    const perMeal = (e: RestaurantEngine) => (e.state.history.reduce((s, r) => s + r.ingredients, 0) + e.state.totals.ingredients) / Math.max(1, e.state.lifetimeServed);
    expect(perMeal(farmed)).toBeLessThan(perMeal(plain));
    Object.assign(plotAt(farmed.state.town, C, C + 1)!, { owned: true, building: 'homes', level: 1 });
    expect(farmed.crewLimit()).toBe(7);
  });
});

describe('garden cap', () => {
  it('limits the combined guest bonus from glow gardens', () => {
    const town = createTown();
    for (const [x, z] of [[0, 0], [8, 8], [0, 8], [8, 0]]) Object.assign(plotAt(town, x, z)!, { owned: true, building: 'garden', level: 15 });
    expect(townEffects(town).arrivalBonus).toBeCloseTo(TOWN_BALANCE.gardenCap);
  });
});

describe('exact ingredient costs and the closing reserve', () => {
  it('carries fractions of a dollar so a small discount adds up over many dishes', () => {
    const plain = new RestaurantEngine(), farmed = new RestaurantEngine();
    Object.assign(plotAt(farmed.state.town, 0, 0)!, { owned: true, building: 'kelpFarm', level: 1 }); // not next to the restaurant: 6%
    expect(farmed.dishCost('salad')).toBeCloseTo(6.58);
    for (const e of [plain, farmed]) { e.state.menu.burger.enabled = false; e.open(); for (let i = 0; i < 3000; i++) e.update(.1); }
    const perSalad = (e: RestaurantEngine) => (e.state.history.reduce((s, r) => s + r.ingredients, 0) + e.state.totals.ingredients) / e.state.lifetimeServed;
    // Ingredients are paid when cooking starts (some guests leave before being served), so compare the two reefs.
    const ratio = perSalad(farmed) / perSalad(plain); expect(ratio).toBeLessThan(.98); expect(ratio).toBeGreaterThan(.88);
    expect(Number.isInteger(farmed.state.cash)).toBe(true); expect(farmed.state.ingredientCarry).toBeGreaterThanOrEqual(0); expect(farmed.state.ingredientCarry).toBeLessThan(1);
  });
  it("flags, but does not block, town spending that dips into tonight's bills", () => {
    const e = new RestaurantEngine(); e.open();
    const price = unlockCost(e.state.town); e.state.cash = price + e.billsTonight() - 1;
    expect(e.spendCheck(price)).toEqual({ after: e.billsTonight() - 1, reserve: e.billsTonight() + 30 });
    expect(e.unlockPlot(C + 1, C)).toBeNull(); expect(e.state.cash).toBe(e.billsTonight() - 1);
  });
});
