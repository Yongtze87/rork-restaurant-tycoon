/**
 * Balance simulator: drives a real RestaurantEngine (no storage, injected wall clock) through
 * many service days at 1× with a scripted "player". Dev/test only; never imported by the app.
 *
 * Time model (see docs/BALANCE.md): the owner opens the game a few times per real day, plays
 * each session at 1×, and pauses when leaving. While away only wall-clock construction moves.
 */
import { GOALS, OFFLINE_SERVICE_DAYS, OFFLINE_SERVICE_HOURS, RestaurantEngine } from '../engine';
import { placementError } from '../layout';
import { CATALOG, DAY_LENGTH, width, DISHES, DISH_IDS, FURNITURE_MAX_LEVEL, capacity, comfort, furnitureUpgradeCost, isSeating, type FurnitureKind, type Furniture, type RestaurantState } from '../types';
import { CHARMS, MAX_BUILDERS, MAX_LEVEL, SHOP, TOWN_SIZE, activeLevel, branchIn, buildingPlot, busyBuilders, connected, nearSpot, neighbours, plotLockReason, plotsIn, restaurantOf, siteIn, type Building, type BuildingKind, type Plot, type Spot } from '../town';
import { claimGate, claimableRegions, regionById, type BoostKind, type Region } from '../ocean';
import { inHome, regionCenter } from '../world';
import { ZONE_IDS, ZONES, hasZone, zoneError, zoneRequirements, type ZoneId } from '../zones';

export type StrategyName = 'cautious' | 'builder' | 'balanced';
export const STRATEGIES: StrategyName[] = ['cautious', 'builder', 'balanced'];

export interface SimOptions {
  strategy: StrategyName;
  /** Real (calendar) days to simulate. */
  days: number;
  seed?: number;
  /** Play sessions per real day and their length in minutes (all at 1×). */
  sessions?: number;
  sessionMinutes?: number;
  /** Use Current/Tide charms on running construction. */
  charms?: boolean;
  /** Stop once this many service days are complete (for short test horizons). */
  maxServiceDays?: number;
  /** Claim ocean regions, build branches and specialised buildings there (default true). */
  regions?: boolean;
  /** Hours away that are replayed when the owner returns (default OFFLINE_SERVICE_HOURS, as in the game; the day cap still applies). 0: no offline service. */
  awayHours?: number;
  /** How the owner picks the next region among the claimable ones. */
  region?: RegionStrategy;
  /** Fixed region ids to claim, in order (overrides `region` while they last). */
  route?: string[];
}
export type RegionStrategy = 'easiest' | 'richest' | 'balanced';
export const REGION_STRATEGIES: RegionStrategy[] = ['easiest', 'richest', 'balanced'];
/** One claimed region's pacing: when it was claimed and when its branch reached levels 1, 6 and 11. */
export interface ClaimRun {
  index: number; region: string; name: string; biome: string; ring: number; difficulty: number; price: number;
  claimed: ZoneTiming; branch1?: ZoneTiming; branch6?: ZoneTiming; branch11?: ZoneTiming;
}
export interface DayRow { day: number; realDay: number; activeHours: number; cash: number; profit: number; bonus: number; branch: number; served: number; missed: number; reputation: number; buildings: number; fame: number; regions: number; }
export interface ZoneTiming { day: number; realDay: number; activeHours: number; }
export interface SimResult {
  strategy: StrategyName; seed: number; rows: DayRow[];
  unlockable: Partial<Record<ZoneId, ZoneTiming>>; unlocked: Partial<Record<ZoneId, ZoneTiming>>;
  /** First time each requirement of the next zone was met, keyed "zone:requirement". */
  requirements: Record<string, ZoneTiming & { index: number }>;
  reserveBlocks: number; loans: number; bankruptDays: number; minCash: number; finalCash: number;
  pearlsEarned: number; charmsEarned: { current: number; tide: number }; charmsUsed: { current: number; tide: number };
  buildings: { kind: BuildingKind; level: number }[]; furniture: { kind: FurnitureKind; level: number }[]; staff: number; trainedLevels: number;
  activeHours: number; serviceDays: number; spent: Record<string, number>;
  claims: ClaimRun[]; fame: number;
}

/** `wave`: every claimed region's branch must reach this level before the next region is claimed. `special`: specialised buildings per region. */
interface Params { reserveDays: number; townFirst: boolean; smartAdjacency: boolean; restaurantFirst: boolean; extraBuildings: number; decorTarget: number; plan: BuildingKind[]; wave: number; special: number; /** Real days between claims while a depth zone is still ahead (sooner only with spare cash). */ pause: number; }
const PARAMS: Record<StrategyName, Params> = {
  // Keeps several days of costs in hand, improves the dining room and the restaurant building first.
  cautious: { reserveDays: 4, townFirst: false, smartAdjacency: false, restaurantFirst: true, extraBuildings: 0, decorTarget: 70, wave: 7, special: 1, pause: 7, plan: ['garden', 'fishery', 'kelpFarm', 'homes', 'workshop', 'garden', 'fishery', 'kelpFarm', 'garden', 'homes', 'garden', 'workshop', 'fishery', 'kelpFarm'] },
  // Spends nearly everything on the town; producers and gardens touch the restaurant.
  builder: { reserveDays: 1.5, townFirst: true, smartAdjacency: true, restaurantFirst: false, extraBuildings: 3, decorTarget: 50, wave: 4, special: 3, pause: 3, plan: ['kelpFarm', 'fishery', 'garden', 'garden', 'homes', 'workshop', 'garden', 'homes', 'fishery', 'kelpFarm', 'garden', 'garden', 'workshop', 'homes', 'garden', 'fishery'] },
  balanced: { reserveDays: 2, townFirst: false, smartAdjacency: true, restaurantFirst: false, extraBuildings: 1, decorTarget: 60, wave: 6, special: 2, pause: 4, plan: ['garden', 'fishery', 'kelpFarm', 'garden', 'homes', 'workshop', 'garden', 'fishery', 'garden', 'kelpFarm', 'homes', 'garden', 'workshop', 'garden'] },
};

