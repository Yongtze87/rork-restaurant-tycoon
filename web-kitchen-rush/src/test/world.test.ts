import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { RestaurantEngine, OFFLINE_SERVICE_DAYS } from '@/management/engine';
import { BIOMES, CLAIM, FAME_BONUS, FIRST_RING, MASTERY, OCEAN_BALANCE, VISITABLE_BIOMES, claimGate, claimPrice, claimableRegions, createOcean, describeModifiers, fameBonuses, isClaimable, masteryFame, migrateOcean, modifiersFor, neighbourIds, oceanSchema, regionAt, regionById, regionStatus, ring, worldBounds } from '@/management/ocean';
import { HOME_ID, REGION_PITCH, REGION_SIZE, cellOf, inHome, regionBlock, regionCenter, regionOfPlot } from '@/management/world';
import { BUILDINGS, TOWN_BALANCE, TOWN_SIZE, branchIncome, buildableAt, createTown, jobSeconds, plotAt, plotsIn, townEffects, unlockCost, upgradeCost, type BuildingKind } from '@/management/town';
import { achievement, isClaimable as achievementReady } from '@/management/collections';
import { ZONES, type ZoneId } from '@/management/zones';
import { createRestaurant, restaurantSchema } from '@/management/types';
import { pickRegion } from '@/management/sim/simulator';

// These tests compare long offline replays with live play, so the crew may work more than one day while away.
beforeEach(() => { RestaurantEngine.offlineDays = Infinity; });
afterEach(() => { RestaurantEngine.offlineDays = OFFLINE_SERVICE_DAYS; });


function harness() {
  let now = 1_800_000_000_000, raw = '';
  const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
  return { storage, now: () => now, advance: (seconds: number) => { now += seconds * 1000; }, read: () => JSON.parse(raw), write: (value: unknown) => { raw = JSON.stringify(value); } };
}
function advance(e: RestaurantEngine, seconds: number) { for (let i = 0; i < seconds * 10; i++) e.update(.1); }
const C = Math.floor(TOWN_SIZE / 2);
const zones = (e: RestaurantEngine, ...ids: ZoneId[]) => { e.state.town.zones.push(...ids); };
/** A rich owner who reached the given zones, with an engine on a fake wall clock and storage. */
function rich(reached: ZoneId[] = ['reef'], h = harness()) { const e = new RestaurantEngine(h.storage, h.now); e.state.cash = 1_000_000; zones(e, ...reached); return { e, h }; }
/** Build and finish a building at once (construction is tested elsewhere). */
function place(e: RestaurantEngine, x: number, z: number, kind: BuildingKind, level = 1) {
  const plot = plotAt(e.state.town, x, z)!; Object.assign(plot, { owned: true, building: kind, level, job: null }); return plot;
}

describe('world geometry', () => {
  it('puts the 9×9 home town in region (0, 0) and a 7×7 block with a one-plot path in every other cell', () => {
    expect(regionBlock(0, 0)).toEqual({ x0: 0, z0: 0, size: 9 });
    expect(regionBlock(1, 0)).toEqual({ x0: 10, z0: 1, size: REGION_SIZE });
    expect(regionBlock(-1, -1)).toEqual({ x0: -8, z0: -8, size: REGION_SIZE });
    expect([regionOfPlot(4, 4), regionOfPlot(10, 1), regionOfPlot(16, 7), regionOfPlot(-2, 3)]).toEqual([HOME_ID, '1,0', '1,0', '-1,0']);
    // Seabed paths between regions belong to no region.
    expect([regionOfPlot(9, 4), regionOfPlot(17, 4), regionOfPlot(-1, 4), regionOfPlot(-9, 4)]).toEqual([null, null, null, null]);
    expect(cellOf(-1, 9)).toEqual({ x: -1, y: 1 }); expect(regionCenter(1, 0)).toEqual({ x: 13, z: 4 }); expect(regionCenter(0, 0)).toEqual({ x: C, z: C });
    expect(inHome({ x: 8, z: 0 })).toBe(true); expect(inHome({ x: 9, z: 0 })).toBe(false); expect(REGION_PITCH).toBe(TOWN_SIZE);
  });
});

