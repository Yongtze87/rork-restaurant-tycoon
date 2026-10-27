import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { BIOMES, FAME_BONUS, FIRST_RING, OCEAN_BALANCE, VISITABLE_BIOMES, createOcean, describeModifiers, fameBonuses, isFoundable, mapBounds, modifiersFor, neighbourIds, regionAt, regionById, regionId, regionStatus, ring, type Ocean } from '@/management/ocean';
import { achievement, isClaimable } from '@/management/collections';
import { TOWN_SIZE, createTown, unlockCost } from '@/management/town';
import { ZONES } from '@/management/zones';
import { createMenu, createRestaurant, restaurantSchema } from '@/management/types';
import { pickRegion } from '@/management/sim/simulator';

function harness() {
  let now = 1_800_000_000_000, raw = '';
  const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
  return { storage, now: () => now, advance: (seconds: number) => { now += seconds * 1000; }, read: () => JSON.parse(raw), write: (value: unknown) => { raw = JSON.stringify(value); } };
}
function advance(e: RestaurantEngine, seconds: number) { for (let i = 0; i < seconds * 10; i++) e.update(.1); }
const C = Math.floor(TOWN_SIZE / 2);
const ocean = (...regions: string[]): Ocean => ({ fame: 0, colonies: ['0,0', ...regions].map((region, i) => ({ region, name: regionById(region)!.name, fame: regionById(region)!.fame, abyss: i < regions.length, days: 0, served: 0, startServed: 0 })) });
/** A colony that has reached the Abyss, with progress in everything founding should keep or reset. */
function veteran(h = harness()) {
  const e = new RestaurantEngine(h.storage, h.now), s = e.state;
  e.open(); advance(e, 400);
  Object.assign(s, { cash: 250_000, debt: 120, expanded: true, reputation: 4.8, lifetimeChallengeBonus: 400, ingredientCarry: .4, music: true, name: 'Pearl Palace' });
  s.town.zones.push('reef', 'twilight', 'abyss'); s.town.pearls = 321; s.town.charms = { current: 7, tide: 3 }; s.town.builders = 2; s.town.lastGiftDay = '2027-01-01';
  Object.assign(s.town.plots.find(p => p.x === C + 1 && p.z === C)!, { owned: true, building: 'garden', level: 9, job: null });
  s.collections.claimed.push('dish-salad-bronze'); s.tutorial = { step: 5, done: true }; s.claimed.push('first-service');
  s.menu.sushi = { enabled: true, price: 50 };
  return { e, h };
}