const C = Math.floor(TOWN_SIZE / 2);
const START = Date.UTC(2027, 0, 4, 0, 0, 0);
/** Session start hours (UTC) for 1–6 sessions a day. */
const SESSION_HOURS = [8, 13, 20, 17, 11, 22];

interface Pressure { samples: number; full: number; waiting: number; ready: number; noSeat: number; impatient: number; dirty: number; }
/** A planning-phase purchase. `cost` is what the owner wants in spare cash before buying it. */
interface Wish { cost: number; tag: string; grow?: boolean; run: () => string | null; }

/** One automated owner. All game changes go through public engine methods. */
export class Simulation {
  readonly engine: RestaurantEngine;
  private now = START;
  private activeSeconds = 0;
  private pressure: Pressure[] = [];
  private live: Pressure = { samples: 0, full: 0, waiting: 0, ready: 0, noSeat: 0, impatient: 0, dirty: 0 };
  private lastMissed = 0;
  private p: Params;
  readonly result: SimResult;
  private lastCharms = { current: 0, tide: 0 };
  private lastPearls = 0;
  private lastDay = 1;
  /** The owner reviews the dining room and crew once a day, as they did when it closed between days. */
  private planningDue = true;
  /** Replaying time away: the owner makes no decisions. */
  private away = false;

  constructor(readonly options: SimOptions) {
    this.engine = new RestaurantEngine(undefined, () => this.now);
    const seed = options.seed ?? 91273;
    this.engine.state.seed = seed;
    this.p = PARAMS[options.strategy];
    this.result = { strategy: options.strategy, seed, rows: [], unlockable: {}, unlocked: {}, requirements: {}, reserveBlocks: 0, loans: 0, bankruptDays: 0, minCash: this.s.cash, finalCash: 0, pearlsEarned: 0, charmsEarned: { current: 0, tide: 0 }, charmsUsed: { current: 0, tide: 0 }, buildings: [], furniture: [], staff: 0, trainedLevels: 0, activeHours: 0, serviceDays: 0, spent: {}, claims: [], fame: 0 };
    this.lastCharms = { ...this.s.town.charms }; this.lastPearls = this.s.town.pearls;
  }
  get s(): RestaurantState { return this.engine.state; }
  private get realDay(): number { return Math.floor((this.now - START) / 86_400_000) + 1; }
  private timing(): ZoneTiming { return { day: this.s.day, realDay: this.realDay, activeHours: +(this.activeSeconds / 3600).toFixed(2) }; }
  /** Every purchase, for --log. */
  readonly log: string[] = [];
  private spend(tag: string, cost: number): void { this.result.spent[tag] = (this.result.spent[tag] ?? 0) + cost; this.log.push(`d${this.s.day} ${tag} $${Math.round(cost)} → cash $${Math.round(this.s.cash)} · ${this.engine.event}`); }

  run(): SimResult {
    const sessions = Math.max(1, Math.min(6, this.options.sessions ?? 3)), minutes = this.options.sessionMinutes ?? 10;
    const hours = SESSION_HOURS.slice(0, sessions).sort((a, b) => a - b);
    outer: for (let day = 0; day < this.options.days; day++) for (const hour of hours) {
      const sessionStart = START + day * 86_400_000 + hour * 3_600_000;
      // Away with the restaurant open: replay service up to the cap, exactly as the game does on return (1× steps).
      const awayHours = this.options.awayHours ?? OFFLINE_SERVICE_HOURS;
      if (awayHours > 0 && this.s.phase === 'service' && this.now > START) {
        const end = Math.min(sessionStart, this.now + awayHours * 3_600_000);
        this.away = true;
        const startDay = this.s.day;
        while (this.now < end && this.s.day - startDay < OFFLINE_SERVICE_DAYS) { this.now += 100; this.engine.update(.1); if (this.s.day !== this.lastDay) this.dayEnded(); }
        this.away = false;
      }
      this.now = sessionStart; this.s.lastActiveAt = this.now;
      // Only grants the daily gift and finishes construction: offline service was replayed above, or the owner paused.
      void this.engine.resume();
      if (this.engine.catchingUp) throw new Error('Simulator left the restaurant running offline');
      this.trackRewards();
      if (this.s.day === 1 && !this.s.history.length && this.s.phase === 'planning') this.engine.open();
      if (this.s.phase === 'service') this.engine.pause(false);
      this.act();
      for (let i = 0; i < minutes * 600; i++) {
        this.now += 100; this.activeSeconds += .1;
        this.engine.update(.1);
        this.classifyMisses();
        if (this.s.phase === 'service' && i % 10 === 0) this.sample();
        if (this.s.day !== this.lastDay) this.dayEnded();
        if (i % 100 === 0) this.act();
        if (this.options.maxServiceDays && this.result.serviceDays >= this.options.maxServiceDays) break outer;
      }
      if ((this.options.awayHours ?? OFFLINE_SERVICE_HOURS) === 0) { if (this.s.phase === 'service') this.engine.pause(true); this.engine.suspend(); }
    }
    return this.finish();
  }
  /** The business at the start of a service day (for payback experiments), plus the wall clock. */
  snapshot(): { state: RestaurantState; now: number } { return { state: structuredClone(this.s), now: this.now }; }

