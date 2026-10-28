import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { LEGACY_TOWN_SIZE, createTown, migrateTown, ownedCount, plotAt, plotZone, restaurantOf, townEffects, unlockCost, type BuildingKind, type Job, type Plot, type Town } from '@/management/town';
import { C, on, put } from './town-helpers';
import { ZONES, ZONE_ARRIVAL_BONUS, zoneArrivalBonus, zoneError, zoneRequirements } from '@/management/zones';
import { createRestaurant, restaurantSchema } from '@/management/types';

function harness(raw = '') {
  let now = 1_800_000_000_000;
  return { storage: { getItem: () => raw || null, setItem: (_k: string, v: string) => { raw = v; } }, now: () => now, advance: (s: number) => { now += s * 1000; }, read: () => JSON.parse(raw) };
}
/** A plot as saves before tiles stored it, with its one building. */
type LegacyPlot = Plot & { building: BuildingKind | null; level: number; job: Job | null };
/** Finished buildings on owned plots of the Shallows, closest to the restaurant first. */
function addBuildings(town: Town, count: number, level = 1): void {
  const free = town.plots.filter(p => !on(town, p.x, p.z) && plotZone(p) === 'shallows').sort((a, b) => Math.abs(a.x - C) + Math.abs(a.z - C) - Math.abs(b.x - C) - Math.abs(b.z - C));
  free.slice(0, count).forEach(p => put(town, 'homes', p.x, p.z, level));
}

describe('zone layout', () => {
  it('is a 9×9 town: the original 5×5 Shallows in the middle, then a Coral Reef ring and a Twilight ring', () => {
    const town = createTown(), count = (zone: string) => town.plots.filter(p => plotZone(p) === zone).length;
    expect(town.plots).toHaveLength(81); expect(town.zones).toEqual(['shallows']);
    expect(on(town, C, C)?.kind).toBe('restaurant');
    expect([count('shallows'), count('reef'), count('twilight'), count('abyss')]).toEqual([25, 24, 32, 0]);
    expect([plotZone({ x: C + 2, z: C - 2 }), plotZone({ x: C + 3, z: C }), plotZone({ x: 0, z: 0 })]).toEqual(['shallows', 'reef', 'twilight']);
  });
  it('keeps plot prices growing but reasonable across all 80 plots', () => {
    const town = createTown(), prices: number[] = [];
    for (const plot of town.plots) if (!plot.owned) { prices.push(unlockCost(town)); plot.owned = true; }
    expect(prices).toHaveLength(80); expect(prices[0]).toBe(250);
    prices.slice(1).forEach((price, i) => expect(price).toBeGreaterThan(prices[i]));
    expect(prices[23]).toBeLessThan(15_000); expect(prices[79]).toBeLessThan(100_000);
  });
});

