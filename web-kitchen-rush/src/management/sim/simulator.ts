/**
 * Balance simulator: drives a real RestaurantEngine (no storage, injected wall clock) through
 * many service days at 1× with a scripted "player". Dev/test only; never imported by the app.
 *
 * Time model (see docs/BALANCE.md): the owner opens the game a few times per real day, plays
 * each session at 1×, and pauses when leaving. While away only wall-clock construction moves.
 */
import { GOALS, RestaurantEngine } from '../engine';
import { placementError } from '../layout';
import { CATALOG, DAY_LENGTH, DISHES, DISH_IDS, FURNITURE_MAX_LEVEL, capacity, comfort, furnitureUpgradeCost, type FurnitureKind, type Furniture, type RestaurantState } from '../types';
import { BUILDINGS, CHARMS, MAX_BUILDERS, MAX_LEVEL, SHOP, TOWN_SIZE, busyBuilders, neighbours, plotLockReason, unlockCost, upgradeCost, type BuildingKind, type Plot } from '../town';
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
}
export interface DayRow { day: number; realDay: number; activeHours: number; cash: number; profit: number; bonus: number; served: number; missed: number; reputation: number; buildings: number; }
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
}

interface Params { reserveDays: number; townFirst: boolean; smartAdjacency: boolean; restaurantFirst: boolean; extraBuildings: number; decorTarget: number; plan: BuildingKind[]; }
const PARAMS: Record<StrategyName, Params> = {
  // Keeps several days of costs in hand, improves the dining room and the restaurant building first.
  cautious: { reserveDays: 4, townFirst: false, smartAdjacency: false, restaurantFirst: true, extraBuildings: 0, decorTarget: 70, plan: ['garden', 'fishery', 'kelpFarm', 'homes', 'workshop', 'garden', 'fishery', 'kelpFarm', 'garden', 'homes', 'garden', 'workshop', 'fishery', 'kelpFarm'] },
  // Spends nearly everything on the town; producers and gardens touch the restaurant.
  builder: { reserveDays: 1.5, townFirst: true, smartAdjacency: true, restaurantFirst: false, extraBuildings: 3, decorTarget: 50, plan: ['kelpFarm', 'fishery', 'garden', 'garden', 'homes', 'workshop', 'garden', 'homes', 'fishery', 'kelpFarm', 'garden', 'garden', 'workshop', 'homes', 'garden', 'fishery'] },
  balanced: { reserveDays: 2, townFirst: false, smartAdjacency: true, restaurantFirst: false, extraBuildings: 1, decorTarget: 60, plan: ['garden', 'fishery', 'kelpFarm', 'garden', 'homes', 'workshop', 'garden', 'fishery', 'garden', 'kelpFarm', 'homes', 'garden', 'workshop', 'garden'] },
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
  private renovating = false;
  private checkedToday = false;
  private pressure: Pressure[] = [];
  private live: Pressure = { samples: 0, full: 0, waiting: 0, ready: 0, noSeat: 0, impatient: 0, dirty: 0 };
  private lastMissed = 0;
  private p: Params;
  readonly result: SimResult;
  private lastCharms = { current: 0, tide: 0 };
  private lastPearls = 0;
  private lastDay = 1;

  constructor(readonly options: SimOptions) {
    this.engine = new RestaurantEngine(undefined, () => this.now);
    const seed = options.seed ?? 91273;
    this.engine.state.seed = seed;
    this.p = PARAMS[options.strategy];
    this.result = { strategy: options.strategy, seed, rows: [], unlockable: {}, unlocked: {}, requirements: {}, reserveBlocks: 0, loans: 0, bankruptDays: 0, minCash: this.s.cash, finalCash: 0, pearlsEarned: 0, charmsEarned: { current: 0, tide: 0 }, charmsUsed: { current: 0, tide: 0 }, buildings: [], furniture: [], staff: 0, trainedLevels: 0, activeHours: 0, serviceDays: 0, spent: {} };
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
      this.now = START + day * 86_400_000 + hour * 3_600_000;
      // The owner always pauses before leaving, so this only grants the daily gift and finishes construction.
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
        else if (this.s.phase === 'service' && !this.checkedToday && this.s.elapsed >= DAY_LENGTH - .5) { this.checkedToday = true; if (this.wantsPlanning()) { this.renovating = true; this.engine.closeEarly(); } }
        if (i % 100 === 0) this.act();
        if (this.options.maxServiceDays && this.result.serviceDays >= this.options.maxServiceDays) break outer;
      }
      if (this.s.phase === 'service') this.engine.pause(true);
      this.engine.suspend();
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
    this.result.rows.push({ day: report.day, realDay: this.realDay, activeHours: +(this.activeSeconds / 3600).toFixed(2), cash: Math.round(this.s.cash), profit: Math.round(report.profit), bonus: report.challenges.reduce((sum, c) => sum + (c.rewarded ? c.reward : 0), 0), served: report.served, missed: report.missed, reputation: this.s.reputation, buildings: this.builtCount() });
    this.result.serviceDays++;
    if (this.s.phase === 'planning' && !this.renovating) this.result.reserveBlocks++;
    this.renovating = false; this.checkedToday = false;
    this.trackRewards();
    this.act();
  }

  private reserve(): number { return this.engine.operatingCost() * this.p.reserveDays + 30; }
  private budget(): number { return this.s.cash - this.reserve(); }
  private builtCount(): number { return this.s.town.plots.filter(p => p.building && p.building !== 'restaurant' && p.job?.kind !== 'build').length; }
  private nextZone(): ZoneId | null { return ZONE_IDS.find(id => !hasZone(this.s.town, id)) ?? null; }

  /** The owner's routine: claim, unlock zones, run the town, then (in planning) the dining room. */
  private act(): void {
    const e = this.engine, s = this.s;
    for (const goal of GOALS) if (!s.claimed.includes(goal.id) && goal.value(s) >= goal.target) e.claim(goal.id);
    for (const id of ZONE_IDS) if (!hasZone(s.town, id) && !this.result.unlockable[id] && zoneError(s, id) === null) this.result.unlockable[id] = this.timing();
    const next = this.nextZone();
    if (next) for (const [i, req] of zoneRequirements(s, next).entries()) {
      const key = `${next}:${req.label.split(' · ')[0].replace(/^\$[\d,]+$/, 'price')}`;
      if (req.met && !this.result.requirements[key]) this.result.requirements[key] = { ...this.timing(), index: i };
    }
    const zone = this.nextZone();
    if (zone && zoneError(s, zone) === null && s.cash - ZONES[zone].price >= this.engine.operatingCost() + 30) {
      if (e.unlockZone(zone) === null) { this.result.unlocked[zone] = this.timing(); this.spend('zones', ZONES[zone].price); }
    }
    if (s.town.pearls >= SHOP.builder.pearls && s.town.builders < MAX_BUILDERS && this.options.strategy !== 'cautious') e.buy('builder');
    if (this.p.townFirst || s.phase !== 'planning') this.townTurn();
    if (s.phase === 'planning') {
      if (!this.p.townFirst) { this.planningTurn(); this.townTurn(); } else this.planningTurn();
      this.reopen();
    }
    this.useCharms();
    this.result.minCash = Math.min(this.result.minCash, s.cash);
  }

  private reopen(): void {
    const e = this.engine, s = this.s;
    if (e.open() === null) return;
    if (s.cash < 200 && s.debt === 0 && e.loan() === null) { this.result.loans++; if (e.open() === null) return; }
    // Let extra crew go (lower wages), then sell decor, until the opening reserve is met.
    for (const member of [...s.staff].reverse()) if (e.dismiss(member.id) === null && e.open() === null) return;
    for (const kind of ['lamp', 'divider', 'plant', 'table'] as FurnitureKind[]) {
      for (const item of s.furniture.filter(f => f.kind === kind)) { if (kind === 'table' && capacity(s) <= 4) break; e.sell(item.id); if (e.open() === null) return; }
    }
    if (!this.stuckDays.has(s.day)) { this.stuckDays.add(s.day); this.result.bankruptDays++; }
  }
  private stuckDays = new Set<number>();

  /** Something in the dining room (furniture, crew, menu) worth closing for tonight. */
  private wantsPlanning(): boolean { return this.planningWishes().some(w => w.cost <= this.budget()); }

  private planningWishes(): Wish[] {
    const e = this.engine, s = this.s, list: Wish[] = [];
    const pressure = this.recent(), crew = (role: 'chef' | 'server') => s.staff.filter(m => m.role === role);
    const newDish = DISH_IDS.find(d => hasZone(s.town, DISHES[d].zone) && !s.menu[d].enabled);
    if (newDish) list.push({ cost: 0, tag: 'menu', run: () => e.setDish(newDish, true, DISHES[newDish].fair) });
    if (!s.expanded && s.history.length >= 3 && !this.findSpot('table')) list.push({ cost: 900, tag: 'grotto', run: () => e.expand() });
    // The owner only grows the dining room or crew after guests were turned away, and fixes the busiest part.
    const struggling = pressure.impatient >= 3;
    const tables = s.furniture.filter(f => f.kind === 'table').length;
    // Seats blocked by uncleared tables need a server, not another table.
    const room0 = s.staff.length < e.crewLimit();
    if (pressure.noSeat >= 3 && pressure.dirty >= 1 && room0) list.push({ cost: 150, tag: 'crew', grow: true, run: () => e.hire('server') });
    else if (pressure.noSeat >= 3 && tables < 16) list.push({ cost: CATALOG.table.price, tag: 'furniture', grow: true, run: () => this.buyFurniture('table') });
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
    const hall = s.town.plots.find(p => p.building === 'restaurant')!.level;
    const upgradable = s.furniture.filter(f => f.level < Math.min(FURNITURE_MAX_LEVEL, hall + 3) && s.day > 3).sort((a, b) => this.upgradeRank(a) - this.upgradeRank(b))[0];
    if (upgradable) {
      const cost = furnitureUpgradeCost(upgradable.kind, upgradable.level + 1);
      // Only the cautious owner treats furniture upgrades as a priority; others buy them with spare cash.
      list.push({ cost: this.p.restaurantFirst ? cost : cost * 3, tag: 'furnitureUpgrades', run: () => e.upgradeFurniture(upgradable.id) });
    }
    return list;
  }
  private upgradeRank(f: Furniture): number { return furnitureUpgradeCost(f.kind, f.level + 1) * (f.kind === 'table' || f.kind === 'prep' || f.kind === 'grill' ? 1 : 1.6) * (this.p.restaurantFirst ? .5 : 1); }

  private planningTurn(): void {
    // While saving for a zone whose other requirements are met, only buy what keeps service running (growth).
    // Growth (tables, stations, crew, training) is judged on yesterday's service: one step per night.
    let grew = false;
    const failed = new Set<string>();
    for (let guard = 0; guard < 30; guard++) {
      const saving = this.savingFor();
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
    const info = ZONES[zone], best = Math.max(...this.s.town.plots.filter(p => p.building && p.job?.kind !== 'build').map(p => p.level));
    const ready = this.builtCount() >= info.buildings && best >= info.topLevel;
    return ready ? info.price : 0;
  }

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
    const budget = this.budget() - saving;
    // Cautious owners hold town spending until the dining room is in shape.
    if (this.p.restaurantFirst && this.planningWishes().some(w => w.tag !== 'furnitureUpgrades' && w.tag !== 'training' && w.cost > 0) && s.day > 2) return false;
    const built = this.builtCount() + town.plots.filter(p => p.job?.kind === 'build').length;
    const wantBuildings = info ? Math.max(info.buildings, built) : built;
    const cap = (info ? info.buildings : 99) + this.p.extraBuildings;
    if (info && built < Math.min(cap, wantBuildings + this.p.extraBuildings) && (built < info.buildings || this.p.townFirst || budget > 3000)) {
      const kind = this.p.plan[built % this.p.plan.length];
      return this.buildKind(kind, budget);
    }
    // Upgrade towards the zone's level requirement, then anything with spare cash.
    const plots = town.plots.filter(p => p.building && !p.job && p.level < MAX_LEVEL);
    if (!plots.length) return false;
    const best = Math.max(...town.plots.filter(p => p.building).map(p => p.level));
    let target: Plot | undefined;
    if (info && best < info.topLevel) {
      const leaders = this.p.restaurantFirst ? plots.filter(p => p.building === 'restaurant') : plots.filter(p => p.level === best || p.level === best - 1);
      target = (leaders.length ? leaders : plots).sort((a, b) => upgradeCost(a.building!, a.level + 1) - upgradeCost(b.building!, b.level + 1))[0];
    } else {
      // More guests only help while the dining room keeps up: hold arrival upgrades after a rough day.
      const last = s.history[s.history.length - 1], overrun = last && last.missed > (last.served + last.missed) * .12;
      target = plots.filter(p => !(overrun && (p.building === 'garden' || p.building === 'restaurant'))).sort((a, b) => this.upgradeValue(a) - this.upgradeValue(b))[0];
      if (!target || upgradeCost(target.building!, target.level + 1) > budget * (zone ? .5 : 1)) return false;
    }
    const cost = upgradeCost(target.building!, target.level + 1);
    if (cost > budget) return false;
    if (e.upgrade(target.x, target.z) !== null) return false;
    this.spend('upgrades', cost); return true;
  }
  /** Lower is better: price, with workshops and spare homes ranked behind earning buildings. */
  private upgradeValue(p: Plot): number {
    const weight = p.building === 'garden' || p.building === 'restaurant' ? 1 : p.building === 'workshop' ? 2 : p.building === 'homes' ? 3 : 1.5;
    return upgradeCost(p.building!, p.level + 1) * weight * (this.p.restaurantFirst && p.building === 'restaurant' ? .5 : 1);
  }
  private buildKind(kind: BuildingKind, budget: number): boolean {
    const e = this.engine, town = this.s.town;
    const owned = town.plots.filter(p => p.owned && !p.building).sort((a, b) => this.plotScore(b, kind) - this.plotScore(a, kind))[0];
    const fresh = town.plots.filter(p => plotLockReason(town, p) === null).sort((a, b) => this.plotScore(b, kind) - this.plotScore(a, kind))[0];
    let plot = owned;
    if (!plot || (fresh && this.plotScore(fresh, kind) > this.plotScore(plot, kind) + 5 && budget >= unlockCost(town) + BUILDINGS[kind].buildCost * 2)) {
      if (!fresh) return false;
      const cost = unlockCost(town); if (cost + BUILDINGS[kind].buildCost > budget) return false;
      if (e.unlockPlot(fresh.x, fresh.z) !== null) return false;
      this.spend('plots', cost); plot = fresh;
      if (BUILDINGS[kind].buildCost > this.budget() - this.savingFor()) return true;
    } else if (BUILDINGS[kind].buildCost > budget) return false;
    if (e.build(plot.x, plot.z, kind) !== null) return false;
    this.spend('buildings', BUILDINGS[kind].buildCost); return true;
  }
  private plotScore(plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind): number {
    const town = this.s.town, near = (k: BuildingKind) => neighbours(town, plot).some(p => p.building === k);
    const ring = Math.max(Math.abs(plot.x - C), Math.abs(plot.z - C));
    if (!this.p.smartAdjacency) return -ring - (plot.z * TOWN_SIZE + plot.x) / 100;
    let score = -ring;
    if ((kind === 'kelpFarm' || kind === 'fishery' || kind === 'garden') && near('restaurant')) score += 10;
    if (kind === 'garden' && near('homes')) score += 4;
    if (kind === 'homes' && near('garden')) score += 6;
    // Keep restaurant-adjacent plots for buildings that profit from them.
    if ((kind === 'homes' || kind === 'workshop') && near('restaurant')) score -= 8;
    return score;
  }
  private useCharms(): void {
    this.trackRewards();
    if (this.options.charms === false) return;
    const e = this.engine, town = this.s.town;
    for (const plot of town.plots.filter(p => p.job)) for (const charm of ['tide', 'current'] as const) {
      // Spend a charm once at least half of it would be used.
      while (plot.job && town.charms[charm] > 0 && plot.job.endsAt - this.now >= CHARMS[charm].seconds * 500) {
        if (e.useCharm(plot.x, plot.z, charm) !== null) break;
        this.result.charmsUsed[charm]++;
      }
    }
    this.lastCharms = { ...town.charms };
  }

  private finish(): SimResult {
    const s = this.s, r = this.result;
    r.finalCash = Math.round(s.cash); r.activeHours = +(this.activeSeconds / 3600).toFixed(2);
    r.buildings = s.town.plots.filter(p => p.building).map(p => ({ kind: p.building!, level: p.level }));
    r.furniture = s.furniture.map(f => ({ kind: f.kind, level: f.level }));
    r.staff = s.staff.length; r.trainedLevels = s.staff.reduce((sum, m) => sum + m.level - 1, 0);
    return r;
  }
}