  private sample(): void {
    const s = this.s, seated = s.guests.filter(g => g.stage !== 'leaving' && g.stage !== 'arriving').length;
    this.live.samples++; if (seated + s.dirty.length >= capacity(s)) this.live.full++;
    this.live.dirty += s.dirty.length;
    this.live.waiting += s.guests.filter(g => g.stage === 'waiting').length;
    this.live.ready += s.guests.filter(g => g.stage === 'ready').length + s.dirty.length * .5;
  }
  /** Why guests were lost today, read from the engine's own event line at the moment it happened. */
  private classifyMisses(): void {
    const missed = this.s.totals.missed;
    if (missed > this.lastMissed && this.s.phase === 'service') {
      if (this.engine.event.includes('no free seat')) this.live.noSeat += missed - this.lastMissed;
      else if (this.engine.event.includes('waited too long')) this.live.impatient += missed - this.lastMissed;
    }
    this.lastMissed = missed;
  }
  private recent(): Pressure {
    const list = this.pressure.slice(-2), sum = { samples: 0, full: 0, waiting: 0, ready: 0, noSeat: 0, impatient: 0, dirty: 0 };
    for (const p of list) { sum.samples += p.samples; sum.full += p.full; sum.waiting += p.waiting; sum.ready += p.ready; sum.noSeat += p.noSeat; sum.impatient += p.impatient; sum.dirty += p.dirty; }
    const n = Math.max(1, sum.samples); return { ...sum, full: sum.full / n, waiting: sum.waiting / n, ready: sum.ready / n, dirty: sum.dirty / n };
  }
  private trackRewards(): void {
    const c = this.s.town.charms, r = this.result;
    if (c.current > this.lastCharms.current) r.charmsEarned.current += c.current - this.lastCharms.current;
    if (c.tide > this.lastCharms.tide) r.charmsEarned.tide += c.tide - this.lastCharms.tide;
    if (this.s.town.pearls > this.lastPearls) r.pearlsEarned += this.s.town.pearls - this.lastPearls;
    this.lastCharms = { ...c }; this.lastPearls = this.s.town.pearls;
  }

  private dayEnded(): void {
    this.lastDay = this.s.day;
    this.pressure.push(this.live); this.live = { samples: 0, full: 0, waiting: 0, ready: 0, noSeat: 0, impatient: 0, dirty: 0 };
    const report = this.s.history[this.s.history.length - 1];
    this.result.rows.push({ day: report.day, realDay: this.realDay, activeHours: +(this.activeSeconds / 3600).toFixed(2), cash: Math.round(this.s.cash), profit: Math.round(report.profit), bonus: report.challenges.reduce((sum, c) => sum + (c.rewarded ? c.reward : 0), 0), branch: report.branch, served: report.served, missed: report.missed, reputation: this.s.reputation, buildings: this.builtCount(), fame: this.s.ocean.fame, regions: this.s.ocean.regions.length });
    this.result.serviceDays++;
    if (this.engine.event.includes('bank covered')) this.result.bankruptDays++;
    this.planningDue = true;
    this.trackRewards();
    if (!this.away) this.act();
  }

  private reserve(): number { return this.engine.operatingCost() * this.p.reserveDays + 30; }
  private budget(): number { return this.s.cash - this.reserve(); }
  /** Finished buildings in the home town (what depth zones count). */
  private builtCount(): number { return this.homeBuildings().filter(b => b.kind !== 'restaurant' && b.job?.kind !== 'build').length; }
  private homePlots(): Plot[] { return this.s.town.plots.filter(inHome); }
  private homeBuildings(): Building[] { return this.s.town.buildings.filter(b => inHome(buildingPlot(b))); }
  /** A building of this kind has its corner on the plot. */
  private plotHas(plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind): boolean { return this.s.town.buildings.some(b => b.kind === kind && buildingPlot(b).x === plot.x && buildingPlot(b).z === plot.z); }
  /** A spot in an owned plot that a road already joins to the restaurant or a branch. */
  private site(kind: BuildingKind, plot: Pick<Plot, 'x' | 'z'>): Spot | null {
    const spot = siteIn(this.s.town, kind, plot.x, plot.z); if (!spot) return null;
    return connected(this.s.town, { ...spot, id: -1, level: 1, job: null }) ? spot : null;
  }
  /** Unlock a plot and lay its streets, the way most owners grow a town. */
  private unlockWithStreets(plot: Pick<Plot, 'x' | 'z'>): boolean {
    const e = this.engine, cost = e.plotPrice(plot.x, plot.z); if (e.unlockPlot(plot.x, plot.z) !== null) return false;
    this.spend('plots', cost);
    const streets = e.streetsFor(plot.x, plot.z).price; if (e.layStreets(plot.x, plot.z) === null) this.spend('roads', streets);
    return true;
  }
  private nextZone(): ZoneId | null { return ZONE_IDS.find(id => !hasZone(this.s.town, id)) ?? null; }