describe('zone requirements', () => {
  it('lists every Coral Reef requirement with progress', () => {
    const s = createRestaurant(); addBuildings(s.town, 2);
    expect(zoneRequirements(s, 'shallows')).toEqual([]);
    expect(zoneRequirements(s, 'reef').map(r => [r.label, r.met])).toEqual([
      ['Reputation 3.8 · now 3.5', false], ['4 buildings in town · 2/4', false], ['$5,000 · you have $1,250', false],
    ]);
    expect(zoneError(s, 'reef')).toBe('Reach a 3.8 reputation first.');
  });
  it('needs the previous zone and a high-level building for the Twilight Zone and the Abyss', () => {
    const s = createRestaurant(); s.reputation = 5; s.cash = 100_000; addBuildings(s.town, 12, 5);
    expect(zoneError(s, 'twilight')).toBe('Reach the Coral Reef first.');
    s.town.zones.push('reef');
    expect(zoneError(s, 'twilight')).toBe('Upgrade a building to level 8 first.');
    restaurantOf(s.town).level = 8; expect(zoneError(s, 'twilight')).toBeNull();
    expect(zoneRequirements(s, 'abyss').find(r => r.label.startsWith('A building'))).toMatchObject({ label: 'A building at level 13 · best Lv 8', met: false });
    // A building still under construction does not count yet.
    s.town.buildings.filter(b => b.kind === 'homes').slice(0, 5).forEach(p => { p.job = { kind: 'build', startedAt: 0, endsAt: 1 }; });
    expect(zoneRequirements(s, 'twilight').find(r => r.label.includes('buildings'))?.met).toBe(false);
  });
  it('unlocks a zone through the engine: checks, charges, records, saves, and adds +5% guests', () => {
    const h = harness(), e = new RestaurantEngine(h.storage, h.now);
    expect(e.unlockZone('reef')).toBe('Reach a 3.8 reputation first.');
    e.state.reputation = 3.8; expect(e.unlockZone('reef')).toBe('Build 4 buildings in town first.');
    addBuildings(e.state.town, 4); expect(e.unlockZone('reef')).toBe('Reaching the Coral Reef costs $5,000.');
    expect(e.unlockZone('abyss')).toBe('Reach the Twilight Zone first.');
    e.state.cash = 5500; const before = e.townEffects().arrivalBonus;
    expect(e.unlockZone('reef')).toBeNull();
    expect(e.state.cash).toBe(500); expect(e.state.town.zones).toEqual(['shallows', 'reef']);
    expect(e.townEffects().arrivalBonus).toBeCloseTo(before + ZONE_ARRIVAL_BONUS);
    expect(e.unlockZone('reef')).toBe('You already reached the Coral Reef.');
    expect(h.read().town.zones).toEqual(['shallows', 'reef']);
    expect(new RestaurantEngine(h.storage, h.now).state.town.zones).toEqual(['shallows', 'reef']);
    expect(e.unlockZone('shallows')).toBe('You already reached the Sunlit Shallows.');
  });
  it('adds the arrival bonus once per zone past the Shallows, in one place', () => {
    const town = createTown();
    expect(zoneArrivalBonus(town)).toBe(0); expect(townEffects(town).arrivalBonus).toBe(0);
    town.zones = ['shallows', 'reef', 'twilight', 'abyss']; expect(zoneArrivalBonus(town)).toBeCloseTo(3 * ZONE_ARRIVAL_BONUS); expect(townEffects(town).arrivalBonus).toBeCloseTo(.15);
  });
  it('rejects saves with unknown or duplicate zones', () => {
    const s = createRestaurant();
    expect(restaurantSchema.safeParse({ ...s, town: { ...s.town, zones: ['shallows', 'reef', 'reef'] } }).success).toBe(false);
    expect(restaurantSchema.safeParse({ ...s, town: { ...s.town, zones: ['reef'] } }).success).toBe(false);
    expect(restaurantSchema.safeParse({ ...s, town: { ...s.town, zones: ['shallows', 'moon'] } }).success).toBe(false);
  });
});

describe('plots in locked zones', () => {
  it('cannot be unlocked until their zone is reached, then grow outward as before', () => {
    const e = new RestaurantEngine(); e.state.cash = 1_000_000;
    const shallows = e.state.town.plots.filter(p => plotZone(p) === 'shallows' && !p.owned).sort((a, b) => Math.abs(a.x - C) + Math.abs(a.z - C) - Math.abs(b.x - C) - Math.abs(b.z - C));
    for (const p of shallows) expect(e.unlockPlot(p.x, p.z)).toBeNull();
    expect(ownedCount(e.state.town)).toBe(25);
    const cash = e.state.cash;
    expect(e.unlockPlot(C + 3, C)).toBe('Reach the Coral Reef first.'); expect(e.unlockPlot(0, 0)).toBe('Reach the Twilight Zone first.');
    expect(e.state.cash).toBe(cash); expect(plotAt(e.state.town, C + 3, C)!.owned).toBe(false);
    e.state.town.zones.push('reef');
    expect(e.unlockPlot(C + 4, C)).toBe('Reach the Twilight Zone first.');
    expect(e.unlockPlot(C + 3, C)).toBeNull(); expect(plotAt(e.state.town, C + 3, C)!.owned).toBe(true);
    e.state.town.zones.push('twilight'); expect(e.unlockPlot(C + 4, C)).toBeNull(); expect(e.unlockPlot(0, 0)).toBe('Unlock a plot next to your town first.');
  });
});

