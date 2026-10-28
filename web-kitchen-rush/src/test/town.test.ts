import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { BUILDINGS, MAX_LEVEL, PARCEL, TOWN_BALANCE, baseSeconds, buildingAt, connected, createTown, finishCost, jobSeconds, lookFor, migrateTown, network, plotAt, restaurantOf, streetTiles, townEffects, townSchema, unlockCost, upgradeCost, type Town } from '@/management/town';
import { C, joinRoads, on, put } from './town-helpers';
import { createRestaurant, restaurantSchema } from '@/management/types';

function harness() {
  let now = 1_800_000_000_000, raw = '';
  const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
  return { storage, now: () => now, advance: (seconds: number) => { now += seconds * 1000; } };
}
function rich(h = harness()) { const e = new RestaurantEngine(h.storage, h.now); e.state.cash = 100_000; return { e, h }; }

const T = C * PARCEL; // the restaurant's corner tile
const hall = (town: Town) => restaurantOf(town);

describe('town plots', () => {
  it('starts with the restaurant plot, its streets and neutral effects', () => {
    const town = createTown();
    expect(town.plots.filter(p => p.owned)).toEqual([{ x: C, z: C, owned: true }]);
    expect(town.buildings).toEqual([{ id: 1, kind: 'restaurant', x: T, z: T, turned: false, wide: false, level: 1, job: null }]);
    expect(town.roads).toEqual(streetTiles(C, C)); expect(network(town).size).toBe(7);
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

describe('buildings of different sizes on tiles', () => {
  it('needs your own land, free tiles and a road along one side', () => {
    const { e } = rich(), town = e.state.town;
    expect(e.build('kelpFarm', T + 4, T)).toBe('Part of this spot is not your land yet.');
    e.unlockPlot(C + 1, C); e.unlockPlot(C - 1, C);
    expect(e.build('kelpFarm', T + 2, T)).toBe('Another building is in the way.');
    expect(e.build('kelpFarm', T + 3, T)).toBe('A road is in the way.');
    expect(e.build('kelpFarm', T - 4, T)).toBe('Buildings need a road along one side.');
    // A 3×2 kelp farm beside the restaurant's street; turned, a 2×3 fishery fits under it.
    expect(e.build('kelpFarm', T + 4, T)).toBeNull(); expect(buildingAt(town, T + 6, T + 1)?.kind).toBe('kelpFarm'); expect(buildingAt(town, T + 6, T + 2)).toBeUndefined();
    town.builders = 2; expect(e.placeError('fishery', T + 4, T + 1, true)).toBe('Another building is in the way.'); expect(e.placeError('fishery', T + 4, T + 2, true)).toBeNull();
    expect(e.placeError('fishery', T + 4, T + 2, false)).toBe('Part of this spot is not your land yet.');
    expect(e.build('restaurant', T + 4, T + 2)).toBe('You already have a restaurant.');
    expect(e.build('branch', T + 4, T + 2)).toMatch(/Branches open in other regions/);
  });
  it('lays roads one tile at a time or a whole plot of streets, and lifts them for free', () => {
    const { e } = rich(), town = e.state.town; e.unlockPlot(C - 1, C);
    expect(e.placeRoad(T - 6, T + 8)).toBe('Roads go on your own land.');
    const cash = e.state.cash; expect(e.placeRoad(T - 1, T)).toBeNull(); expect(e.state.cash).toBe(cash - TOWN_BALANCE.road);
    expect(e.placeRoad(T - 1, T)).toMatch(/already/); expect(e.placeRoad(T, T)).toBe('A building is in the way.');
    const streets = e.streetsFor(C - 1, C); expect(streets.tiles).toHaveLength(6); expect(streets.price).toBe(60);
    expect(e.layStreets(C - 1, C)).toBeNull(); expect(e.layStreets(C - 1, C)).toMatch(/already has its streets/);
    expect(e.removeRoad(T - 1, T)).toBeNull(); expect(e.removeRoad(T - 1, T)).toBe('There is no road here.'); expect(town.roads).not.toContain(`${T - 1},${T}`);
  });
  it('a building only works while a road joins it to the restaurant', () => {
    const { e } = rich(), town = e.state.town; e.unlockPlot(C + 1, C); e.unlockPlot(C + 2, C);
    // Two plots out, with a road of its own that does not reach the restaurant's streets.
    e.placeRoad(T + 11, T); expect(e.build('fishery', T + 9, T)).toBeNull(); e.finishNow(town.buildings[1].id);
    town.pearls = 100; e.finishNow(town.buildings[1].id);
    const fishery = town.buildings[1]; expect(fishery.job).toBeNull(); expect(connected(town, fishery)).toBe(false); expect(e.townEffects().fishCost).toBe(1);
    expect(e.layStreets(C + 1, C)).toBeNull(); expect(e.layStreets(C + 2, C)).toBeNull();
    expect(connected(town, fishery)).toBe(true); expect(e.townEffects().fishCost).toBeCloseTo(.94);
    // Lifting the joining street cuts it off again.
    e.removeRoad(T + 7, T + 3); e.removeRoad(T + 4, T + 3); e.removeRoad(T + 5, T + 3); e.removeRoad(T + 6, T + 3);
    for (let z = T; z < T + 3; z++) e.removeRoad(T + 7, z);
    expect(e.townEffects().fishCost).toBe(1);
  });
  it('moves and turns a building for free, keeping its level and timer', () => {
    const { e } = rich(), town = e.state.town; e.unlockPlot(C, C + 1);
    expect(e.build('homes', T, T + 4)).toBeNull(); const homes = town.buildings[1], job = homes.job;
    const cash = e.state.cash;
    expect(e.moveBuilding(homes.id, T + 2, T + 4, false)).toBeNull(); expect(homes).toMatchObject({ x: T + 2, z: T + 4, job }); expect(e.state.cash).toBe(cash);
    expect(e.moveBuilding(homes.id, T, T + 2, false)).toBe('Another building is in the way.');
    expect(e.moveBuilding(hall(town).id, T + 1, T, false)).toBe('A road is in the way.');
  });
});

describe('construction time', () => {
  it('builds in real time, applies effects only when finished, and survives a reload', () => {
    const { e, h } = rich();
    e.unlockPlot(C + 1, C); expect(e.build('kelpFarm', T + 4, T, true)).toBeNull();
    expect(e.state.cash).toBe(100_000 - unlockCost(createTown()) - BUILDINGS.kelpFarm.buildCost);
    expect(e.dishCost('salad')).toBe(7);
    const farm = () => on(e.state.town, C + 1, C)!;
    h.advance(BUILDINGS.kelpFarm.buildSeconds - 1); e.update(.1); expect(farm().job).not.toBeNull();
    const reloaded = new RestaurantEngine(h.storage, h.now); expect(reloaded.state.town).toEqual(e.state.town);
    h.advance(1); reloaded.update(.1);
    expect(on(reloaded.state.town, C + 1, C)!.job).toBeNull(); expect(reloaded.lastCompletion?.text).toBe('Kelp farm is built.');
    // Level 1 near the restaurant: 6% × 1.5 = 9% cheaper ($7 → $6.37; the cents carry between dishes).
    expect(reloaded.townEffects().kelpCost).toBeCloseTo(.91); expect(reloaded.dishCost('salad')).toBeCloseTo(6.37);
    expect(restaurantSchema.safeParse(reloaded.state).success).toBe(true);
  });
  it('finishes construction while the owner is away, even with the restaurant closed', async () => {
    const { e, h } = rich(); e.unlockPlot(C, C + 1); e.build('homes', T, T + 4); e.suspend();
    h.advance(3600);
    const back = new RestaurantEngine(h.storage, h.now); await back.resume();
    expect(on(back.state.town, C, C + 1)!.job).toBeNull(); expect(back.crewLimit()).toBe(7);
  });
  it('allows one job per builder, and a second builder bought with pearls', () => {
    const { e } = rich(); e.unlockPlot(C + 1, C); e.unlockPlot(C, C + 1);
    expect(e.build('garden', T + 4, T)).toBeNull();
    expect(e.build('workshop', T, T + 4)).toMatch(/builder is busy/);
    expect(e.buy('builder')).toMatch(/costs 150 pearls/);
    e.state.town.pearls = 200; expect(e.buy('builder')).toBeNull(); expect(e.state.town.pearls).toBe(50);
    expect(e.build('workshop', T, T + 4)).toBeNull(); expect(e.buy('builder')).toMatch(/every builder/);
  });
  it('grows from about a minute to hours, and the workshop shortens every job', () => {
    expect(baseSeconds('restaurant', 2)).toBe(93); expect(baseSeconds('garden', MAX_LEVEL) / 3600).toBeGreaterThan(7);
    const town = createTown(); put(town, 'workshop', 0, 0, 10);
    expect(jobSeconds(town, 'restaurant', 5)).toBe(Math.round(baseSeconds('restaurant', 5) * .7));
    expect(upgradeCost('kelpFarm', 3)).toBeGreaterThan(upgradeCost('kelpFarm', 2));
    expect([1, 5, 6, 10, 11, 15].map(lookFor)).toEqual([1, 1, 2, 2, 3, 3]);
  });
  it('upgrades raise the level only on completion and stop at the top level', () => {
    const { e, h } = rich(), id = hall(e.state.town).id;
    expect(e.upgrade(id)).toBeNull(); expect(hall(e.state.town).level).toBe(1);
    h.advance(baseSeconds('restaurant', 2)); e.update(.1);
    expect(hall(e.state.town).level).toBe(2); expect(e.townEffects().arrivalBonus).toBeCloseTo(.03);
    hall(e.state.town).level = MAX_LEVEL; expect(e.upgrade(id)).toMatch(/highest level/);
  });
});

describe('time skips', () => {
  it('charms cut 15 minutes or an hour; pearls finish the rest', () => {
    const { e, h } = rich(), id = hall(e.state.town).id; hall(e.state.town).level = 10; e.upgrade(id); // level 11 takes about 80 minutes
    const job = () => hall(e.state.town).job;
    const before = job()!.endsAt; e.state.town.charms = { current: 1, tide: 1 };
    expect(e.useCharm(id, 'current')).toBeNull(); expect(job()!.endsAt).toBe(before - 15 * 60_000);
    expect(e.useCharm(id, 'current')).toMatch(/no Current charms/);
    expect(e.useCharm(id, 'tide')).toBeNull(); expect(job()!.endsAt).toBe(before - 75 * 60_000);
    const cost = finishCost(job()!, h.now()); e.state.town.pearls = cost - 1;
    expect(e.finishNow(id)).toMatch(/needs/); e.state.town.pearls = cost;
    expect(e.finishNow(id)).toBeNull(); expect(job()).toBeNull(); expect(hall(e.state.town).level).toBe(11); expect(e.state.town.pearls).toBe(0);
  });
  it('a charm larger than the time left completes the job immediately', () => {
    const { e } = rich(); e.unlockPlot(C + 1, C); e.build('garden', T + 4, T);
    const id = e.state.town.buildings[1].id; expect(e.useCharm(id, 'current')).toBeNull(); expect(e.state.town.buildings[1].job).toBeNull();
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
  it('nearness matters: producers and gardens are stronger near the restaurant, gardens near homes speed up crew', () => {
    const town = createTown();
    put(town, 'kelpFarm', C + 1, C, 5); put(town, 'fishery', 0, 0, 5);
    expect(townEffects(town).kelpCost).toBeCloseTo(1 - 5 * .06 * 1.5); expect(townEffects(town).fishCost).toBeCloseTo(1 - 5 * .06);
    put(town, 'garden', C, C + 1, 4); put(town, 'homes', C, C + 2, 6, { z: (C + 1) * PARCEL + 2 });
    const e = townEffects(town); expect(e.arrivalBonus).toBeCloseTo(4 * .03 * 1.5); expect(e.crewSpeed).toBeCloseTo(1.04); expect(e.extraCrew).toBe(5);
  });
  it('cheaper ingredients and more crew slots change real service results', () => {
    const plain = new RestaurantEngine(), farmed = new RestaurantEngine();
    put(farmed.state.town, 'kelpFarm', C + 1, C, 10); put(farmed.state.town, 'fishery', C - 1, C, 10);
    for (const e of [plain, farmed]) { e.open(); for (let i = 0; i < 1200; i++) e.update(.1); }
    expect(farmed.state.totals.served + farmed.state.lifetimeServed).toBeGreaterThan(0);
    const perMeal = (e: RestaurantEngine) => (e.state.history.reduce((s, r) => s + r.ingredients, 0) + e.state.totals.ingredients) / Math.max(1, e.state.lifetimeServed);
    expect(perMeal(farmed)).toBeLessThan(perMeal(plain));
    put(farmed.state.town, 'homes', C, C + 1, 1);
    expect(farmed.crewLimit()).toBe(7);
  });
});

describe('garden cap', () => {
  it('limits the combined guest bonus from glow gardens', () => {
    const town = createTown();
    for (const [x, z] of [[0, 0], [8, 8], [0, 8], [8, 0]]) put(town, 'garden', x, z, 15);
    expect(townEffects(town).arrivalBonus).toBeCloseTo(TOWN_BALANCE.gardenCap);
  });
});

describe('saves from before tiles', () => {
  it('moves each building to its plot corner and gives every owned plot its streets, with the same effects', () => {
    const legacy = { plots: createTown().plots.map(p => ({ ...p, building: null as string | null, level: 0, job: null })), builders: 1, pearls: 5, charms: { current: 1, tide: 0 }, lastGiftDay: '', zones: ['shallows'] };
    const set = (x: number, z: number, building: string, level: number) => Object.assign(legacy.plots.find(p => p.x === x && p.z === z)!, { owned: true, building, level });
    set(C, C, 'restaurant', 3); set(C + 1, C, 'kelpFarm', 5); set(C, C + 1, 'garden', 4); set(C, C + 2, 'homes', 6); set(0, 0, 'fishery', 5);
    expect(townSchema.safeParse(legacy).success).toBe(true);
    const town = townSchema.parse(legacy) as Town;
    expect(town.buildings.map(b => [b.kind, b.x, b.z, b.level])).toEqual([['fishery', 0, 0, 5], ['restaurant', T, T, 3], ['kelpFarm', T + 4, T, 5], ['garden', T, T + 4, 4], ['homes', T, T + 8, 6]]);
    expect(town.nextBuildingId).toBe(6); expect(town.plots[0]).toEqual({ x: 0, z: 0, owned: true });
    expect(town.buildings.filter(b => b.kind !== 'fishery').every(b => connected(town, b))).toBe(true);
    // The lone fishery's plot is not joined to the rest: it waits for a road, like any building.
    expect(connected(town, town.buildings[0])).toBe(false);
    joinRoads(town, { x: 0, z: 0 });
    const e = townEffects(town); expect(e.kelpCost).toBeCloseTo(1 - 5 * .06 * 1.5); expect(e.fishCost).toBeCloseTo(1 - 5 * .06); expect(e.extraCrew).toBe(5);
    expect(migrateTown(town)).toBe(town);
  });
});

describe('exact ingredient costs and the closing reserve', () => {
  it('carries fractions of a dollar so a small discount adds up over many dishes', () => {
    const plain = new RestaurantEngine(), farmed = new RestaurantEngine();
    put(farmed.state.town, 'kelpFarm', 0, 0, 1); // not near the restaurant: 6%
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

describe('the east grotto takes room in town', () => {
  const ready = () => { const { e, h } = rich(); e.state.history = Array.from({ length: 3 }, () => structuredClone(e.state.totals) as never); return { e, h }; };
  it('grows the restaurant from 3×3 to 4×3, lifting the street in the way; buildings beside it keep working', () => {
    const { e, h } = ready(), town = e.state.town; e.unlockPlot(C + 1, C);
    expect(e.build('kelpFarm', T + 4, T)).toBeNull(); h.advance(3600); e.update(.1);
    const farm = town.buildings[1]; expect(connected(town, farm)).toBe(true);
    const cash = e.state.cash; expect(e.expand()).toBeNull(); expect(e.state.cash).toBe(cash - 900);
    expect(hall(town).wide).toBe(true); expect(buildingAt(town, T + 3, T + 2)?.kind).toBe('restaurant');
    expect(town.roads).not.toContain(`${T + 3},${T}`); expect(e.event).toContain('3 road tiles made way');
    // The kelp farm now stands right against the restaurant: still working, still near it.
    expect(connected(town, farm)).toBe(true); expect(e.townEffects().kelpCost).toBeCloseTo(.91);
    // Moving the restaurant keeps its grotto row.
    expect(e.placeError('restaurant', T, T, false, hall(town).id)).toBeNull();
    expect(townSchema.parse(structuredClone(town))).toMatchObject({ buildings: [{ kind: 'restaurant', wide: true }, { kind: 'kelpFarm' }] });
  });
  it('waits while a building stands in that row, and says which one', () => {
    const { e } = ready(), town = e.state.town; e.unlockPlot(C + 1, C);
    town.roads = town.roads.filter(k => !k.startsWith(`${T + 3},`) || k === `${T + 3},${T + 3}`); e.placeRoad(T + 4, T + 3);
    expect(e.build('homes', T + 3, T + 1)).toBeNull();
    expect(e.expand()).toBe('The grotto needs the row of tiles beside the restaurant in town. Move the mareen homes there first.');
    expect(e.state.expanded).toBe(false); expect(hall(town).wide).toBe(false);
  });
  it('widens a grotto bought before tiles when its old save loads', () => {
    const h = harness(), s = createRestaurant(); s.expanded = true; hall(s.town).wide = false;
    h.storage.setItem('vast-ocean-restaurant-v1', JSON.stringify(s));
    const e = new RestaurantEngine(h.storage, h.now); expect(e.loadWarning).toBe(''); expect(hall(e.state.town).wide).toBe(true);
  });
});

describe('ways out of debt', () => {
  it('clears debt with pearls, $25 each, using only the pearls needed', () => {
    const e = new RestaurantEngine(); e.state.debt = 110; e.state.town.pearls = 10;
    expect(e.debtPearls()).toEqual({ pearls: 5, amount: 110 }); expect(e.payDebtWithPearls()).toBeNull();
    expect(e.state.debt).toBe(0); expect(e.state.town.pearls).toBe(5); expect(e.payDebtWithPearls()).toBe('You have no debt.');
    e.state.debt = 400; e.state.town.pearls = 3; expect(e.payDebtWithPearls()).toBeNull(); expect(e.state.debt).toBe(325); expect(e.state.town.pearls).toBe(0);
    expect(e.payDebtWithPearls()).toMatch(/no pearls/);
  });
  it('demolishes a town building for half of what was spent on it, but never the restaurant', () => {
    const { e } = rich(), town = e.state.town; e.unlockPlot(C + 1, C);
    e.build('kelpFarm', T + 4, T); const farm = town.buildings[1]; farm.job = null; farm.level = 3;
    const spent = BUILDINGS.kelpFarm.buildCost + upgradeCost('kelpFarm', 2) + upgradeCost('kelpFarm', 3);
    expect(e.demolishRefund(farm.id)).toBe(Math.round(spent / 2));
    const cash = e.state.cash; expect(e.demolish(farm.id)).toBeNull(); expect(e.state.cash).toBe(cash + Math.round(spent / 2));
    expect(town.buildings).toHaveLength(1); expect(buildingAt(town, T + 4, T)).toBeUndefined();
    expect(e.demolish(hall(town).id)).toBe('Your restaurant stays.'); expect(e.demolishRefund(hall(town).id)).toBe(0);
  });
});

describe('Mareen homes', () => {
  it('add one crew slot per level and stop at level 5, with a town-wide cap', () => {
    const town = createTown(), homes = put(town, 'homes', C, C + 1, 1);
    for (let level = 1; level <= 5; level++) { homes.level = level; expect(townEffects(town).extraCrew).toBe(level); }
    const { e } = rich(); const h = put(e.state.town, 'homes', C, C + 1, 5); expect(e.upgrade(h.id)).toBe('Already at the highest level.');
    expect(e.crewLimit()).toBe(11);
    for (const [x, z] of [[C + 1, C], [C - 1, C], [C, C - 1]]) put(e.state.town, 'homes', x, z, 5, { z: z * PARCEL + 1 }); // beside each plot's street
    expect(e.townEffects().extraCrew).toBe(12);
  });
});