  /** The owner's routine: claim, unlock zones, run the town, then (in planning) the dining room. */
  private act(): void {
    const e = this.engine, s = this.s;
    for (const goal of GOALS) if (!s.claimed.includes(goal.id) && goal.value(s) >= goal.target) e.claim(goal.id);
    for (const id of ZONE_IDS) if (!hasZone(s.town, id) && !this.result.unlockable[id] && zoneError(s, id, e.zonePrice(id)) === null) this.result.unlockable[id] = this.timing();
    const next = this.nextZone();
    if (next) for (const [i, req] of zoneRequirements(s, next, e.zonePrice(next)).entries()) {
      const key = `${next}:${req.label.split(' · ')[0].replace(/^\$[\d,]+$/, 'price')}`;
      if (req.met && !this.result.requirements[key]) this.result.requirements[key] = { ...this.timing(), index: i };
    }
    const zone = this.nextZone();
    if (zone && zoneError(s, zone, e.zonePrice(zone)) === null && s.cash - e.zonePrice(zone) >= this.engine.operatingCost() + 30) {
      const price = e.zonePrice(zone);
      if (e.unlockZone(zone) === null) { this.result.unlocked[zone] = this.timing(); this.spend('zones', price); }
    }
    if (this.options.regions !== false) this.worldTurn();
    if (s.town.pearls >= SHOP.builder.pearls && s.town.builders < MAX_BUILDERS && this.options.strategy !== 'cautious') e.buy('builder');
    // The restaurant stays open: the dining room, crew and town are all managed while guests come and go.
    const planning = this.planningDue; this.planningDue = false;
    if (this.p.townFirst) { this.townTurn(); if (planning) this.planningTurn(); } else { if (planning) this.planningTurn(); this.townTurn(); }
    this.useCharms();
    this.result.minCash = Math.min(this.result.minCash, s.cash);
  }

  private planningWishes(): Wish[] {
    const e = this.engine, s = this.s, list: Wish[] = [];
    const pressure = this.recent(), crew = (role: 'chef' | 'server') => s.staff.filter(m => m.role === role);
    const newDish = DISH_IDS.find(d => hasZone(s.town, DISHES[d].zone) && !s.menu[d].enabled);
    if (newDish) list.push({ cost: 0, tag: 'menu', run: () => e.setDish(newDish, true, DISHES[newDish].fair) });
    if (!s.expanded && s.history.length >= 3 && !this.findSpot('table')) list.push({ cost: 900, tag: 'grotto', run: () => e.expand() });
    // The owner only grows the dining room or crew after guests were turned away, and fixes the busiest part.
    const struggling = pressure.impatient >= 3;
    const tables = s.furniture.filter(f => isSeating(f.kind)).length, seat = s.expanded && this.findSpot('booth') ? 'booth' : 'table';
    // Seats blocked by uncleared tables need a server, not another table.
    const room0 = s.staff.length < e.crewLimit();
    if (pressure.noSeat >= 3 && pressure.dirty >= 1 && room0) list.push({ cost: 150, tag: 'crew', grow: true, run: () => e.hire('server') });
    else if (pressure.noSeat >= 3 && tables < 16) list.push({ cost: CATALOG[seat].price, tag: 'furniture', grow: true, run: () => this.buyFurniture(seat) });
    const chefs = crew('chef'), room = s.staff.length < e.crewLimit();
    const stations = s.furniture.filter(f => f.kind === 'prep' || f.kind === 'grill').length;
    if (struggling && pressure.waiting >= pressure.ready) {
      if (chefs.length >= stations) list.push({ cost: CATALOG[stations % 2 ? 'prep' : 'grill'].price, tag: 'furniture', grow: true, run: () => this.buyFurniture(stations % 2 ? 'prep' : 'grill') });
      else if (room) list.push({ cost: 150, tag: 'crew', grow: true, run: () => e.hire('chef') });
    }
    if (struggling && pressure.ready > pressure.waiting && room) list.push({ cost: 150, tag: 'crew', grow: true, run: () => e.hire('server') });
    if (comfort(s) < this.p.decorTarget) list.push({ cost: CATALOG.lamp.price, tag: 'furniture', run: () => this.buyFurniture(comfort(s) < 50 ? 'plant' : 'lamp') });
    const trainee = s.staff.filter(m => m.level < 3).sort((a, b) => a.level - b.level)[0];
    if (trainee && struggling && !room) list.push({ cost: 180 * trainee.level, tag: 'training', grow: true, run: () => e.train(trainee.id) });
    // Furniture upgrades: cheapest first, tables and stations ahead of decor.
    // Furniture is kept within three levels of the restaurant building, as its looks suggest.
    const hall = restaurantOf(s.town).level;
    const upgradable = s.furniture.filter(f => f.level < Math.min(FURNITURE_MAX_LEVEL, hall + 3) && s.day > 3).sort((a, b) => this.upgradeRank(a) - this.upgradeRank(b))[0];
    if (upgradable) {
      const cost = furnitureUpgradeCost(upgradable.kind, upgradable.level + 1);
      // Only the cautious owner treats furniture upgrades as a priority; others buy them with spare cash.
      list.push({ cost: this.p.restaurantFirst ? cost : cost * 3, tag: 'furnitureUpgrades', run: () => e.upgradeFurniture(upgradable.id) });
    }
    return list;
  }
  private upgradeRank(f: Furniture): number { return furnitureUpgradeCost(f.kind, f.level + 1) * (isSeating(f.kind) || f.kind === 'prep' || f.kind === 'grill' ? 1 : 1.6) * (this.p.restaurantFirst ? .5 : 1); }