describe('5×5 save migration', () => {
  function legacyTown() {
    const plots: LegacyPlot[] = [];
    for (let z = 0; z < LEGACY_TOWN_SIZE; z++) for (let x = 0; x < LEGACY_TOWN_SIZE; x++) plots.push({ x, z, owned: false, building: null, level: 0, job: null });
    const set = (x: number, z: number, patch: Partial<LegacyPlot>) => Object.assign(plots.find(p => p.x === x && p.z === z)!, { owned: true, ...patch });
    set(2, 2, { building: 'restaurant', level: 7, job: { kind: 'upgrade', startedAt: 1_800_000_000_000, endsAt: 1_800_000_060_000 } });
    set(3, 2, { building: 'kelpFarm', level: 4 }); set(0, 0, { building: 'workshop', level: 12 });
    set(4, 4, { building: 'garden', level: 1, job: { kind: 'build', startedAt: 1_800_000_000_000, endsAt: 1_800_000_030_000 } });
    set(1, 3, {});
    return { plots, builders: 2, pearls: 42, charms: { current: 3, tide: 1 }, lastGiftDay: '2027-01-15' };
  }
  it('moves every plot, building, level and job to the centred position', () => {
    const old = legacyTown(), migrated = migrateTown(old) as Town & { plots: LegacyPlot[] };
    expect(migrated.plots).toHaveLength(81);
    for (const plot of old.plots) expect(plotAt(migrated, plot.x + 2, plot.z + 2)).toEqual({ ...plot, x: plot.x + 2, z: plot.z + 2 });
    expect((migrated.plots as LegacyPlot[]).filter(p => plotZone(p) !== 'shallows').every(p => !p.owned && !p.building && !p.job)).toBe(true);
    expect(migrated.buildings.map(b => [b.kind, b.x / 4, b.z / 4, b.level])).toEqual([['workshop', 2, 2, 12], ['restaurant', C, C, 7], ['kelpFarm', C + 1, C, 4], ['garden', C + 2, C + 2, 1]]);
    expect(migrateTown(migrated)).toBe(migrated);
  });
  it('loads a 25-plot save through the engine, keeps everything and finishes its jobs on time', () => {
    const s = JSON.parse(JSON.stringify(createRestaurant())); s.town = legacyTown();
    const h = harness(JSON.stringify(s)), e = new RestaurantEngine(h.storage, h.now);
    expect(e.loadWarning).toBe('');
    const town = e.state.town;
    expect(town).toMatchObject({ builders: 2, pearls: 42, charms: { current: 3, tide: 1 }, lastGiftDay: '2027-01-15', zones: ['shallows'] });
    expect(on(town, C, C)).toMatchObject({ kind: 'restaurant', level: 7, job: { kind: 'upgrade', endsAt: 1_800_000_060_000 } });
    expect(on(town, C + 1, C)).toMatchObject({ kind: 'kelpFarm', level: 4, job: null });
    expect(on(town, C - 2, C - 2)).toMatchObject({ kind: 'workshop', level: 12 });
    expect(plotAt(town, C - 1, C + 1)).toEqual({ x: C - 1, z: C + 1, owned: true }); expect(on(town, C - 1, C + 1)).toBeUndefined();
    expect(ownedCount(town)).toBe(5);
    // Nearness bonuses survive the move: the kelp farm is still across a street from the restaurant.
    expect(e.townEffects().kelpCost).toBeCloseTo(1 - 4 * .06 * 1.5);
    h.advance(30); e.update(.1); expect(on(town, C + 2, C + 2)!.job).toBeNull();
    h.advance(30); e.update(.1); expect(on(town, C, C)).toMatchObject({ level: 8, job: null });
    e.save(); expect(h.read().town.plots).toHaveLength(81); expect(restaurantSchema.safeParse(h.read()).success).toBe(true);
  });
  it('still refuses a town of the wrong size without overwriting the save', () => {
    const s = JSON.parse(JSON.stringify(createRestaurant())); s.town.plots = s.town.plots.slice(0, 30);
    const raw = JSON.stringify(s), h = harness(raw), e = new RestaurantEngine(h.storage, h.now);
    expect(e.loadWarning).not.toBe(''); e.save(); expect(JSON.stringify(h.read())).toBe(raw);
  });
  it('names each zone for players', () => {
    expect(Object.values(ZONES).map(z => z.name)).toEqual(['Sunlit Shallows', 'Coral Reef', 'Twilight Zone', 'Abyss']);
    expect([ZONES.reef.price, ZONES.twilight.price, ZONES.abyss.price]).toEqual([5000, 20000, 120000]);
  });
});