describe('region generation', () => {
  it('is the same every time, for any coordinates', () => {
    expect(regionAt(4, -3)).toMatchObject({ id: '4,-3', ring: 4, name: 'Frost Floe', biome: 'ice', difficulty: 2.7 });
    expect(regionAt(-7, 12)).toMatchObject({ name: 'Blue Fall', biome: 'trench', difficulty: 8.1 });
    expect(regionAt(250, -400)).toMatchObject({ name: 'Sunburst Crown', biome: 'atoll', difficulty: 240.3 });
    expect(regionById('4,-3')).toEqual(regionAt(4, -3)); expect(regionById('nope')).toBeNull();
  });
  it('uses the hand-made first ring around the Home Reef, one of each biome', () => {
    expect(regionAt(0, 0)).toMatchObject({ name: 'Home Reef', biome: 'home', fame: MASTERY.homeAbyss, modifiers: modifiersFor('home', 1) });
    const ringOne = neighbourIds(0, 0).map(id => regionById(id)!);
    expect(ringOne.map(r => r.id).sort()).toEqual(Object.keys(FIRST_RING).sort());
    for (const r of ringOne) expect(r).toMatchObject(FIRST_RING[r.id]);
    expect(new Set(ringOne.map(r => r.biome))).toEqual(new Set(VISITABLE_BIOMES));
    const names = new Set(ringOne.map(r => r.name));
    for (let x = -12; x <= 12; x++) for (let y = -12; y <= 12; y++) if (ring(x, y) > 1) expect(names.has(regionAt(x, y).name), `${x},${y}`).toBe(false);
  });
  it('mixes upsides and downsides everywhere, keeps effects moderate, and rewards grow faster than difficulty', () => {
    const rings = new Map<number, { difficulty: number[]; fame: number[] }>();
    for (let x = -12; x <= 12; x++) for (let y = -12; y <= 12; y++) {
      const r = regionAt(x, y); if (r.biome === 'home') continue;
      const words = describeModifiers(r.modifiers);
      expect(words.upsides.length, r.id).toBeGreaterThan(0); expect(words.downsides.length, r.id).toBeGreaterThan(0);
      for (const v of [r.modifiers.buildCost, r.modifiers.buildTime, r.modifiers.branchIncome]) { expect(v).toBeGreaterThanOrEqual(OCEAN_BALANCE.clampLow); expect(v).toBeLessThanOrEqual(OCEAN_BALANCE.clampHigh); }
      const entry = rings.get(ring(x, y)) ?? { difficulty: [], fame: [] }; entry.difficulty.push(r.difficulty); entry.fame.push(r.fame); rings.set(ring(x, y), entry);
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    for (let n = 3; n <= 12; n++) {
      const here = rings.get(n)!, inner = rings.get(n - 2)!;
      expect(avg(here.difficulty)).toBeGreaterThan(avg(inner.difficulty));
      expect(avg(here.fame) / avg(inner.fame)).toBeGreaterThan(avg(here.difficulty) / avg(inner.difficulty));
      expect(Math.max(...here.difficulty) - Math.min(...here.difficulty)).toBeGreaterThanOrEqual(1);
    }
  });
  it('describes each biome in plain words: what it strengthens and what it costs', () => {
    expect(describeModifiers(regionAt(0, -1).modifiers)).toEqual({ upsides: ['Kelp farms 55% stronger here', 'Branch earns 4% more'], downsides: ['Building 3% dearer here', 'Building takes 8% longer here'] });
    expect(describeModifiers(regionAt(1, 0).modifiers).upsides[0]).toBe('Fisheries 55% stronger here');
    expect(describeModifiers(regionAt(-1, 1).modifiers).upsides[0]).toBe('Glow gardens 55% stronger here');
    expect(describeModifiers(regionAt(1, 1).modifiers)).toMatchObject({ upsides: ['Workshops 60% stronger here', 'Building 18% cheaper here'] });
    expect(describeModifiers(regionAt(1, -1).modifiers).upsides).toEqual(['Branch earns 38% more']);
    expect(describeModifiers(regionAt(-1, 0).modifiers)).toMatchObject({ upsides: ['Branch earns 79% more'], downsides: ['Building 29% dearer here', 'Building takes 10% longer here'] });
    expect(describeModifiers(regionAt(0, 1).modifiers)).toEqual({ upsides: ['Building 12% cheaper here', 'Building 12% faster here'], downsides: ['Branch earns 9% less'] });
    for (const biome of VISITABLE_BIOMES) expect(BIOMES[biome].goodFor.length).toBeGreaterThan(5);
  });
});

describe('claiming regions', () => {
  it('offers only regions next to a claimed one (all eight directions); everything else stays fog', () => {
    const o = createOcean();
    expect(neighbourIds(0, 0).every(id => isClaimable(o, id))).toBe(true);
    expect([regionStatus(o, HOME_ID), regionStatus(o, '1,1'), regionStatus(o, '2,0')]).toEqual(['home', 'claimable', 'fog']);
    const later = { ...o, regions: ['1,1'] };
    expect([regionStatus(later, '1,1'), regionStatus(later, '2,2'), regionStatus(later, '2,0'), regionStatus(later, '3,3')]).toEqual(['claimed', 'claimable', 'claimable', 'fog']);
    expect(claimableRegions(later)).toHaveLength(8 + 5 - 1);
    expect(worldBounds(later)).toEqual({ x0: -1, y0: -1, x1: 2, y1: 2 });
  });
  it('gates how far out you may claim by the home town’s depth zones', () => {
    expect([1, 2, 3, 7].map(claimGate)).toEqual(['reef', 'twilight', 'abyss', 'abyss']);
    const { e } = rich([]);
    expect(e.claimError('1,0')).toBe('Reach the Coral Reef at home to claim regions this far out.');
    zones(e, 'reef'); expect(e.claimError('1,0')).toBeNull();
    expect(e.claimRegion('1,0')).toBeNull();
    expect(e.claimError('2,0')).toBe('Reach the Twilight Zone at home to claim regions this far out.');
    zones(e, 'twilight'); expect(e.claimRegion('2,0')).toBeNull();
    expect(e.claimError('3,0')).toBe('Reach the Abyss at home to claim regions this far out.');
    zones(e, 'abyss'); expect(e.claimError('3,0')).toBeNull();
    expect(e.claimError('5,0')).toBe('Claim a region next to this one first.');
    expect(e.claimError('1,0')).toBe('Ember Vents is already yours.'); expect(e.claimError('0,0')).toBe('Home Reef is already yours.'); expect(e.claimError('x')).toBe('Choose a region first.');
  });
  it('charges more for distance, difficulty and every region already claimed', () => {
    const lagoon = regionAt(0, 1), trench = regionAt(-1, 0), far = regionAt(2, 0);
    expect(claimPrice(lagoon, 0)).toBe(CLAIM.base); expect(claimPrice(trench, 0)).toBeGreaterThan(claimPrice(lagoon, 0) * 3);
    expect(claimPrice(far, 0)).toBeGreaterThan(claimPrice(regionAt(1, 1), 0)); expect(claimPrice(lagoon, 3)).toBeGreaterThan(claimPrice(lagoon, 2));
    const { e } = rich(), price = e.claimPrice('0,1');
    expect(price).toBe(CLAIM.base); e.state.cash = price - 1;
    expect(e.claimRegion('0,1')).toBe('Claiming Glasswater Lagoon costs $2,500.'); expect(e.state.ocean.regions).toEqual([]);
    e.state.cash = price; expect(e.claimRegion('0,1')).toBeNull(); expect(e.state.cash).toBe(0);
    expect(e.claimPrice('-1,1')).toBe(Math.round(claimPrice(regionAt(-1, 1), 1) * (1 - e.fameBonuses().build) / 10) * 10);
  });
  it('lets the owner claim into tonight’s bills, and refuses only without the cash', () => {
    const e = new RestaurantEngine(); zones(e, 'reef'); e.open();
    e.state.cash = e.claimPrice('0,1') - 1; expect(e.claimRegion('0,1')).toBeTruthy();
    e.state.cash += 1; expect(e.claimRegion('0,1')).toBeNull(); expect(e.state.cash).toBe(0);
  });
  it('adds the region’s 49 plots in place, with its middle plot owned, and keeps everything already built', () => {
    const { e, h } = rich(); place(e, C + 1, C, 'garden', 4);
    const before = structuredClone(e.state.town.plots);
    expect(e.claimRegion('1,0')).toBeNull();
    const plots = plotsIn(e.state.town, '1,0'), centre = regionCenter(1, 0);
    expect(plots).toHaveLength(REGION_SIZE * REGION_SIZE); expect(plots.filter(p => p.owned)).toEqual([{ x: centre.x, z: centre.z, owned: true, building: null, level: 0, job: null }]);
    expect(e.state.town.plots.slice(0, before.length)).toEqual(before);
    expect(e.event).toBe(`Ember Vents is yours (+${masteryFame(regionAt(1, 0), 'claim')} fame). Unlock plots and build a branch restaurant there.`);
    const reloaded = new RestaurantEngine(h.storage, h.now);
    expect(reloaded.loadWarning).toBe(''); expect(reloaded.state.town).toEqual(e.state.town); expect(reloaded.state.ocean).toEqual(e.state.ocean);
    expect(restaurantSchema.safeParse(reloaded.state).success).toBe(true);
  });
  it('unlocks region plots next to owned ones, priced per region and apart from the home town', () => {
    const { e } = rich(); e.claimRegion('0,1');
    const c = regionCenter(0, 1), homePrice = e.plotPrice();
    expect(e.unlockPlot(c.x + 2, c.z)).toBe('Unlock a plot next to one you own here first.');
    const first = e.plotPrice(c.x + 1, c.z), cash = e.state.cash;
    expect(first).toBe(Math.round(300 * regionAt(0, 1).modifiers.buildCost / 10) * 10);
    expect(e.unlockPlot(c.x + 1, c.z)).toBeNull(); expect(e.state.cash).toBe(cash - first);
    expect(e.plotPrice(c.x + 2, c.z)).toBeGreaterThan(first); expect(e.plotPrice()).toBe(homePrice); expect(e.unlockPlot(c.x + 2, c.z)).toBeNull();
    // Home plots keep the home price curve.
    expect(unlockCost(e.state.town)).toBe(unlockCost(createTown()));
  });
});

describe('specialisation applies only in its own region', () => {
  it('makes a kelp farm in a kelp forest stronger, but not one at home or in another biome', () => {
    const { e } = rich(['reef', 'twilight']); e.claimRegion('0,-1'); e.claimRegion('1,0');
    const kelp = regionCenter(0, -1), vents = regionCenter(1, 0);
    const kelpFarm = (x: number, z: number) => { const t = createTown(); t.plots.push(...structuredClone(e.state.town.plots.slice(TOWN_SIZE * TOWN_SIZE))); Object.assign(plotAt(t, x, z)!, { owned: true, building: 'kelpFarm', level: 5 }); return 1 - townEffects(t).kelpCost; };
    const atHome = kelpFarm(0, 0), inForest = kelpFarm(kelp.x, kelp.z), inVents = kelpFarm(vents.x, vents.z);
    expect(atHome).toBeCloseTo(5 * TOWN_BALANCE.producerPerLevel); expect(inVents).toBeCloseTo(atHome);
    expect(inForest).toBeCloseTo(atHome * regionAt(0, -1).modifiers.boost.kelpFarm!);
  });
  it('keeps town-wide caps', () => {
    const { e } = rich(); e.claimRegion('0,-1');
    const c = regionCenter(0, -1);
    for (let i = -3; i <= 3; i++) place(e, c.x + i, c.z + 2, 'kelpFarm', 15);
    expect(e.townEffects().kelpCost).toBeCloseTo(1 - TOWN_BALANCE.producerCap);
  });
  it('charges region prices and build times only for plots in that region', () => {
    const { e } = rich(['reef', 'twilight']); e.claimRegion('-1,0'); e.claimRegion('0,1'); e.state.ocean.fame = 0; // prices without the fame discount
    const trench = regionCenter(-1, 0), lagoon = regionCenter(0, 1), m = regionAt(-1, 0).modifiers;
    expect(e.buildPrice('garden')).toBe(BUILDINGS.garden.buildCost);
    expect(e.buildPrice('garden', trench.x, trench.z)).toBe(Math.round(BUILDINGS.garden.buildCost * m.buildCost / 10) * 10);
    expect(e.buildPrice('garden', lagoon.x, lagoon.z)).toBeLessThan(BUILDINGS.garden.buildCost);
    expect(e.upgradePrice('garden', 4, trench.x, trench.z)).toBe(Math.round(upgradeCost('garden', 4) * m.buildCost / 10) * 10);
    expect(e.jobSeconds('garden', 1, trench.x, trench.z)).toBe(Math.round(BUILDINGS.garden.buildSeconds * m.buildTime));
    expect(e.jobSeconds('garden', 1, lagoon.x, lagoon.z)).toBeLessThan(BUILDINGS.garden.buildSeconds);
    const cash = e.state.cash; expect(e.build(trench.x, trench.z, 'garden')).toBeNull();
    expect(e.state.cash).toBe(cash - e.buildPrice('garden', trench.x, trench.z));
    expect(plotAt(e.state.town, trench.x, trench.z)!.job!.endsAt - plotAt(e.state.town, trench.x, trench.z)!.job!.startedAt).toBe(e.jobSeconds('garden', 1, trench.x, trench.z) * 1000);
  });
  it('makes workshops in a sunken city speed up every job more', () => {
    const { e } = rich(); e.claimRegion('1,1');
    const home = createTown(); Object.assign(plotAt(home, 0, 0)!, { owned: true, building: 'workshop', level: 5 });
    const c = regionCenter(1, 1); place(e, c.x, c.z, 'workshop', 5);
    expect(jobSeconds(e.state.town, 'garden', 6)).toBeLessThan(jobSeconds(home, 'garden', 6));
  });
});

describe('branch restaurants', () => {
  it('open only outside the Home Reef, one per region', () => {
    const { e } = rich(); e.claimRegion('1,-1');
    const c = regionCenter(1, -1);
    expect(buildableAt(e.state.town, { x: C + 1, z: C })).not.toContain('branch');
    expect(buildableAt(e.state.town, c)[0]).toBe('branch');
    e.state.town.plots.find(p => p.x === C + 1 && p.z === C)!.owned = true;
    expect(e.build(C + 1, C, 'branch')).toBe('Branches open in other regions. Claim a region first.');
    expect(e.build(c.x, c.z, 'branch')).toBeNull(); expect(e.event).toBe('Building a branch restaurant.');
    e.state.town.builders = 2; e.unlockPlot(c.x + 1, c.z);
    expect(buildableAt(e.state.town, { x: c.x + 1, z: c.z })).not.toContain('branch');
    expect(e.build(c.x + 1, c.z, 'branch')).toBe('This region already has a branch.');
  });
  it('earn from level, region and fame, and only once finished', () => {
    expect(branchIncome(1, 1)).toBe(TOWN_BALANCE.branchBase); expect(branchIncome(0, 1.5)).toBe(0);
    expect(branchIncome(6, 1.2, .1)).toBe(Math.round(TOWN_BALANCE.branchBase * 6 ** TOWN_BALANCE.branchExponent * 1.2 * 1.1));
    const { e, h } = rich(); e.claimRegion('1,-1'); e.claimRegion('0,1');
    const ice = regionCenter(1, -1), lagoon = regionCenter(0, 1);
    e.build(ice.x, ice.z, 'branch'); expect(e.branchIncomeAt(ice.x, ice.z)).toBe(0); expect(e.branchTotal()).toBe(0);
    h.advance(BUILDINGS.branch.buildSeconds * 2); e.update(.1);
    const fame = e.fameBonuses().branch;
    expect(e.branchIncomeAt(ice.x, ice.z)).toBe(branchIncome(1, regionAt(1, -1).modifiers.branchIncome, fame));
    place(e, lagoon.x, lagoon.z, 'branch', 1);
    expect(e.branchIncomeAt(ice.x, ice.z)).toBeGreaterThan(e.branchIncomeAt(lagoon.x, lagoon.z)); // ice shelf tips, lagoon earns less
    expect(e.branchTotal()).toBe(e.branchIncomeAt(ice.x, ice.z) + e.branchIncomeAt(lagoon.x, lagoon.z));
  });
  it('pay at every closing, on the receipt as branch income, counted in profit', () => {
    const e = new RestaurantEngine(); zones(e, 'reef'); e.state.cash = 50_000; e.claimRegion('1,-1');
    const c = regionCenter(1, -1); place(e, c.x, c.z, 'branch', 6); e.state.cash = 2000;
    const income = e.branchTotal(); expect(income).toBeGreaterThan(200);
    e.open(); advance(e, 300);
    const day = e.state.history[0];
    expect(day.branch).toBe(income);
    expect(day.profit).toBe(day.revenue + day.tips + income - day.ingredients - day.wages - day.rent - day.debtPayment);
    expect(e.state.history.length).toBeGreaterThanOrEqual(1); expect(e.state.history.every(r => r.branch === income)).toBe(true);
  });
  it('earn exactly the same while the owner is away as in live play', async () => {
    const h = harness(), setup = new RestaurantEngine(h.storage, h.now);
    zones(setup, 'reef', 'twilight'); setup.state.cash = 60_000; setup.claimRegion('1,-1'); setup.claimRegion('-1,0');
    place(setup, regionCenter(1, -1).x, regionCenter(1, -1).z, 'branch', 4);
    const t = regionCenter(-1, 0); setup.build(t.x, t.z, 'branch'); setup.state.cash = 3000; setup.save();
    // The live engine's wall clock moves with each step, as the replay's does (construction finishes on wall time).
    let wall = h.now();
    const offline = new RestaurantEngine(h.storage, h.now), online = new RestaurantEngine(undefined, () => wall);
    online.state = structuredClone(offline.state); await online.resume();
    offline.open(); online.open(); advance(offline, 21); advance(online, 21); offline.suspend();
    h.advance(900); for (let i = 0; i < 9000; i++) { online.update(.1); wall += 100; }
    const restored = new RestaurantEngine(h.storage, h.now); await restored.resume();
    const { lastActiveAt: _a, ...a } = restored.state, { lastActiveAt: _b, ...b } = online.state;
    expect(restored.state.day).toBeGreaterThan(3); expect(a).toEqual(b);
    // The trench branch finished during the time away and earned from the next closing on.
    expect(restored.state.history.some(r => r.branch > restored.state.history[0].branch)).toBe(true);
  });
});

describe('fame from mastering regions', () => {
  it('is paid once for claiming, branch levels 6 and 11, and owning every plot; never taken back', () => {
    const { e, h } = rich(), region = regionAt(1, 1);
    expect(e.claimRegion('1,1')).toBeNull();
    const claim = masteryFame(region, 'claim'); expect(e.state.ocean.fame).toBe(claim); expect(e.state.ocean.mastery).toEqual(['1,1:claim']);
    const c = regionCenter(1, 1); e.build(c.x, c.z, 'branch'); h.advance(3600); e.update(.1);
    const branch = plotAt(e.state.town, c.x, c.z)!; branch.level = 5; e.upgrade(c.x, c.z); h.advance(3600); e.update(.1);
    expect(branch.level).toBe(6); expect(e.state.ocean.fame).toBe(claim + masteryFame(region, 'branch6')); expect(e.lastCompletion?.text).toBe(`Branch restaurant reached level 6. +${masteryFame(region, 'branch6')} fame.`);
    branch.level = 10; e.upgrade(c.x, c.z); h.advance(3 * 3600); e.update(.1);
    expect(e.state.ocean.mastery).toEqual(['1,1:claim', '1,1:branch6', '1,1:branch11']);
    for (const p of plotsIn(e.state.town, '1,1')) if (!p.owned && p !== plotsIn(e.state.town, '1,1').find(q => !q.owned && q.x === c.x + 3 && q.z === c.z + 3)) p.owned = true;
    const fameBefore = e.state.ocean.fame; expect(e.unlockPlot(c.x + 3, c.z + 3)).toBeNull();
    expect(e.state.ocean.fame).toBe(fameBefore + masteryFame(region, 'full')); expect(e.event).toContain(`+${masteryFame(region, 'full')} fame`);
    expect(e.state.ocean.fame).toBe(['claim', 'branch6', 'branch11', 'full'].reduce((s, k) => s + masteryFame(region, k as 'claim'), 0));
    // Nothing is paid twice, and fame never goes down.
    const total = e.state.ocean.fame; branch.level = 10; e.upgrade(c.x, c.z); h.advance(4 * 3600); e.update(.1); expect(e.state.ocean.fame).toBe(total);
  });
  it('pays the Home Reef’s fame once for reaching the Abyss', () => {
    const e = new RestaurantEngine(), s = e.state;
    s.town.zones.push('reef', 'twilight'); s.reputation = 5; s.cash = 1e6;
    s.town.plots.slice(0, 12).forEach(p => Object.assign(p, { owned: true, building: 'garden', level: 13, job: null }));
    expect(e.unlockZone('abyss')).toBeNull(); expect(s.ocean.fame).toBe(MASTERY.homeAbyss); expect(e.event).toContain(`+${MASTERY.homeAbyss} fame`);
    s.town.zones.pop(); expect(e.unlockZone('abyss')).toBeNull(); expect(s.ocean.fame).toBe(MASTERY.homeAbyss);
  });
  it('grows every bonus with fame but never past its cap', () => {
    expect(fameBonuses(0)).toEqual({ tips: 0, build: 0, arrival: 0, branch: 0 });
    let last = fameBonuses(0);
    for (const fame of [5, 20, 60, 200, 1000, 1e9]) {
      const b = fameBonuses(fame);
      for (const key of ['tips', 'build', 'arrival', 'branch'] as const) { expect(b[key]).toBeGreaterThanOrEqual(last[key]); expect(b[key]).toBeLessThanOrEqual(FAME_BONUS[key]); }
      last = b;
    }
    expect(fameBonuses(1e9).tips).toBeCloseTo(FAME_BONUS.tips, 2);
  });
  it('makes building and claiming cheaper, branches richer and service better in the engine', () => {
    const plain = new RestaurantEngine(), famous = new RestaurantEngine(); famous.state.ocean.fame = 75;
    const k = fameBonuses(75);
    expect(famous.plotPrice()).toBe(Math.round(unlockCost(createTown()) * (1 - k.build) / 10) * 10); expect(plain.plotPrice()).toBe(unlockCost(createTown()));
    expect(famous.zonePrice('abyss')).toBe(Math.round(ZONES.abyss.price * (1 - k.build) / 10) * 10);
    expect(famous.claimPrice('1,0')).toBe(Math.round(claimPrice(regionAt(1, 0), 0) * (1 - k.build) / 10) * 10);
    plain.open(); famous.open(); advance(plain, 600); advance(famous, 600);
    const tips = (e: RestaurantEngine) => e.state.history.reduce((sum, r) => sum + r.tips, 0) / Math.max(1, e.state.history.reduce((sum, r) => sum + r.revenue, 0));
    expect(tips(famous)).toBeGreaterThan(tips(plain) + k.tips * .5);
    expect(famous.state.lifetimeServed).toBeGreaterThan(0);
  });
});

describe('collections', () => {
  it('counts regions claimed, biomes claimed and branch levels', () => {
    const { e } = rich();
    expect(achievementReady(e.state, achievement('regions-1')!)).toBe(false);
    e.claimRegion('-1,1');
    expect(achievementReady(e.state, achievement('regions-1')!)).toBe(true); expect(achievementReady(e.state, achievement('claim-atoll')!)).toBe(true);
    expect(achievementReady(e.state, achievement('claim-kelp')!)).toBe(false); expect(achievement('regions-3')).toBeDefined(); expect(achievement('regions-10')).toBeDefined();
    const c = regionCenter(-1, 1); place(e, c.x, c.z, 'branch', 6);
    expect(achievementReady(e.state, achievement('branch-level-6')!)).toBe(true); expect(achievementReady(e.state, achievement('branch-level-11')!)).toBe(false);
    expect(e.claimAchievement('regions-1')).toBeNull();
    // Colony-build achievements are gone.
    expect(achievement('colonies-1')).toBeUndefined(); expect(achievement('biome-kelp')).toBeUndefined();
  });
});

describe('saves', () => {
  it('load a plain save from before the world as the Home Reef only, unchanged', () => {
    const h = harness(), { ocean: _, ...legacy } = createRestaurant(); legacy.day = 9; legacy.town.plots[0].owned = true;
    h.write(legacy);
    const e = new RestaurantEngine(h.storage, h.now);
    expect(e.loadWarning).toBe(''); expect(e.state.day).toBe(9); expect(e.state.ocean).toEqual(createOcean());
    expect(e.state.town).toEqual(legacy.town); expect(e.state.town.plots).toHaveLength(81);
    // Old receipts gain branch income 0.
    expect(restaurantSchema.parse({ ...legacy, history: [{ ...legacy.totals, challenges: [], day: 1, wages: 60, rent: 30, debtPayment: 0, profit: 1, rating: 3 }] }).history[0].branch).toBe(0);
  });
  it('load a colony-build save as one world: fame kept, founded regions claimed (empty), milestones paid stay paid', () => {
    const h = harness(), s = JSON.parse(JSON.stringify(createRestaurant()));
    s.ocean = { fame: 64, colonies: [
      { region: '0,0', name: 'Home Reef', fame: 30, abyss: true, days: 240, served: 9000, startServed: 0 },
      { region: '0,-1', name: 'Kelpwood Hollow', fame: 22, abyss: true, days: 200, served: 7000, startServed: 9000 },
      { region: '1,-1', name: 'Frostlight Shelf', fame: 34, abyss: false, days: 0, served: 0, startServed: 16000 },
    ] };
    s.collections.claimed = ['colonies-1', 'biome-kelp', 'dish-salad-bronze'];
    s.town.zones = ['shallows', 'reef'];
    h.write(s);
    const e = new RestaurantEngine(h.storage, h.now);
    expect(e.loadWarning).toBe('');
    expect(e.state.ocean).toEqual({ fame: 64, regions: ['0,-1', '1,-1'], mastery: ['0,-1:claim', '1,-1:claim', '0,0:abyss'] });
    for (const id of ['0,-1', '1,-1']) { const plots = plotsIn(e.state.town, id); expect(plots).toHaveLength(49); expect(plots.filter(p => p.owned).map(p => ({ x: p.x, z: p.z }))).toEqual([regionCenter(...(id.split(',').map(Number) as [number, number]))]); }
    expect(e.state.town.plots.slice(0, 81)).toEqual(s.town.plots);
    expect(e.state.collections.claimed).toEqual(['colonies-1', 'biome-kelp', 'dish-salad-bronze']);
    expect(e.claimError('0,-2')).toBe('Reach the Twilight Zone at home to claim regions this far out.');
    // Reaching the Abyss again pays no second Home Reef fame; saving and loading again changes nothing.
    e.save(); const again = new RestaurantEngine(h.storage, h.now); expect(again.state).toEqual(e.state);
  });
  it('never fails on a messy colony record', () => {
    expect(migrateOcean({ fame: -3, colonies: [null, 5, { region: 'nope' }, { region: '2,2' }, { region: '2,2' }, { region: '0,0', abyss: 'yes' }] })).toEqual({ fame: 0, regions: ['2,2'], mastery: ['2,2:claim'] });
    const s = createRestaurant(); expect(restaurantSchema.safeParse({ ...s, ocean: { colonies: [] } }).success).toBe(true);
    expect(oceanSchema.safeParse({ fame: 1, regions: ['0,0'] }).success).toBe(false); expect(oceanSchema.safeParse({ fame: 1, regions: ['1,0', '1,0'] }).success).toBe(false);
  });
  it('rejects plots outside any region and towns missing home plots', () => {
    const s = createRestaurant();
    expect(restaurantSchema.safeParse({ ...s, town: { ...s.town, plots: [...s.town.plots, { x: 9, z: 4, owned: true, building: null, level: 0, job: null }] } }).success).toBe(false);
    expect(restaurantSchema.safeParse({ ...s, town: { ...s.town, plots: [...s.town.plots.slice(1), { x: 10, z: 1, owned: false, building: null, level: 0, job: null }] } }).success).toBe(false);
    expect(restaurantSchema.safeParse({ ...s, town: { ...s.town, plots: [...s.town.plots, { x: 10, z: 1, owned: false, building: 'branch', level: 1, job: null }] } }).success).toBe(true);
  });
});

describe('simulator region choice', () => {
  it('picks the easiest, richest or a balanced neighbour once the Coral Reef is reached', () => {
    const s = createRestaurant();
    expect(pickRegion(s, 'balanced')).toBeNull();
    s.town.zones.push('reef');
    expect(pickRegion(s, 'easiest')!.name).toBe('Glasswater Lagoon');
    expect(pickRegion(s, 'richest')!.name).toBe('Bluefall Trench');
    expect(pickRegion(s, 'balanced')!.name).toBe('Frostlight Shelf');
    expect(BIOMES.home.up).toEqual({});
  });
});