  private planningTurn(): void {
    // While saving for a zone whose other requirements are met, only buy what keeps service running (growth).
    // Growth (tables, stations, crew, training) is judged on yesterday's service: one step per night.
    let grew = false;
    const failed = new Set<string>();
    for (let guard = 0; guard < 30; guard++) {
      const saving = this.savingFor() + this.claimSaving();
      const wish = this.planningWishes().find(w => (w.cost === 0 || w.cost <= this.budget() - (w.grow ? 0 : saving)) && !(grew && w.grow) && !failed.has(`${w.tag}:${w.cost}`));
      if (!wish) return;
      const before = this.s.cash;
      if (wish.run() !== null) { failed.add(`${wish.tag}:${wish.cost}`); continue; }
      grew ||= Boolean(wish.grow);
      this.spend(wish.tag, before - this.s.cash);
    }
  }
  /** Cash set aside for the next zone once only its price (and reputation) is missing. */
  private savingFor(): number {
    const zone = this.nextZone(); if (!zone) return 0;
    const info = ZONES[zone], best = Math.max(...this.homeBuildings().filter(b => b.job?.kind !== 'build').map(b => b.level));
    const ready = this.builtCount() >= info.buildings && best >= info.topLevel;
    return ready ? this.engine.zonePrice(zone) : 0;
  }
  /** Cash set aside for the next region once every branch is built up and its depth gate is open (zones come first). */
  private claimSaving(): number {
    if (this.options.regions === false || this.savingFor() || !this.claimDue()) return 0;
    const target = this.waveReady() ? this.nextRegion() : null, price = target ? this.engine.claimPrice(target.id) : 0;
    // Nobody hoards for a claim that would take more than about four real days of profit.
    const recent = this.result.rows.slice(-30), perDay = recent.reduce((sum, r) => sum + r.profit + r.bonus, 0) / Math.max(1, recent.length);
    return price <= perDay * 40 ? price : 0;
  }
  /** The owner sets money aside for a claim: the first one, after the last depth zone, or once a pause has passed since the last claim. */
  private claimDue(): boolean {
    const last = this.result.claims[this.result.claims.length - 1];
    return !last || !this.nextZone() || this.realDay - last.claimed.realDay >= this.p.pause;
  }
  private waveReady(): boolean { return this.s.ocean.regions.every(id => { const b = branchIn(this.s.town, id); return b && activeLevel(b) >= this.p.wave; }); }

  private findSpot(kind: FurnitureKind): Furniture | null { return findSpot(this.s, kind); }
  private buyFurniture(kind: FurnitureKind): string | null { return buyFurniture(this.engine, kind); }