export const simulate = (options: SimOptions): SimResult => new Simulation(options).run();

/** Average profit (including challenge bonuses) over service days [from, to]. */
export function averageProfit(result: SimResult, from: number, to: number): number {
  const rows = result.rows.filter(r => r.day >= from && r.day <= to);
  return rows.length ? Math.round(rows.reduce((sum, r) => sum + r.profit + r.bonus, 0) / rows.length) : 0;
}

/** First valid tile (reading order) and rotation for a new piece, or null when the floor is full. */
export function findSpot(s: RestaurantState, kind: FurnitureKind): Furniture | null {
  const columns = s.expanded ? 14 : 10;
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
/** Unlock (if needed) a free plot, touching the restaurant when asked, and build there. */
export function buildNear(e: RestaurantEngine, kind: BuildingKind, nextToRestaurant: boolean): string | null {
  const town = e.state.town, touches = (p: Plot) => neighbours(town, p).some(n => n.building === 'restaurant');
  const fits = (p: Plot) => !p.building && touches(p) === nextToRestaurant;
  let plot = town.plots.find(p => p.owned && fits(p));
  if (!plot) { plot = town.plots.find(p => fits(p) && plotLockReason(town, p) === null); if (!plot) return 'No plot'; const error = e.unlockPlot(plot.x, plot.z); if (error) return error; }
  return e.build(plot.x, plot.z, kind);
}
export function upgradeBuilding(e: RestaurantEngine, kind: BuildingKind): string | null {
  const plot = e.state.town.plots.filter(p => p.building === kind && !p.job).sort((a, b) => a.level - b.level)[0];
  return plot ? e.upgrade(plot.x, plot.z) : `No ${kind}`;
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
    const plot = s.town.plots.filter(p => p.building === kind && p.level === 1 && !p.job).pop()!;
    while (plot.level < level) { if (e.upgrade(plot.x, plot.z) !== null) throw new Error('reference upgrade'); finishJobs(); }
  }
  for (let i = 0; i < (mid ? 4 : 1); i++) { const hall = s.town.plots.find(p => p.building === 'restaurant')!; e.upgrade(hall.x, hall.z); finishJobs(); }
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