describe('ocean generation', () => {
  it('is the same every time, for any coordinates', () => {
    expect(regionAt(4, -3)).toMatchObject({ id: '4,-3', name: 'Frost Floe', biome: 'ice', difficulty: 2.7, fame: 53 });
    expect(regionAt(-7, 12)).toMatchObject({ name: 'Blue Fall', biome: 'trench', difficulty: 8.1, fame: 387 });
    expect(regionAt(250, -400)).toMatchObject({ name: 'Sunburst Crown', biome: 'atoll', difficulty: 240.3 });
    expect(regionById('4,-3')).toEqual(regionAt(4, -3)); expect(regionById('nope')).toBeNull();
  });
  it('uses the hand-made first ring around the Home Reef', () => {
    expect(regionAt(0, 0)).toMatchObject({ name: 'Home Reef', biome: 'home', fame: 30, modifiers: modifiersFor('home', 1) });
    const ringOne = neighbourIds(0, 0).map(id => regionById(id)!);
    expect(ringOne.map(r => r.id).sort()).toEqual(Object.keys(FIRST_RING).sort());
    for (const r of ringOne) expect(r).toMatchObject(FIRST_RING[r.id]);
    expect(new Set(ringOne.map(r => r.biome))).toEqual(new Set(VISITABLE_BIOMES));
  });
  it('mixes upsides and downsides everywhere, keeps effects moderate and pays more fame further out', () => {
    const rings = new Map<number, { difficulty: number[]; fame: number[] }>();
    for (let x = -12; x <= 12; x++) for (let y = -12; y <= 12; y++) {
      const r = regionAt(x, y); if (r.biome === 'home') continue;
      const words = describeModifiers(r.modifiers);
      expect(words.upsides.length, r.id).toBeGreaterThan(0); expect(words.downsides.length, r.id).toBeGreaterThan(0);
      for (const v of Object.values(r.modifiers)) { expect(v).toBeGreaterThanOrEqual(OCEAN_BALANCE.clampLow); expect(v).toBeLessThanOrEqual(OCEAN_BALANCE.clampHigh); }
      const entry = rings.get(ring(x, y)) ?? { difficulty: [], fame: [] }; entry.difficulty.push(r.difficulty); entry.fame.push(r.fame); rings.set(ring(x, y), entry);
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    for (let n = 3; n <= 12; n++) {
      const here = rings.get(n)!, inner = rings.get(n - 2)!;
      expect(avg(here.difficulty)).toBeGreaterThan(avg(inner.difficulty));
      // Rewards grow faster than difficulty.
      expect(avg(here.fame) / avg(inner.fame)).toBeGreaterThan(avg(here.difficulty) / avg(inner.difficulty));
      // Neighbours vary: every ring has easier and harder regions.
      expect(Math.max(...here.difficulty) - Math.min(...here.difficulty)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('exploration and fog', () => {
  it('lets a new colony go only next to an explored region', () => {
    const o = createOcean();
    expect(neighbourIds(0, 0).every(id => isFoundable(o, id))).toBe(true);
    expect(isFoundable(o, '0,0')).toBe(false); expect(isFoundable(o, '2,0')).toBe(false); expect(regionStatus(o, '2,0')).toBe('fog');
    const later = ocean('1,0');
    expect(regionStatus(later, '0,0')).toBe('explored'); expect(regionStatus(later, '1,0')).toBe('current');
    expect(isFoundable(later, '2,0')).toBe(true); expect(isFoundable(later, '2,1')).toBe(true); expect(isFoundable(later, '3,0')).toBe(false);
    expect(mapBounds(later)).toEqual({ x0: -2, y0: -2, x1: 3, y1: 2 });
  });
  it('explains why founding is locked: before the Abyss, in fog, or on an explored region', () => {
    const e = new RestaurantEngine();
    expect(e.foundingError('1,0')).toBe('Reach the Abyss in Home Reef first.'); expect(e.foundColony('1,0')).toBe('Reach the Abyss in Home Reef first.');
    e.state.town.zones.push('reef', 'twilight', 'abyss');
    expect(e.foundingError('3,3')).toBe('Explore a region next to this one first.');
    expect(e.foundingError('0,0')).toBe('You already have a colony here.');
    expect(e.foundingError('x')).toBe('Choose a region first.');
    expect(e.foundingError('0,1')).toBeNull();
  });
});

describe('founding a colony', () => {
  it('keeps pearls, charms, builders, collections, tutorial, fame and the ocean record, and resets the rest', () => {
    const { e } = veteran(), before = structuredClone(e.state), region = regionAt(0, -1);
    expect(e.foundColony(region.id)).toBeNull();
    const s = e.state, fresh = createRestaurant();
    // Kept.
    expect(s.town.pearls).toBe(321); expect(s.town.charms).toEqual({ current: 7, tide: 3 }); expect(s.town.builders).toBe(2); expect(s.town.lastGiftDay).toBe('2027-01-01');
    expect(s.collections).toEqual(before.collections); expect(s.tutorial).toEqual(before.tutorial); expect(s.claimed).toEqual(before.claimed);
    expect(s.name).toBe('Pearl Palace'); expect(s.music).toBe(true); expect(s.welcomed).toBe(before.welcomed); expect(s.lifetimeServed).toBe(before.lifetimeServed);
    const home = regionAt(0, 0).fame; expect(home).toBe(30); expect(s.ocean.fame).toBe(home);
    expect(s.ocean.colonies).toEqual([
      { region: '0,0', name: 'Home Reef', fame: home, abyss: true, days: before.day - 1, served: before.lifetimeServed, startServed: 0 },
      { region: region.id, name: region.name, fame: region.fame, abyss: false, days: 0, served: 0, startServed: before.lifetimeServed },
    ]);
    // Reset.
    expect(s.cash).toBe(fresh.cash + fameBonuses(home).startCash);
    expect(s.town.plots).toEqual(createTown().plots); expect(s.town.zones).toEqual(['shallows']);
    expect(s.furniture).toEqual(fresh.furniture); expect(s.staff).toEqual(fresh.staff); expect(s.menu).toEqual(createMenu());
    expect(s.history).toEqual([]); expect(s.dailyChallenges).toEqual([]); expect(s.guests).toEqual([]);
    expect({ day: s.day, phase: s.phase, debt: s.debt, expanded: s.expanded, reputation: s.reputation, lifetimeChallengeBonus: s.lifetimeChallengeBonus, ingredientCarry: s.ingredientCarry, clock: s.clock })
      .toEqual({ day: 1, phase: 'planning', debt: 0, expanded: false, reputation: fresh.reputation, lifetimeChallengeBonus: 0, ingredientCarry: 0, clock: 0 });
    expect(s.seed).not.toBe(before.seed);
    expect(restaurantSchema.safeParse(s).success).toBe(true);
    expect(e.foundColony('0,-2')).toMatch(/Reach the Abyss in Kelpwood Hollow/);
  });
  it('is deterministic and survives a reload', () => {
    const a = veteran(), b = veteran();
    a.e.foundColony('1,1'); b.e.foundColony('1,1');
    expect(a.e.state).toEqual(b.e.state);
    const reloaded = new RestaurantEngine(a.h.storage, a.h.now);
    expect(reloaded.loadWarning).toBe(''); expect(reloaded.state.ocean).toEqual(a.e.state.ocean); expect(reloaded.region().name).toBe('Drowned Spires');
  });
  it('counts toward the ocean achievements', () => {
    const { e } = veteran();
    expect(isClaimable(e.state, achievement('colonies-1')!)).toBe(false);
    e.foundColony('-1,1');
    expect(isClaimable(e.state, achievement('colonies-1')!)).toBe(true); expect(isClaimable(e.state, achievement('biome-atoll')!)).toBe(true);
    expect(isClaimable(e.state, achievement('biome-kelp')!)).toBe(false); expect(achievement('colonies-3')).toBeDefined(); expect(achievement('colonies-10')).toBeDefined();
    expect(e.claimAchievement('colonies-1')).toBeNull();
  });
});

describe('fame', () => {
  it('is added once, when a colony reaches its Abyss', () => {
    const e = new RestaurantEngine(), s = e.state, home = regionAt(0, 0).fame;
    s.town.zones.push('reef', 'twilight'); s.reputation = 5; s.cash = 1e6;
    s.town.plots.slice(0, 12).forEach(p => Object.assign(p, { owned: true, building: 'garden', level: 13, job: null }));
    expect(e.startingCash()).toBe(1250 + fameBonuses(home).startCash);
    expect(e.unlockZone('abyss')).toBeNull(); expect(s.ocean.fame).toBe(home); expect(e.event).toContain(`earned ${home} fame`);
    e.state.town.zones.pop(); expect(e.unlockZone('abyss')).toBeNull(); expect(s.ocean.fame).toBe(home);
    expect(e.foundColony('0,1')).toBeNull(); expect(e.state.ocean.fame).toBe(home); expect(e.state.ocean.colonies[0].abyss).toBe(true);
  });
  it('grows every bonus with fame but never past its cap', () => {
    expect(fameBonuses(0)).toEqual({ tips: 0, build: 0, arrival: 0, startCash: 0 });
    let last = fameBonuses(0);
    for (const fame of [5, 20, 60, 200, 1000, 1e9]) {
      const b = fameBonuses(fame);
      expect(b.tips).toBeGreaterThanOrEqual(last.tips); expect(b.build).toBeGreaterThanOrEqual(last.build); expect(b.startCash).toBeGreaterThanOrEqual(last.startCash);
      expect(b.tips).toBeLessThanOrEqual(FAME_BONUS.tips); expect(b.build).toBeLessThanOrEqual(FAME_BONUS.build); expect(b.arrival).toBeLessThanOrEqual(FAME_BONUS.arrival); expect(b.startCash).toBeLessThanOrEqual(FAME_BONUS.startCash);
      last = b;
    }
    expect(fameBonuses(1e9).tips).toBeCloseTo(FAME_BONUS.tips, 2);
  });
  it('makes building cheaper and service richer in the engine', () => {
    const plain = new RestaurantEngine(), famous = new RestaurantEngine(); famous.state.ocean.fame = 75;
    const k = fameBonuses(75);
    expect(famous.plotPrice()).toBe(Math.round(unlockCost(createTown()) * (1 - k.build) / 10) * 10); expect(plain.plotPrice()).toBe(unlockCost(createTown()));
    expect(famous.zonePrice('abyss')).toBe(Math.round(ZONES.abyss.price * (1 - k.build) / 10) * 10);
    const cheap = famous.plotPrice(); famous.state.cash = plain.state.cash = 10_000; famous.unlockPlot(C + 1, C); plain.unlockPlot(C + 1, C);
    expect(famous.state.cash - plain.state.cash).toBe(unlockCost(createTown()) - cheap);
    plain.open(); famous.open(); advance(plain, 600); advance(famous, 600);
    const tips = (e: RestaurantEngine) => e.state.history.reduce((sum, r) => sum + r.tips, 0) / Math.max(1, e.state.history.reduce((sum, r) => sum + r.revenue, 0));
    expect(tips(famous)).toBeGreaterThan(tips(plain) + k.tips * .5);
    expect(famous.state.lifetimeServed).toBeGreaterThan(0);
  });
});

describe('region modifiers', () => {
  it('change the real service: ingredient costs, tips, guests and prices', () => {
    const at = (region?: string) => { const e = new RestaurantEngine(); if (region) e.state.ocean = ocean(region); return e; };
    expect(at('1,0').dishCost('burger')).toBeLessThan(at().dishCost('burger')); // vents: cheaper fish
    expect(at('0,-1').dishCost('salad')).toBeLessThan(at().dishCost('salad')); // kelp forest: cheaper kelp
    expect(at('-1,0').buildPrice('garden')).toBeGreaterThan(at().buildPrice('garden')); // trench: dearer building
    expect(at('1,1').buildPrice('garden')).toBeLessThan(at().buildPrice('garden')); // sunken city: cheaper building
    const run = (e: RestaurantEngine) => { e.open(); advance(e, 700); const h = e.state.history; return { guests: h.reduce((s, r) => s + r.served + r.missed, 0), served: h.reduce((s, r) => s + r.served, 0), tips: h.reduce((s, r) => s + r.tips, 0), ingredients: h.reduce((s, r) => s + r.ingredients, 0), cash: e.state.cash }; };
    const home = run(at()), ice = run(at('1,-1')), atoll = run(at('-1,1')), vents = run(at('1,0'));
    expect(ice.tips / ice.served).toBeGreaterThan(home.tips / home.served);
    expect(atoll.guests).toBeGreaterThan(home.guests); // atoll: guests arrive more often
    expect(vents.ingredients / vents.served).toBeLessThan(home.ingredients / home.served);
    expect(new Set([home.cash, ice.cash, atoll.cash, vents.cash]).size).toBe(4);
  });
});

describe('saves', () => {
  it('load older saves without an ocean as colony 1 at the Home Reef', () => {
    const h = harness(), { ocean: _, ...legacy } = createRestaurant(); legacy.day = 9;
    h.write(legacy);
    const e = new RestaurantEngine(h.storage, h.now);
    expect(e.loadWarning).toBe(''); expect(e.state.day).toBe(9); expect(e.state.ocean).toEqual(createOcean()); expect(e.region().id).toBe('0,0');
    expect(restaurantSchema.parse({ ...legacy, ocean: { colonies: [{ region: '0,0', name: 'Home Reef' }] } }).ocean).toEqual(createOcean());
    expect(restaurantSchema.safeParse({ ...legacy, ocean: { fame: 0, colonies: [] } }).success).toBe(false);
  });
  it('replays time away in a founded colony exactly like live play', async () => {
    const h = harness(), { e } = veteran(h); e.foundColony('1,-1'); e.save();
    const offline = new RestaurantEngine(h.storage, h.now), online = new RestaurantEngine(undefined, h.now);
    online.state = structuredClone(offline.state); await online.resume();
    offline.open(); online.open(); advance(offline, 21); advance(online, 21); offline.suspend();
    h.advance(900); advance(online, 900);
    const restored = new RestaurantEngine(h.storage, h.now); await restored.resume();
    const { lastActiveAt: _a, ...a } = restored.state, { lastActiveAt: _b, ...b } = online.state;
    expect(restored.state.day).toBeGreaterThan(3); expect(restored.region().name).toBe('Frostlight Shelf'); expect(a).toEqual(b);
    expect(h.read().ocean.colonies).toHaveLength(2);
  });
});

describe('simulator region choice', () => {
  it('picks the easiest, richest or a balanced neighbour', () => {
    const s = createRestaurant();
    expect(pickRegion(s, 'easiest').name).toBe('Glasswater Lagoon');
    expect(pickRegion(s, 'richest').name).toBe('Bluefall Trench');
    expect(pickRegion(s, 'balanced').name).toBe('Frostlight Shelf');
    expect(regionId(1, -1)).toBe('1,-1'); expect(BIOMES.home.up).toEqual({});
  });
});