  // ---- Town ----
  private townTurn(): void {
    for (let guard = 0; guard < 20; guard++) if (!this.townStep()) return;
  }
  private townStep(): boolean {
    const e = this.engine, s = this.s, town = s.town;
    if (busyBuilders(town) >= town.builders) return false;
    const zone = this.nextZone(), info = zone ? ZONES[zone] : null, saving = this.savingFor();
    const budget = this.budget() - saving - this.claimSaving();
    // Cautious owners hold town spending until the dining room is in shape.
    if (this.p.restaurantFirst && this.planningWishes().some(w => w.tag !== 'furnitureUpgrades' && w.tag !== 'training' && w.cost > 0) && s.day > 2) return false;
    const built = this.builtCount() + town.buildings.filter(b => b.job?.kind === 'build').length;
    const wantBuildings = info ? Math.max(info.buildings, built) : built;
    const cap = (info ? info.buildings : 99) + this.p.extraBuildings;
    if (info && built < Math.min(cap, wantBuildings + this.p.extraBuildings) && (built < info.buildings || this.p.townFirst || budget > 3000)) {
      const kind = this.p.plan[built % this.p.plan.length];
      return this.buildKind(kind, budget);
    }
    // Upgrade towards the zone's level requirement, then anything with spare cash.
    const plots = town.buildings.filter(b => !b.job && b.level < MAX_LEVEL && connected(town, b));
    if (!plots.length) return false;
    const best = Math.max(...this.homeBuildings().map(b => b.level));
    let target: Building | undefined;
    if (info && best < info.topLevel) {
      const home = plots.filter(b => inHome(buildingPlot(b))), leaders = this.p.restaurantFirst ? home.filter(p => p.kind === 'restaurant') : home.filter(p => p.level === best || p.level === best - 1);
      target = (leaders.length ? leaders : home.length ? home : plots).sort((a, b) => this.price(a) - this.price(b))[0];
      // A branch below the wave level and three levels behind the leader is next (the owner saves for it); so is a cheap one while the leader is out of reach.
      const branch = plots.filter(p => p.kind === 'branch').sort((a, b) => this.price(a) - this.price(b))[0];
      if (target && branch && (branch.level < this.p.wave && branch.level + 2 < best || this.price(target) > budget && this.price(branch) <= budget)) target = branch;
    } else {
      // More guests only help while the dining room keeps up: hold arrival upgrades after a rough day.
      const last = s.history[s.history.length - 1], overrun = last && last.missed > (last.served + last.missed) * .12;
      target = plots.filter(p => !(overrun && (p.kind === 'garden' || p.kind === 'restaurant'))).sort((a, b) => this.upgradeValue(a) - this.upgradeValue(b))[0];
      if (!target || this.price(target) > budget * (zone ? .5 : 1)) return false;
    }
    const cost = this.price(target);
    if (cost > budget) return false;
    if (e.upgrade(target.id) !== null) return false;
    this.spend('upgrades', cost); return true;
  }
  /** The next upgrade's price for a building (its region applied). */
  private price(b: Building): number { const p = buildingPlot(b); return this.engine.upgradePrice(b.kind, b.level + 1, p.x, p.z); }
  /** Lower is better: price, with workshops and spare homes ranked behind earning buildings; branches by price per extra dollar a day. */
  private upgradeValue(p: Building): number {
    if (p.kind === 'branch') { const gain = this.engine.branchIncomeAt(p, p.level + 1) - this.engine.branchIncomeAt(p, p.level); return this.price(p) * Math.min(3, 25 / Math.max(1, gain)); }
    const weight = p.kind === 'garden' || p.kind === 'restaurant' ? 1 : p.kind === 'workshop' ? 2 : p.kind === 'homes' ? 3 : 1.5;
    return this.price(p) * weight * (this.p.restaurantFirst && p.kind === 'restaurant' ? .5 : 1);
  }
  private buildKind(kind: BuildingKind, budget: number): boolean {
    const e = this.engine, town = this.s.town, home = this.homePlots();
    const sites = home.filter(p => p.owned).map(p => ({ plot: p, spot: this.site(kind, p) })).filter((x): x is { plot: Plot; spot: Spot } => x.spot !== null);
    const owned = sites.sort((a, b) => this.plotScore(b.plot, kind, b.spot) - this.plotScore(a.plot, kind, a.spot))[0];
    const fresh = home.filter(p => plotLockReason(town, p) === null).sort((a, b) => this.plotScore(b, kind) - this.plotScore(a, kind))[0];
    let spot = owned?.spot;
    const price = e.buildPrice(kind);
    if (!owned || (fresh && this.plotScore(fresh, kind) > this.plotScore(owned.plot, kind, owned.spot) + 5 && budget >= e.plotPrice() + price * 2)) {
      if (!fresh) return false;
      const cost = e.plotPrice(); if (cost + price + 100 > budget) return false;
      if (!this.unlockWithStreets(fresh)) return false;
      spot = this.site(kind, fresh) ?? undefined;
      if (!spot || price > this.budget() - this.savingFor()) return true;
    } else if (price > budget) return false;
    if (e.build(kind, spot!.x, spot!.z, spot!.turned) !== null) return false;
    this.spend('buildings', price); return true;
  }
  private plotScore(plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind, spot?: Spot): number {
    const town = this.s.town, near = (k: BuildingKind) => spot ? nearSpot(town, spot, k) : neighbours(town, plot).some(p => this.plotHas(p, k)) || this.plotHas(plot, k);
    const ring = Math.max(Math.abs(plot.x - C), Math.abs(plot.z - C));
    if (!this.p.smartAdjacency) return -ring - (plot.z * TOWN_SIZE + plot.x) / 100;
    let score = -ring;
    if ((kind === 'kelpFarm' || kind === 'fishery' || kind === 'garden') && near('restaurant')) score += 10;
    if (kind === 'garden' && near('homes')) score += 4;
    if (kind === 'homes' && near('garden')) score += 6;
    // Keep spots near the restaurant for buildings that profit from them.
    if ((kind === 'homes' || kind === 'workshop') && near('restaurant')) score -= 8;
    return score;
  }
  // ---- The world: claim regions in waves, open branches, build what each region is good for ----
  /** Claim the next region once every branch is built up; then a branch in each region, then its specialised buildings. */
  private worldTurn(): void {
    const e = this.engine, s = this.s, town = s.town, budget = this.budget() - this.savingFor();
    this.trackClaims();
    const target = this.waveReady() ? this.nextRegion() : null;
    if (target && e.claimError(target.id) === null && e.claimPrice(target.id) <= budget * (this.claimDue() ? 1 : .3)) {
      const price = e.claimPrice(target.id);
      if (e.claimRegion(target.id) === null) { this.spend('regions', price); this.result.claims.push({ index: this.result.claims.length + 1, region: target.id, name: target.name, biome: target.biome, ring: target.ring, difficulty: target.difficulty, price, claimed: this.timing() }); }
    }
    for (const id of s.ocean.regions) {
      if (busyBuilders(town) >= town.builders) return;
      const region = regionById(id)!, centre = regionCenter(region.x, region.y), branch = branchIn(town, id), room = this.budget() - this.savingFor();
      if (!branch) { const price = e.buildPrice('branch', centre.x, centre.z), spot = siteIn(town, 'branch', centre.x, centre.z); if (spot && price <= room && e.build('branch', spot.x, spot.z, spot.turned) === null) this.spend('branches', price); continue; }
      const kind = (Object.keys(region.modifiers.boost)[0] as BoostKind | undefined) ?? (region.biome === 'lagoon' ? 'garden' : null);
      if (!kind || activeLevel(branch) < 2) continue;
      const plots = plotsIn(town, id), have = town.buildings.filter(b => b.kind === kind && plots.some(p => p.x === buildingPlot(b).x && p.z === buildingPlot(b).z)).length;
      if (have >= this.p.special) continue;
      const near = (p: Plot) => [p, ...neighbours(town, p)].some(n => this.plotHas(n, 'branch') || this.plotHas(n, kind));
      const plot = plots.filter(p => (p.owned ? this.site(kind, p) : plotLockReason(town, p) === null) && near(p)).sort((a, b) => Number(b.owned) - Number(a.owned))[0];
      if (!plot) continue;
      const plotCost = plot.owned ? 0 : e.plotPrice(plot.x, plot.z), price = e.buildPrice(kind, plot.x, plot.z);
      if (plotCost + price * 2 + 100 > room) continue;
      if (!plot.owned && !this.unlockWithStreets(plot)) continue;
      const spot = this.site(kind, plot);
      if (spot && e.build(kind, spot.x, spot.z, spot.turned) === null) this.spend('buildings', price);
    }
  }
  /** The owner's region choice among regions whose depth gate is open. */
  private nextRegion(): Region | null {
    const fixed = this.options.route?.find(id => !this.s.ocean.regions.includes(id));
    if (fixed) return regionById(fixed);
    return pickRegion(this.s, this.options.region ?? 'balanced');
  }
  private trackClaims(): void {
    for (const c of this.result.claims) {
      const b = branchIn(this.s.town, c.region), level = b ? activeLevel(b) : 0;
      if (level >= 1 && !c.branch1) c.branch1 = this.timing();
      if (level >= 6 && !c.branch6) c.branch6 = this.timing();
      if (level >= 11 && !c.branch11) c.branch11 = this.timing();
    }
  }
  private useCharms(): void {
    this.trackRewards();
    if (this.options.charms === false) return;
    const e = this.engine, town = this.s.town;
    for (const b of town.buildings.filter(p => p.job)) for (const charm of ['tide', 'current'] as const) {
      // Spend a charm once at least half of it would be used.
      while (b.job && town.charms[charm] > 0 && b.job.endsAt - this.now >= CHARMS[charm].seconds * 500) {
        if (e.useCharm(b.id, charm) !== null) break;
        this.result.charmsUsed[charm]++;
      }
    }
    this.lastCharms = { ...town.charms };
  }

  private finish(): SimResult {
    const s = this.s, r = this.result;
    r.finalCash = Math.round(s.cash); r.activeHours = +(this.activeSeconds / 3600).toFixed(2);
    r.buildings = s.town.buildings.map(b => ({ kind: b.kind, level: b.level }));
    r.furniture = s.furniture.map(f => ({ kind: f.kind, level: f.level }));
    r.staff = s.staff.length; r.trainedLevels = s.staff.reduce((sum, m) => sum + m.level - 1, 0);
    this.trackClaims(); r.fame = s.ocean.fame;
    return r;
  }
}

export const simulate = (options: SimOptions): SimResult => new Simulation(options).run();

/** The owner's region choice among claimable regions whose depth gate is reached: lowest difficulty, most fame, or most fame among the easier half. */
export function pickRegion(s: RestaurantState, strategy: RegionStrategy): Region | null {
  const options = claimableRegions(s.ocean).filter(r => hasZone(s.town, claimGate(r.ring)));
  if (!options.length) return null;
  const byFame = (a: Region, c: Region) => c.fame - a.fame || a.difficulty - c.difficulty || a.id.localeCompare(c.id);
  if (strategy === 'richest') return options.sort(byFame)[0];
  const easy = [...options].sort((a, c) => a.difficulty - c.difficulty || byFame(a, c));
  if (strategy === 'easiest') return easy[0];
  const median = easy[Math.floor((easy.length - 1) / 2)].difficulty;
  return options.filter(r => r.difficulty <= median).sort(byFame)[0];
}

/** Average profit (including challenge bonuses) over service days [from, to]. */
export function averageProfit(result: SimResult, from: number, to: number): number {
  const rows = result.rows.filter(r => r.day >= from && r.day <= to);
  return rows.length ? Math.round(rows.reduce((sum, r) => sum + r.profit + r.bonus, 0) / rows.length) : 0;
}

/** First valid tile (reading order) and rotation for a new piece, or null when the floor is full. */
export function findSpot(s: RestaurantState, kind: FurnitureKind): Furniture | null {
  const columns = width(s);
  for (let z = 0; z < 10; z++) for (let x = 0; x < columns; x++) for (let rotation = 0; rotation < 4; rotation++) {
    const item = { id: -1, kind, x, z, rotation, level: 1 } as Furniture;
    if (!placementError(s, item)) return item;
  }
  return null;
}
export function buyFurniture(e: RestaurantEngine, kind: FurnitureKind): string | null {
  const spot = findSpot(e.state, kind); if (!spot) return 'No room';
  return e.place({ id: -1, kind, x: spot.x, z: spot.z, rotation: spot.rotation });
}
/** Unlock (if needed, with its streets) a plot near the restaurant or away from it, and build there on a spot a road reaches. */
export function buildNear(e: RestaurantEngine, kind: BuildingKind, nearRestaurant: boolean): string | null {
  const town = e.state.town, joined = (spot: Spot) => connected(town, { ...spot, id: -1, level: 1, job: null });
  const spotIn = (p: Plot) => { const spot = siteIn(town, kind, p.x, p.z); return spot && joined(spot) && nearSpot(town, spot, 'restaurant') === nearRestaurant ? spot : null; };
  let plot = town.plots.find(p => p.owned && spotIn(p));
  if (!plot) {
    const hall = buildingPlot(restaurantOf(town)), ring = (p: Plot) => Math.max(Math.abs(p.x - hall.x), Math.abs(p.z - hall.z));
    plot = town.plots.filter(p => plotLockReason(town, p) === null).sort((a, b) => nearRestaurant ? ring(a) - ring(b) : ring(b) - ring(a))[0]; if (!plot) return 'No plot';
    const error = e.unlockPlot(plot.x, plot.z) ?? e.layStreets(plot.x, plot.z); if (error) return error;
  }
  const spot = spotIn(plot); return spot ? e.build(kind, spot.x, spot.z, spot.turned) : 'No spot';
}
export function upgradeBuilding(e: RestaurantEngine, kind: BuildingKind): string | null {
  const b = e.state.town.buildings.filter(p => p.kind === kind && !p.job).sort((a, c) => a.level - c.level)[0];
  return b ? e.upgrade(b.id) : `No ${kind}`;
}

/**
 * A tidy, well-staffed reference business for payback experiments, built with public methods:
 * 'early' ≈ a first-week Shallows/Reef restaurant, 'mid' ≈ a Twilight restaurant a few weeks in.
 */
export function referenceSnapshot(stage: 'early' | 'mid'): { state: RestaurantState; now: number } {
  let now = START;
  const e = new RestaurantEngine(undefined, () => now), s = e.state, mid = stage === 'mid', finishJobs = () => { now += 48 * 3_600_000; e.update(.1); };
  s.cash = 1e7; s.reputation = 4.5; s.town.builders = MAX_BUILDERS;
  const plan: [BuildingKind, boolean, number][] = mid
    ? [['garden', true, 6], ['fishery', true, 6], ['kelpFarm', true, 6], ['garden', true, 6], ['homes', false, 6], ['workshop', false, 5], ['garden', false, 5], ['homes', false, 3], ['fishery', false, 3]]
    : [['garden', true, 2], ['fishery', true, 2], ['kelpFarm', true, 2], ['homes', false, 1]];
  for (const [kind, near, level] of plan) {
    if (buildNear(e, kind, near) !== null) throw new Error(`reference: ${kind}`); finishJobs();
    const b = s.town.buildings.filter(p => p.kind === kind && p.level === 1 && !p.job).pop()!;
    while (b.level < level) { if (e.upgrade(b.id) !== null) throw new Error('reference upgrade'); finishJobs(); }
  }
  for (let i = 0; i < (mid ? 4 : 1); i++) { e.upgrade(restaurantOf(s.town).id); finishJobs(); }
  for (const zone of mid ? ['reef', 'twilight'] as ZoneId[] : ['reef'] as ZoneId[]) s.town.zones.push(zone);
  for (const dish of DISH_IDS) if (hasZone(s.town, DISHES[dish].zone)) e.setDish(dish, true, DISHES[dish].fair);
  if (mid) e.expand();
  for (let i = 0; i < (mid ? 5 : 2); i++) buyFurniture(e, 'table');
  buyFurniture(e, 'plant'); if (mid) { buyFurniture(e, 'lamp'); buyFurniture(e, 'prep'); buyFurniture(e, 'grill'); }
  for (const role of (mid ? ['chef', 'server', 'chef', 'server', 'server'] : ['chef', 'server']) as ('chef' | 'server')[]) e.hire(role);
  if (mid) for (const m of s.staff) e.train(m.id);
  s.cash = 3000; s.history = []; s.claimed = GOALS.map(g => g.id);
  return { state: structuredClone(s), now };
}

export interface Investment { name: string; apply: (e: RestaurantEngine) => string | null; }
export interface Payback { name: string; cost: number; gainPerDay: number; paybackDays: number; }
/**
 * Marginal value of one investment from a snapshot: the same days are replayed with and without it
 * (several RNG seeds, no other owner actions) and the extra cash per day is compared with its cost.
 */
export function measurePayback(snapshot: { state: RestaurantState; now: number }, investments: Investment[], days = 12, seeds = 4): Payback[] {
  const run = (seed: number, apply?: Investment['apply']) => {
    let now = snapshot.now;
    const e = new RestaurantEngine(undefined, () => now);
    e.state = structuredClone(snapshot.state);
    // Extra cash so the opening reserve never decides the comparison; it changes nothing else.
    Object.assign(e.state, { seed, phase: 'planning', dailyChallenges: [], isPaused: false, renovation: false, guests: [], dirty: [], cash: e.state.cash + 20_000 });
    let cost = 0;
    if (apply) {
      const before = e.state.cash; e.state.cash += 1e6; // measure value, not affordability
      if (apply(e) !== null) return null;
      cost = before + 1e6 - e.state.cash; e.state.cash -= 1e6;
      now += 24 * 3_600_000; e.update(.1); // construction finishes before the measured days
    }
    const start = e.state.cash, first = e.state.day; if (e.open() !== null) return null;
    while (e.state.day < first + days) { now += 100; e.update(.1); if (e.state.phase === 'planning' && e.open() !== null) break; }
    return { gain: e.state.cash - start, cost };
  };
  const seedList = Array.from({ length: seeds }, (_, i) => 1000 + i * 7919);
  const base = seedList.map(seed => run(seed)!.gain);
  return investments.map(inv => {
    const runs = seedList.map(seed => run(seed, inv.apply));
    if (runs.some(r => !r)) return { name: inv.name, cost: NaN, gainPerDay: NaN, paybackDays: NaN };
    const gain = runs.reduce((sum, r, i) => sum + r!.gain - base[i], 0) / seeds / days, cost = runs[0]!.cost;
    return { name: inv.name, cost, gainPerDay: Math.round(gain), paybackDays: gain > 0 ? Math.round(cost / gain) : Infinity };
  });
}
