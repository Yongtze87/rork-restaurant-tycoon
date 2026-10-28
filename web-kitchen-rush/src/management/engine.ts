import { accessPoints, findPath, inBounds, layoutError, occupied, placementError, seatPoint } from './layout';
import { localDateKey, dateNumber } from './calendar';
import { BOOTH, CATALOG, DAY_LENGTH, DISHES, DISH_IDS, FURNITURE_MAX_LEVEL, MAX_PRICE, MIN_PRICE, SAVE_KEY, capacity, comfort, INGREDIENT_IDS, createRestaurant, entrance, freshDayTotals, freshTotals, furnitureUpgradeCost, guestPatienceSeconds, isSeating, restaurantSchema, staffWage, stationSpeedup, tableTipBonus, width, type Dish, type DishId, type Furniture, type Guest, type Placement, type Point, type RestaurantState, type Role, type Staff } from './types';

import { advanceDailyChallenges, createDailyChallenges, isSpecialGuest, challengeTitle } from './daily-challenges';
import type { CashReceipt } from './cash-feedback';
import { LAST_TUTORIAL_STEP } from './tutorial';
import { ZONES, hasZone, zoneError, type ZoneId } from './zones';
import { TIDES, rollTide, type TideEffects } from './tides';
import { EFFICIENCY_STEP, EFFICIENCY_WINDOW, advise, summarize, type Advice, type Efficiency, type EfficiencySample } from './efficiency';
import { achievement, claimableAchievements, isClaimable, recordDay, recordServed, rewardText, seedCollections } from './collections';
import { HOME_ID, claimGate, claimPrice, fameBonuses, isClaimable as regionClaimable, isClaimed, masteryFame, masteryKey, regionAt, regionById, regionPlotCost, type FameBonuses, type MasteryKind, type Region, type RegionModifiers } from './ocean';
import { BUILDINGS, CHARMS, MAX_BUILDERS, SHOP, maxLevelOf, TOWN_BALANCE, activeLevel, addRegion, addRoads, branchIn, branchIncome, buildingById, buildingPlot, buildingRegion, busyBuilders, completeJobs, ensureRegionPlots, finishCost, grottoSpaceError, isRoad, jobSeconds, lookFor, ownedCount, parcelOf, placementError as sitingError, plotAt, plotLockReason, plotModifiers, plotRegion, plotsIn, roadError, streetTiles, tileKey, townEffects, unlockCost, upgradeCost, widenRestaurant, type Building, type BuildingKind, type CharmKind, type TownEffects } from './town';
import { inHome, regionCenter } from './world';

export const GOALS = [
  { id: 'first-service', title: 'A warm welcome', text: 'Serve your first 5 guests', target: 5, reward: 180, value: (s: RestaurantState) => s.lifetimeServed },
  { id: 'atmosphere', title: 'Make it yours', text: 'Reach 50 atmosphere', target: 50, reward: 150, value: comfort },
  { id: 'more-tables', title: 'Room for everyone', text: 'Build 5 coral tables', target: 5, reward: 250, value: (s: RestaurantState) => capacity(s) / 2 },
  { id: 'three-days', title: 'The reef favorite', text: 'Finish 3 shifts', target: 3, reward: 300, value: (s: RestaurantState) => s.history.length },
];
/** Exact business results computed while the owner was away, not an idle-income estimate. */
export interface AwaySummary { seconds: number; days: number; served: number; cashChange: number; challengeBonus: number; capped: boolean; }
/** Offline service stops after this much time away; construction timers keep running regardless. */
export const OFFLINE_SERVICE_HOURS = 4;
/** While away the crew works at most this many service days; the rest of the time passes without service (keeps real-day pacing, see docs/BALANCE.md). */
export const OFFLINE_SERVICE_DAYS = 1;
/** After the shift worked while away, this much of the next one plays too, so the room is busy on return. */
export const WARM_UP_SECONDS = 150;
/** A dish's price may change on this many shifts a day; each change beyond upsets regulars (−0.05 reputation). */
export const PRICE_CHANGES_PER_DAY = 2;
/** Debt each pearl clears. */
export const DEBT_PER_PEARL = 25;
/** A guest's usual visit, door to door (seconds), and how full a room of average reputation stays: together they set demand per seat. */
export const GUEST_STAY = 38;
export const SEAT_FILL = .9;
/** Seats one server, or one chef at a station, looks after: more seats than the crew can reach draw no extra guests. */
export const SEATS_PER_CREW = 4.5;
/** Guests in the restaurant at once, at most. */
const MAX_GUESTS = 80;
/** Share of what was spent on a town building that demolishing it returns (furniture returns 70%). */
export const DEMOLISH_REFUND = .5;
/** Bargains earn bigger tips, steep prices smaller ones. */
const REACTION_TIP = { bargain: 1.25, fair: 1, pricey: .75 } as const;
/** Small integer hash for season rolls, separate from the guest random stream. */
function hash(a: number, b: number): number {
  let n = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}
export interface StorageAdapter { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const resetStaff = (staff: Staff): void => { staff.task = 'idle'; staff.guestId = null; staff.stationId = null; staff.timer = 0; staff.route = []; };
const seatKey = (g: Pick<Guest, 'tableId' | 'seat'>): string => `${g.tableId}:${g.seat}`;
const usd = (n: number): string => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
/** The restaurant's plot; prices without a plot are home prices. */
const HOME_PLOT = regionCenter(0, 0);
function walk(agent: Point & { route: Point[]; yaw: number }, dt: number, speed: number): boolean {
  let remaining = dt * speed;
  while (agent.route.length && remaining > 0) {
    const next = agent.route[0], dx = next.x - agent.x, dz = next.z - agent.z, length = Math.hypot(dx, dz);
    if (length > .001) agent.yaw = Math.atan2(dx, dz);
    if (length <= remaining) { agent.x = next.x; agent.z = next.z; agent.route.shift(); remaining -= length; }
    else { agent.x += dx / length * remaining; agent.z += dz / length * remaining; remaining = 0; }
  }
  return agent.route.length === 0;
}

/** Independent, deterministic owner simulation. Rendering never owns money or service outcomes. */
export class RestaurantEngine {
  /** Service days replayed while away (OFFLINE_SERVICE_DAYS). Tests comparing long offline replays with live play lift it. */
  static offlineDays = OFFLINE_SERVICE_DAYS;
  state: RestaurantState = createRestaurant();
  get paused(): boolean { return this.state.isPaused; }
  set paused(value: boolean) { this.state.isPaused = value; }
  catchingUp = false;
  catchUpProgress = 0;
  awaySummary: AwaySummary | null = null;
  private backgrounded = false;
  private pauseAfterCatchUp: boolean | null = null;
  private routeCache = new Map<string, Point[]>();
  private routeLayout = '';
  speed: 1 | 2 | 3 = 1;
  saveFailed = false;
  loadWarning = '';
  event = 'Your little reef is ready for its first chapter.';
  /** Bounded, session-only receipts. Money is credited before an event is recorded. */
  incomeReceipts: CashReceipt[] = [];
  private incomeSequence = 0;
  /** Session-only notice of the latest finished construction, for a toast. */
  lastCompletion: { id: number; text: string } | null = null;
  private completionSequence = 0;
  private effects: TownEffects | null = null;
  private effectsKey = ''; private effectsRoads: string[] | null = null;
  private fame: FameBonuses | null = null;
  private fameKey = -1;
  private revision = 0;
  private accumulator = 0;
  private savedAt = 0;
  private rewardSavePending = false;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly storage?: StorageAdapter, private readonly now: () => number = Date.now) {
    try {
      const raw = storage?.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw), result = restaurantSchema.safeParse(parsed);
        if (!result.success) throw new Error('Invalid save');
        const restored = result.data as RestaurantState;
        if (!parsed.collections) seedCollections(restored);
        if (layoutError(restored.furniture, width(restored))) throw new Error('Invalid layout');
        // Regions claimed in the colony build have no plots yet: they load as claimed, empty regions.
        ensureRegionPlots(restored.town, restored.ocean.regions);
        // Grottos bought before the town had tiles: the restaurant takes its extra row when there is room.
        if (restored.expanded && !grottoSpaceError(restored.town)) widenRestaurant(restored.town);
        // Saves from before real calendar days: their per-shift board is dropped; today's board rolls on the next tick.
        if (!parsed.calendar) restored.dailyChallenges = [];
        if (restored.dailyChallenges.some(c => c.day !== restored.calendar.index)) throw new Error('Invalid challenge day');
        this.state = restored;
        // Legacy receipts were already charged: migrate without charging or completing that day twice.
        if (this.state.phase === 'report') { this.beginNextDay(); this.state.lastActiveAt = 0; }
        // Legacy service starts challenges next day, never assigns full-day goals near closing.
        if (this.state.phase === 'service' && this.state.elapsed === 0 && !this.state.dailyChallenges.length) this.startChallenges();
        if (this.state.phase === 'planning') this.rollTide();
        // The restaurant stays open once it has opened: older saves waiting in planning or renovation reopen.
        if (this.state.phase === 'planning' && (this.state.history.length > 0 || this.state.lifetimeServed > 0)) { this.state.renovation = false; this.state.phase = 'service'; this.startChallenges(); }
        this.event = 'Welcome back. Your restaurant story continues.';
      }
    } catch { this.loadWarning = 'The previous save could not be read. A fresh restaurant is shown; save again only when you are ready to replace it.'; this.saveFailed = true; }
  }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = (): number => this.revision;
  notify = (): void => { this.revision++; this.listeners.forEach(listener => listener()); };
  save = (replaceUnreadable = false): boolean => {
    if (this.loadWarning && !replaceUnreadable) return false;
    if (!this.backgrounded && !this.catchingUp) this.state.lastActiveAt = Math.max(this.state.lastActiveAt, this.now());
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this.state)); this.saveFailed = false; this.loadWarning = ''; return true; }
    catch { this.saveFailed = true; return false; }
  };
  private recordIncome(amount: number, source: CashReceipt['source'], guestId: number | null = null, tip = 0): void {
    if (this.catchingUp) return;
    this.incomeReceipts = [...this.incomeReceipts.slice(-11), { id: ++this.incomeSequence, amount, source, guestId, tip, clock: this.state.clock }];
  }
  private changed(message?: string): void { if (message) this.event = message; if (this.catchingUp) return; if (!this.loadWarning) this.save(); this.notify(); }
  pause(value: boolean): void { if (this.catchingUp) { this.pauseAfterCatchUp = value; return; } this.paused = value; this.accumulator = 0; this.changed(); }
  setSpeed(value: 1 | 2 | 3): void { if (this.catchingUp) return; this.speed = value; this.paused = false; this.changed(); }
  /** Save once when leaving; subsequent pagehide/unmount events must not move the offline checkpoint. */
  suspend(): void { if (!this.backgrounded) this.save(); this.backgrounded = true; this.accumulator = 0; }
  dismissAway(): void { this.awaySummary = null; this.notify(); }
  /** Replay elapsed wall time (up to the offline cap) at 1× using the same fixed simulation step, yielding between chunks. */
  async resume(): Promise<void> {
    this.backgrounded = false;
    if (this.catchingUp) return;
    const s = this.state, start = s.lastActiveAt;
    let target = this.now();
    this.dailyGift(target);
    if (!start || target <= start || this.paused || s.phase !== 'service') { this.tickTown(target); this.save(); this.notify(); return; }
    const limit = start + OFFLINE_SERVICE_HOURS * 3_600_000;
    let steps = Math.floor((Math.min(target, limit) - start) / 100);
    if (!steps) return;
    const before = { day: s.day, cash: s.cash, served: s.lifetimeServed, clock: s.clock, challengeBonus: s.lifetimeChallengeBonus };
    this.catchingUp = true; this.catchUpProgress = 0; this.incomeReceipts = []; this.notify();
    let done = 0;
    // Save partial checkpoints so closing the page during recovery never duplicates completed business.
    while (this.state === s && !this.paused && s.phase === 'service') {
      // Include time spent replaying/throttled in the background instead of silently discarding it.
      target = Math.max(target, this.now()); steps = Math.floor((Math.min(target, limit) - start) / 100);
      if (done >= steps || s.day - before.day >= RestaurantEngine.offlineDays) break;
      const end = Math.min(steps, done + 1000);
      for (; done < end && s.phase === 'service' && !this.paused && s.day - before.day < RestaurantEngine.offlineDays; done++) { this.tickTown(start + done * 100); this.step(.1); }
      s.lastActiveAt = start + done * 100;
      this.catchUpProgress = done / steps;
      this.save(); this.notify();
      if (done < steps && s.phase === 'service' && !this.paused && s.day - before.day < RestaurantEngine.offlineDays) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    // The crew works at most one full shift while away, so the replay stops as a fresh shift opens. Play its first
    // minutes too, so the owner comes back to a dining room in full swing rather than an empty one filling up.
    if (this.state === s && s.day - before.day >= RestaurantEngine.offlineDays && s.phase === 'service' && !this.paused) {
      const warm = Math.min(Math.max(0, steps - done), WARM_UP_SECONDS * 10);
      for (let i = 0; i < warm && s.phase === 'service'; i++, done++) { this.tickTown(start + done * 100); this.step(.1); }
      s.lastActiveAt = start + done * 100;
    }
    if (this.state !== s) return;
    this.tickTown(target);
    s.lastActiveAt = Math.max(s.lastActiveAt, target);
    this.awaySummary = s.clock - before.clock >= 1 ? { seconds: Math.round(s.clock - before.clock), days: s.day - before.day, served: s.lifetimeServed - before.served, cashChange: s.cash - before.cash, challengeBonus: s.lifetimeChallengeBonus - before.challengeBonus, capped: target > limit || s.day - before.day >= RestaurantEngine.offlineDays } : null;
    if (this.pauseAfterCatchUp !== null) { this.paused = this.pauseAfterCatchUp; this.pauseAfterCatchUp = null; }
    this.catchUpProgress = 1; this.save(); this.catchingUp = false; this.savedAt = s.clock; this.notify();
  }
  update(dt: number): void {
    if (!this.backgrounded && !this.catchingUp) this.tickTown(this.now());
    if (this.backgrounded || this.catchingUp || this.state.phase !== 'service' || this.paused || !Number.isFinite(dt) || dt <= 0) return;
    this.accumulator += Math.min(dt, .25) * this.speed;
    let changed = false;
    while (this.accumulator >= .1 && this.state.phase === 'service') { this.step(.1); this.accumulator -= .1; changed = true; }
    if (changed) {
      if (this.rewardSavePending || this.state.clock - this.savedAt > 5) { this.savedAt = this.state.clock; this.rewardSavePending = false; if (!this.loadWarning) this.save(); }
      this.notify();
    }
  }
  private random(): number { this.state.seed = (Math.imul(this.state.seed, 1664525) + 1013904223) >>> 0; return this.state.seed / 4294967296; }
  private route(from: Point, to: Point): Point[] | null {
    const layout = `${width(this.state)}:${JSON.stringify(this.state.furniture)}`;
    if (layout !== this.routeLayout) { this.routeLayout = layout; this.routeCache.clear(); }
    const key = `${from.x},${from.z}:${to.x},${to.z}`;
    let path = this.routeCache.get(key);
    if (!path) { const found = findPath(this.state.furniture, width(this.state), from, to); if (!found) return null; path = found; if (this.routeCache.size < 256) this.routeCache.set(key, path); }
    return path.map(point => ({ ...point }));
  }
  /** After a layout change while open, everyone keeps their task and finds a new way to where they were going. */
  private reroute(): void {
    const s = this.state, blocked = occupied(s.furniture), columns = width(s), free = (p: Point) => inBounds(p, columns) && !blocked.has(`${Math.round(p.x)},${Math.round(p.z)}`);
    for (const agent of [...s.guests, ...s.staff]) {
      if (!agent.route.length) continue;
      // Seats and the doorway step sit off the walkable grid: keep them as the last leg.
      let i = agent.route.length - 1; while (i > 0 && !free(agent.route[i])) i--;
      const target = agent.route[i], tail = agent.route.slice(i + 1);
      const path = this.route(agent, target) ?? (Object.assign(agent, { x: entrance.x, z: entrance.z }) && this.route(entrance, target));
      agent.route = path ? [...path, ...tail] : [];
    }
  }
  /** Guests seated at a table (not yet leaving), so the UI can say what moving or selling it does. */
  seatedAt(id: number): number { return this.state.guests.filter(g => g.tableId === id && g.stage !== 'leaving' && g.stage !== 'arriving').length; }
  /** After moving a piece while open: guests at a table sit at its new seats, and whoever works there follows it. */
  private followMove(item: Furniture): void {
    const s = this.state, yaw = Math.PI - item.rotation * Math.PI / 2;
    if (isSeating(item.kind)) for (const g of s.guests) {
      if (g.tableId !== item.id || g.stage === 'leaving') continue;
      const seat = seatPoint(item, g.seat);
      if (g.stage === 'arriving') { const path = this.route(g, accessPoints(item)[g.seat]); g.route = [...(path ?? []), seat]; }
      else Object.assign(g, { x: seat.x, z: seat.z, route: [], yaw });
    }
    for (const m of s.staff) {
      const g = s.guests.find(x => x.id === m.guestId);
      if (isSeating(item.kind)) {
        if (m.task === 'deliver' && g?.tableId === item.id) m.route = this.route(m, accessPoints(item)[g.seat]) ?? [];
        else if (m.task === 'clean' && m.stationId === item.id) m.route = this.route(m, accessPoints(item)[m.guestId ?? 0]) ?? [];
      } else if (m.stationId === item.id) {
        const access = accessPoints(item)[0];
        if (m.task === 'cooking') Object.assign(m, { x: access.x, z: access.z, route: [], yaw });
        else if (m.task === 'toKitchen' || m.task === 'collect') m.route = this.route(m, access) ?? [];
      }
    }
  }
  /** Before selling a piece while open: its seated guests leave (unpaid ones count as missed), and dishes it was making start over. Returns guests sent away. */
  private clearFor(item: Furniture): number {
    const s = this.state; let sent = 0;
    if (isSeating(item.kind)) {
      for (const g of s.guests) if (g.tableId === item.id && g.stage !== 'leaving') { const paid = g.paid || g.stage === 'eating'; this.leave(g, paid); if (!paid) sent++; }
      s.dirty = s.dirty.filter(key => !key.startsWith(`${item.id}:`));
      s.staff.filter(m => m.task === 'clean' && m.stationId === item.id).forEach(resetStaff);
    } else {
      for (const g of s.guests) if (g.stationId === item.id && (g.stage === 'cooking' || g.stage === 'ready')) { g.stage = 'waiting'; g.stationId = null; }
      s.staff.filter(m => m.stationId === item.id && m.task !== 'deliver').forEach(resetStaff);
    }
    return sent;
  }
  private layoutChanged(): void { if (this.state.phase === 'service') this.reroute(); else this.relocateStaff(); }
  private relocateStaff(): void {
    this.state.staff.forEach((staff, i) => {
      resetStaff(staff);
      const candidate = { x: entrance.x + (i % 3) - 1, z: entrance.z - Math.floor(i / 3) };
      const safe = this.route(entrance, candidate) !== null ? candidate : entrance;
      staff.x = safe.x; staff.z = safe.z;
    });
  }
  place(item: Placement): string | null {
    const existing = this.state.furniture.find(f => f.id === item.id);
    if (existing && existing.kind !== item.kind) return 'Move the selected furniture without changing its type.';
    if (!existing && this.state.cash < CATALOG[item.kind].price) return 'Not enough cash. Earn a little more or sell something you no longer need.';
    const error = placementError(this.state, item); if (error) return error;
    if (existing) Object.assign(existing, item, { level: existing.level });
    else { this.state.cash -= CATALOG[item.kind].price; this.state.furniture.push({ ...item, id: this.state.nextId++, level: 1 }); }
    this.layoutChanged(); if (existing && this.state.phase === 'service') this.followMove(existing);
    this.changed(`${CATALOG[item.kind].name} ${existing ? 'moved' : 'built'}. A little more you.`); return null;
  }
  sell(id: number): string | null {
    const item = this.state.furniture.find(f => f.id === id); if (!item) return 'Select a piece of furniture first.';
    if (this.state.furniture.length === 1) return 'Keep at least one piece of furniture.';
    const sent = this.state.phase === 'service' ? this.clearFor(item) : 0;
    this.state.furniture = this.state.furniture.filter(f => f.id !== id); this.state.cash += Math.floor(CATALOG[item.kind].price * .7);
    this.recordIncome(Math.floor(CATALOG[item.kind].price * .7), 'sale');
    this.layoutChanged(); this.changed(`Sold for 70% of the original price.${sent ? ` ${sent} seated ${sent === 1 ? 'guest' : 'guests'} left.` : ''}`); return null;
  }
  /** Instant upgrade of one placed piece, also while open. Selling still refunds 70% of the base price. */
  upgradeFurniture(id: number): string | null {
    const item = this.state.furniture.find(f => f.id === id); if (!item) return 'Select a piece of furniture first.';
    if (item.level >= FURNITURE_MAX_LEVEL) return 'Already at the highest level.';
    const cost = furnitureUpgradeCost(item.kind, item.level + 1); if (this.state.cash < cost) return `This upgrade costs $${cost}.`;
    this.state.cash -= cost; item.level++; this.state.collections.bestFurniture = Math.max(this.state.collections.bestFurniture, item.level);
    this.changed(`${CATALOG[item.kind].name} is now level ${item.level}.${lookFor(item.level) > lookFor(item.level - 1) ? ' A whole new look!' : ''}`); return null;
  }
  hire(role: Role): string | null {
    if (this.state.staff.length >= this.crewLimit()) return `Your crew is limited to ${this.crewLimit()} Mareen. Build Mareen homes for more.`;
    if (this.state.cash < 150) return 'Recruitment costs $150.';
    const names = role === 'chef' ? ['Marlo', 'Nerin', 'Coralie', 'Kai', 'Delphine', 'Ondine'] : ['Pearl', 'Tidus', 'Maris', 'Shelly', 'Reef', 'Calyx'];
    const name = names.find(n => !this.state.staff.some(s => s.name === n)) ?? names[0];
    this.state.cash -= 150; this.state.staff.push({ id: this.state.nextId++, name, role, level: 1, ...entrance, yaw: 0, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 });
    this.changed(`${name} joined your team. Welcome aboard!`); return null;
  }
  train(id: number): string | null {
    const staff = this.state.staff.find(s => s.id === id);
    if (!staff) return 'Choose a crew member first.';
    if (staff.level === 3) return 'Already fully trained.';
    const cost = 180 * staff.level; if (this.state.cash < cost) return `Training costs $${cost}.`;
    this.state.cash -= cost; staff.level++; this.changed(`${staff.name} is now level ${staff.level}. Faster service, happier guests.`); return null;
  }
  dismiss(id: number): string | null {
    const member = this.state.staff.find(s => s.id === id);
    if (!member) return 'Choose a crew member first.';
    if (member.task !== 'idle') return `${member.name} is busy. Try again in a moment.`;
    if (this.state.staff.filter(s => s.role === member.role).length <= 1) return 'Keep at least one chef and one server.';
    this.state.staff = this.state.staff.filter(s => s.id !== id); this.changed(`${member.name} has left the team.`); return null;
  }
  setDish(dish: Dish, enabled: boolean, price: number): string | null {
    const zone = DISHES[dish].zone;
    if (!hasZone(this.state.town, zone)) return `Reach ${ZONES[zone].place} to cook ${DISHES[dish].name.toLowerCase()}.`;
    if (!enabled && !Object.entries(this.state.menu).some(([key, value]) => key !== dish && value.enabled)) return 'Keep at least one dish on the menu.';
    const next = Math.max(MIN_PRICE, Math.min(MAX_PRICE, Math.round(price)));
    if (next !== this.state.menu[dish].price && this.state.pricing.auto) { this.state.pricing.auto = false; this.event = 'Auto price is off: you set prices yourself now.'; }
    this.state.menu[dish] = { enabled, price: next }; this.changed(); return null;
  }
  /** Auto price: off-season dishes at the suggested price, in-season ones a little above it. Never the best price, never a bad one. */
  setAutoPrice(on: boolean): void { this.state.pricing.auto = on; if (on) this.applyAutoPrices(); this.changed(on ? 'Auto price is on.' : 'Auto price is off.'); }
  private applyAutoPrices(): void {
    for (const dish of DISH_IDS) {
      const price = Math.max(MIN_PRICE, Math.min(MAX_PRICE, Math.round(DISHES[dish].fair * (this.inSeason(dish) ? 1.05 : 1))));
      this.state.menu[dish].price = price; this.state.pricing.last[dish] = price;
    }
  }
  inSeason(dish: DishId): boolean { return this.state.season?.group === DISHES[dish].ingredient; }
  /** What guests expect to pay today: the suggested price, stretched in season by a hidden amount. */
  fairPrice(dish: DishId): number { const season = this.state.season; return DISHES[dish].fair * (season && this.inSeason(dish) ? 1 + season.stretch * (DISHES[dish].stretch ?? 1) : 1); }
  /** How strongly guests lean towards a dish: its appeal, its season and its price against what they expect. */
  private demand(dish: DishId): number {
    const fair = this.fairPrice(dish), price = this.state.menu[dish].price;
    return (DISHES[dish].appeal ?? 1) * (this.inSeason(dish) ? 2 : 1) * Math.max(.5, Math.min(1.6, 1 + (fair - price) / fair * 1.5));
  }
  private note(dish: DishId, kind: 'sold' | 'walked'): void {
    const season = this.state.season; if (!season || !this.inSeason(dish)) return;
    const notes = season.notes[dish] ?? (season.notes[dish] = { sold: 0, walked: 0 }); notes[kind]++;
  }
  /** A new season every two or three real days, for a different ingredient group, with a hidden price stretch. */
  private startSeason(): void {
    const s = this.state, index = s.calendar.index, h = hash(s.seed, index), others = INGREDIENT_IDS.filter(g => g !== s.season?.group);
    s.season = { group: others[h % others.length] ?? INGREDIENT_IDS[0], start: index, length: 2 + hash(h, 1) % 2, stretch: Math.round((.05 + (hash(h, 2) % 1000) / 1000 * .3) * 100) / 100, notes: {} };
    if (s.pricing.auto) this.applyAutoPrices();
  }
  private checkSeason(): void { const s = this.state; if (!s.season || s.calendar.index >= s.season.start + s.season.length) this.startSeason(); }
  /** Season days left, including today, and a loose hint at the hidden stretch. */
  seasonInfo(): { daysLeft: number; hint: 'strong' | 'mild' } | null {
    const season = this.state.season; if (!season) return null;
    return { daysLeft: Math.max(1, season.start + season.length - this.state.calendar.index), hint: season.stretch >= .2 ? 'strong' : 'mild' };
  }
  expand(): string | null {
    if (this.state.expanded) return 'Your east grotto is already open.';
    if (this.state.history.length < 3) return 'Finish 3 shifts to unlock the east grotto.';
    if (this.state.cash < 900) return 'The east grotto costs $900.';
    const space = grottoSpaceError(this.state.town); if (space) return space;
    const lifted = widenRestaurant(this.state.town);
    this.state.cash -= 900; this.state.expanded = true; this.changed(`The east grotto is yours. Forty new tiles and room for VIP booths; your restaurant in town grew by a row${lifted ? ` (${lifted} road tiles made way)` : ''}.`); return null;
  }
  claim(id: string): string | null {
    const goal = GOALS.find(g => g.id === id);
    if (!goal || this.state.claimed.includes(id) || goal.value(this.state) < goal.target) return 'Complete this milestone first.';
    this.state.claimed.push(id); this.state.cash += goal.reward; this.state.town.charms.tide++; this.state.town.pearls += 5;
    this.recordIncome(goal.reward, 'milestone'); this.changed(`Milestone complete: ${goal.title}. +$${goal.reward}, a Tide charm and 5 pearls.`); return null;
  }
  /** Collect a finished achievement's pearls (and charms). Each pays out once. */
  claimAchievement(id: string): string | null {
    const goal = achievement(id); if (!goal) return 'Choose an achievement first.';
    if (this.state.collections.claimed.includes(id)) return 'You already collected this reward.';
    if (!isClaimable(this.state, goal)) return 'Complete this achievement first.';
    this.state.collections.claimed.push(id); this.state.town.pearls += goal.reward.pearls; this.state.town.charms.tide += goal.reward.tideCharms;
    this.changed(`Achievement: ${goal.title}. +${rewardText(goal.reward)}.`); return null;
  }
  /** Milestones and achievements ready to collect, for the Ledger badge. */
  rewardsReady(): number { return GOALS.filter(g => !this.state.claimed.includes(g.id) && g.value(this.state) >= g.target).length + claimableAchievements(this.state).length; }
  loan(): string | null {
    if (this.state.cash >= 200 || this.state.debt > 0) return 'A $600 recovery loan is available below $200, with no existing loan.';
    this.state.cash += 600; this.state.debt = 600; this.recordIncome(600, 'loan'); this.changed('Recovery loan received. $30 is repaid after each day, with no interest.'); return null;
  }
  /** Pearls that clear the whole debt (or all the player's pearls, if fewer), and the dollars they clear. */
  debtPearls(): { pearls: number; amount: number } {
    const debt = this.state.debt, pearls = Math.min(this.state.town.pearls, Math.ceil(debt / DEBT_PER_PEARL));
    return { pearls, amount: Math.min(debt, pearls * DEBT_PER_PEARL) };
  }
  /** Pay debt with pearls: each pearl clears $25. */
  payDebtWithPearls(): string | null {
    if (this.state.debt <= 0) return 'You have no debt.';
    const { pearls, amount } = this.debtPearls(); if (pearls < 1) return `Each pearl clears $${DEBT_PER_PEARL} of debt. You have no pearls.`;
    this.state.town.pearls -= pearls; this.state.debt = Math.round((this.state.debt - amount) * 100) / 100;
    this.changed(`${pearls} ${pearls === 1 ? 'pearl' : 'pearls'} cleared ${usd(amount)} of debt.${this.state.debt > 0 ? ` ${usd(this.state.debt)} left.` : ' You are debt free.'}`); return null;
  }
  /** What demolishing a town building returns: half of what was spent on it (its build and upgrades, in its region's prices). */
  demolishRefund(id: number): number {
    const b = buildingById(this.state.town, id); if (!b || b.kind === 'restaurant') return 0;
    const p = buildingPlot(b), paidTo = b.level + (b.job?.kind === 'upgrade' ? 1 : 0);
    let spent = this.buildPrice(b.kind, p.x, p.z); for (let level = 2; level <= paidTo; level++) spent += this.upgradePrice(b.kind, level, p.x, p.z);
    return Math.round(spent * DEMOLISH_REFUND);
  }
  /** Demolish a town building for half of what was spent on it. The restaurant stays. */
  demolish(id: number): string | null {
    const town = this.state.town, b = buildingById(town, id); if (!b) return 'Choose a building first.';
    if (b.kind === 'restaurant') return 'Your restaurant stays.';
    const refund = this.demolishRefund(id); town.buildings = town.buildings.filter(x => x.id !== id);
    this.state.cash += refund; this.recordIncome(refund, 'sale');
    this.changed(`${BUILDINGS[b.kind].name} demolished. ${usd(refund)} back.`); return null;
  }
  rename(name: string): void { this.state.name = name.trim().slice(0, 28) || 'Little Reef'; this.changed(); }
  setMusic(value: boolean): void { this.state.music = value; this.changed(); }
  /** Skip or finish the guided tutorial. */
  welcome(): void { this.state.welcomed = true; this.state.tutorial = { ...this.state.tutorial, done: true }; this.changed(); }
  /** Save tutorial progress; it only moves forward, and moving past the last step finishes it. */
  tutorialTo(step: number): void {
    const tutorial = this.state.tutorial; if (tutorial.done || step <= tutorial.step) return;
    if (step > LAST_TUTORIAL_STEP) { this.welcome(); return; }
    tutorial.step = step; this.changed();
  }
  reset(): void { this.rewardSavePending = false; this.pauseAfterCatchUp = null; this.catchingUp = false; this.backgrounded = false; this.awaySummary = null; this.speed = 1; this.incomeReceipts = []; this.samples = []; this.lost = []; this.lastMissed = { missed: 0, full: 0 }; this.state = createRestaurant(); this.paused = false; this.accumulator = 0; this.savedAt = 0; this.loadWarning = ''; this.changed('A fresh beginning. Make this reef your own.'); }
  readiness(): string[] {
    const errors: string[] = [];
    if (!capacity(this.state)) errors.push('Build at least one coral table.');
    for (const dish of DISH_IDS) if (this.state.menu[dish].enabled && !this.state.furniture.some(f => f.kind === DISHES[dish].station)) errors.push(`Add a ${DISHES[dish].station === 'prep' ? 'kelp counter' : 'vent grill'} for ${DISHES[dish].name.toLowerCase()}, or remove it from the menu.`);
    if (this.state.cash < this.operatingCost() + 30) errors.push(`Keep $${this.operatingCost() + 30} for wages, rent and starting ingredients.`);
    const layout = layoutError(this.state.furniture, width(this.state)); if (layout) errors.push(layout);
    return errors;
  }
  operatingCost(): number { return this.state.staff.reduce((sum, staff) => sum + staffWage(staff), 0) + (this.state.expanded ? 50 : 30); }
  /** Cash that can be spent while still affording the next opening (wages, rent and $30 of starting ingredients). */
  safeToSpend(): number { return Math.max(0, this.state.cash - this.billsTonight() - 30); }
  /** Wages, rent and the day's loan repayment, paid at closing. */
  billsTonight(): number { return this.operatingCost() + Math.min(30, this.state.debt); }
  /** What a purchase leaves against the next opening; `extraDaily` is a new daily cost it adds, like a wage. */
  spendCheck(cost: number, extraDaily = 0): { after: number; reserve: number } { return { after: this.state.cash - cost, reserve: this.billsTonight() + extraDaily + 30 }; }
  open(): string | null {
    if (this.state.phase !== 'planning') return 'The restaurant is already open.';
    const errors = this.readiness(); if (errors.length) return errors[0];
    Object.assign(this.state, { phase: 'service', renovation: false, elapsed: 0, nextArrival: 1, totals: freshTotals(), guests: [], dirty: [] });
    this.rollTide(); this.startChallenges(); this.relocateStaff(); this.paused = false; this.accumulator = 0; this.changed('Doors open. Your team has it from here.'); return null;
  }
  private startChallenges(): void {
    if (this.state.dailyChallenges.length) return;
    this.state.dailyChallenges = createDailyChallenges(this.state);
  }
  /** Today's tide: a pure hash of seed and day, so rolling again before service starts gives the same tide. */
  private rollTide(): void { this.state.tide = rollTide(this.state.seed, this.state.calendar.index); }
  tideEffects(): TideEffects { return TIDES[this.state.tide].effects; }
  private beginNextDay(): void {
    this.state.day++; this.state.phase = 'service'; this.state.guests = []; this.state.dirty = []; this.state.elapsed = 0; this.state.nextArrival = 1; this.state.totals = freshTotals(); this.relocateStaff();
    this.state.renovation = false; this.incomeReceipts = [];
    this.startChallenges(); this.event = 'A new shift begins.';
  }
  /** Compatibility for older receipts; normal service rolls forward automatically. */
  nextDay(): void { if (this.state.phase === 'report') { this.beginNextDay(); this.changed(); } }
  private arrive(): void {
    const s = this.state;
    if (s.guests.length >= MAX_GUESTS) return;
    let selected: { table: Furniture; seat: number } | undefined;
    // VIP booths fill first.
    for (const table of s.furniture.filter(f => f.kind === 'booth').concat(s.furniture.filter(f => f.kind === 'table'))) for (let seat = 0; seat < 2; seat++) {
      if (!selected && !s.dirty.includes(`${table.id}:${seat}`) && !s.guests.some(g => g.tableId === table.id && g.seat === seat && g.stage !== 'leaving')) selected = { table, seat };
    }
    if (!selected) { s.totals.missed++; s.totals.full++; this.event = 'Every seat is taken: a guest was turned away. More tables would seat them.'; return; }
    const dishes = DISH_IDS.filter(dish => s.menu[dish].enabled && s.furniture.some(f => f.kind === DISHES[dish].station));
    if (!dishes.length) { s.totals.missed++; this.event = 'A guest found nothing on the menu your kitchen can make.'; return; }
    // Guests lean towards popular, in-season and well-priced dishes.
    const weights = dishes.map(d => this.demand(d)); let pick = this.random() * weights.reduce((sum, w) => sum + w, 0), dish = dishes[dishes.length - 1];
    for (let i = 0; i < dishes.length; i++) { pick -= weights[i]; if (pick < 0) { dish = dishes[i]; break; } }
    const price = s.menu[dish].price, fair = this.fairPrice(dish);
    if (this.random() < Math.max(0, (price / fair - 1) * .7)) { s.totals.missed++; this.note(dish, 'walked'); this.event = `A guest found the ${DISHES[dish].name.toLowerCase()} too pricey.`; return; }
    const reaction = price <= fair * .9 ? 'bargain' : price > fair * 1.02 ? 'pricey' : 'fair';
    const route = this.route(entrance, accessPoints(selected.table)[selected.seat]); if (!route) return;
    route.push(seatPoint(selected.table, selected.seat));
    const special = isSpecialGuest(s.day, s.nextId);
    s.guests.push({ id: s.nextId++, special, ...entrance, yaw: Math.PI, route, look: (['coral', 'pearl', 'lagoon', 'dusk'] as const)[Math.floor(this.random() * 4)], tableId: selected.table.id, seat: selected.seat, dish, price, reaction, stage: 'arriving', waiting: 0, timer: 0, happy: false, stationId: null, paid: false });
  }
  private leave(guest: Guest, happy: boolean): void {
    const table = this.state.furniture.find(f => f.id === guest.tableId); if (!table) return;
    const access = accessPoints(table)[guest.seat];
    guest.stage = 'leaving'; guest.happy = happy; guest.timer = Math.max(0, guest.timer);
    guest.route = [access, ...(this.route(access, entrance) ?? []), { x: entrance.x, z: entrance.z + 1 }];
    if (!happy) {
      this.state.totals.missed++; this.event = 'A guest waited too long. Another chef or server could help.';
      this.state.staff.filter(s => s.guestId === guest.id).forEach(resetStaff);
    }
  }
  private assignJobs(): void {
    const s = this.state;
    for (const member of s.staff) {
      if (member.task !== 'idle') continue;
      if (member.role === 'chef') {
        for (const guest of s.guests.filter(g => g.stage === 'waiting')) {
          const station = s.furniture.find(f => f.kind === DISHES[guest.dish].station && !s.staff.some(worker => worker.stationId === f.id && worker.role === 'chef' && worker.task !== 'idle'));
          const due = s.ingredientCarry + this.dishCost(guest.dish), cost = Math.floor(due + 1e-9);
          if (!station) continue;
          const route = this.route(member, accessPoints(station)[0]); if (!route) continue;
          guest.stage = 'cooking'; guest.stationId = station.id; member.guestId = guest.id; member.stationId = station.id; member.task = 'toKitchen'; member.route = route;
          s.cash -= cost; s.totals.ingredients += cost; s.ingredientCarry = Math.max(0, Math.min(1, due - cost)); break;
        }
      } else {
        const guest = s.guests.find(g => g.stage === 'ready');
        if (guest) {
          const station = s.furniture.find(f => f.id === guest.stationId);
          const route = station ? this.route(member, accessPoints(station)[0]) : null;
          if (route) { guest.stage = 'delivering'; member.guestId = guest.id; member.stationId = station?.id ?? null; member.task = 'collect'; member.route = route; continue; }
        }
        const dirty = s.dirty.find(key => !s.staff.some(worker => worker.task === 'clean' && `${worker.stationId}:${worker.guestId}` === key));
        if (dirty) {
          const [id, seat] = dirty.split(':').map(Number), table = s.furniture.find(f => f.id === id);
          const route = table ? this.route(member, accessPoints(table)[seat]) : null;
          if (route) { member.task = 'clean'; member.stationId = id; member.guestId = seat; member.route = route; member.timer = 2.5; }
        }
      }
    }
  }
  /** The last minute of service, sampled for the efficiency readout (session only, not saved). */
  private samples: EfficiencySample[] = []; private sampleClock = 0; private lost: { at: number; full: boolean }[] = []; private lastMissed = { missed: 0, full: 0 };
  private sample(dt: number): void {
    const s = this.state; this.sampleClock += dt;
    // Losses since the last step: turned away by a full room, or left upset.
    const t = s.totals; if (t.missed < this.lastMissed.missed) this.lastMissed = { missed: 0, full: 0 };
    const full = t.full - this.lastMissed.full, upset = t.missed - this.lastMissed.missed - full;
    for (let i = 0; i < full; i++) this.lost.push({ at: s.clock, full: true }); for (let i = 0; i < upset; i++) this.lost.push({ at: s.clock, full: false });
    this.lastMissed = { missed: t.missed, full: t.full };
    if (this.sampleClock < EFFICIENCY_STEP) return; this.sampleClock = 0;
    const chefs = s.staff.filter(m => m.role === 'chef'), servers = s.staff.filter(m => m.role === 'server'), seats = capacity(s);
    const busy = (list: Staff[]) => list.length ? list.filter(m => m.task !== 'idle').length / list.length : 0;
    this.samples.push({ chefs: busy(chefs), servers: busy(servers), seats: seats ? Math.min(1, (s.guests.filter(g => g.stage !== 'arriving' && g.stage !== 'leaving').length + s.dirty.length) / seats) : 0, waiting: s.guests.filter(g => g.stage === 'waiting').length, ready: s.guests.filter(g => g.stage === 'ready').length, dirty: s.dirty.length });
    if (this.samples.length > EFFICIENCY_WINDOW / EFFICIENCY_STEP) this.samples.shift();
    this.lost = this.lost.filter(l => l.at > s.clock - EFFICIENCY_WINDOW);
  }
  /** How the dining room kept up over the last minute, and the one change most likely to help. */
  efficiency(): Efficiency & { advice: Advice } {
    const s = this.state, e = summarize(this.samples, this.lost.filter(l => l.full).length, this.lost.filter(l => !l.full).length);
    const stations = s.furniture.filter(f => f.kind === 'prep' || f.kind === 'grill').length, chefs = s.staff.filter(m => m.role === 'chef').length;
    return { ...e, advice: advise(e, { crewFull: s.staff.length >= this.crewLimit(), stationsShort: chefs >= stations, limitBy: this.seatLimit().by }) };
  }
  private step(dt: number): void {
    const s = this.state; s.clock += dt; s.elapsed += dt;
    if (s.elapsed < DAY_LENGTH) this.sample(dt);
    if (s.elapsed < DAY_LENGTH && s.elapsed >= s.nextArrival) { this.arrive(); s.nextArrival = s.elapsed + this.arrivalGap(); }
    for (const guest of s.guests) {
      if (guest.stage === 'arriving' && walk(guest, dt, 1.7)) {
        guest.stage = 'waiting'; const table = s.furniture.find(f => f.id === guest.tableId); guest.yaw = Math.PI - (table?.rotation ?? 0) * Math.PI / 2;
      } else if (guest.stage === 'leaving') walk(guest, dt, 1.8);
      else if (guest.stage === 'eating') {
        guest.timer -= dt;
        if (guest.timer <= 0) { s.dirty.push(seatKey(guest)); this.leave(guest, true); }
      } else if (['waiting', 'cooking', 'ready', 'delivering'].includes(guest.stage)) {
        guest.waiting += dt; if (guest.waiting > guestPatienceSeconds(s, this.tideEffects().patience)) this.leave(guest, false);
      }
    }
    s.guests = s.guests.filter(g => g.stage !== 'leaving' || g.route.length > 0);
    this.assignJobs();
    for (const staff of s.staff) {
      if (staff.task === 'idle') continue;
      const pace = this.townEffects().crewSpeed * this.tideEffects().crewSpeed;
      if (!walk(staff, dt, (2 + (staff.level - 1) * .4) * pace)) continue;
      if (staff.task === 'clean') {
        staff.timer -= dt * pace / (1 - (staff.level - 1) * .17);
        if (staff.timer <= 0) { s.dirty = s.dirty.filter(key => key !== `${staff.stationId}:${staff.guestId}`); resetStaff(staff); }
        continue;
      }
      const guest = s.guests.find(g => g.id === staff.guestId);
      if (!guest || guest.stage === 'leaving') { resetStaff(staff); continue; }
      if (staff.task === 'toKitchen') {
        const station = s.furniture.find(f => f.id === staff.stationId);
        staff.task = 'cooking'; staff.timer = DISHES[guest.dish].seconds * (1 - (staff.level - 1) * .2) * (1 - stationSpeedup(station?.level ?? 1)); staff.yaw = Math.PI - (station?.rotation ?? 0) * Math.PI / 2;
      } else if (staff.task === 'cooking') { staff.timer -= dt * pace; if (staff.timer <= 0) { guest.stage = 'ready'; resetStaff(staff); } }
      else if (staff.task === 'collect') {
        const table = s.furniture.find(f => f.id === guest.tableId), route = table ? this.route(staff, accessPoints(table)[guest.seat]) : null;
        if (route) { staff.route = route; staff.task = 'deliver'; }
      } else if (staff.task === 'deliver') {
        guest.stage = 'eating'; guest.timer = 10; guest.happy = true;
        if (!guest.paid) {
          const table = s.furniture.find(f => f.id === guest.tableId), vip = table?.kind === 'booth', price = vip ? Math.round(guest.price * BOOTH.price) : guest.price;
          const tip = Math.max(0, Math.round(price * (.04 + comfort(s) * .001 + tableTipBonus(table?.level ?? 1) + (vip ? BOOTH.tip : 0) + this.fameBonuses().tips) * Math.max(.15, 1 - guest.waiting / 60) * this.tideEffects().tips * REACTION_TIP[guest.reaction]));
          const earned = price + tip; s.cash += earned; s.totals.revenue += price; s.totals.tips += tip; s.totals.served++; s.lifetimeServed++; recordServed(s.collections, guest.dish);
          if (this.inSeason(guest.dish)) { this.note(guest.dish, 'sold'); const group = DISHES[guest.dish].ingredient; s.collections.seasonSold[group] = (s.collections.seasonSold[group] ?? 0) + 1; } guest.paid = true;
          this.recordIncome(earned, 'service', guest.id, tip);
          this.event = `${DISHES[guest.dish].name} served. +$${earned}${tip ? ` including $${tip} tip` : ''}`;
          for (const challenge of advanceDailyChallenges(s.dailyChallenges, { ...guest, price }, tip)) {
            s.cash += challenge.reward; s.lifetimeChallengeBonus += challenge.reward;
            this.recordIncome(challenge.reward, 'challenge');
            this.event = `Daily challenge complete: ${challengeTitle(challenge)}. +$${challenge.reward} automatically added.`;
            if (!this.catchingUp) this.rewardSavePending = true;
            if (s.dailyChallenges.length === 3 && s.dailyChallenges.every(c => c.rewarded)) { s.town.charms.current++; s.town.pearls++; this.event = 'All three daily challenges done: a Current charm and a pearl are yours.'; }
          }
        }
        resetStaff(staff);
      }
    }
    if (s.elapsed >= DAY_LENGTH && (s.guests.length === 0 && s.dirty.length === 0 || s.elapsed >= DAY_LENGTH + 90)) this.finish();
  }
  /**
   * Seconds until the next guest. Demand follows the dining room: each seat the crew can look after draws guests often
   * enough to keep it about 90% full at an average reputation, so more tables (with the crew to serve them) bring more
   * guests. Reputation, town buildings, the tide and fame raise demand beyond that; guests who then find every seat
   * taken are turned away (no reputation lost).
   */
  arrivalGap(): number {
    const s = this.state, seats = Math.max(2, this.servableSeats());
    const appeal = (.7 + s.reputation * .1) * (1 + this.townEffects().arrivalBonus) * this.tideEffects().arrival * (1 + this.fameBonuses().arrival);
    return GUEST_STAY / (seats * SEAT_FILL) / appeal * (.8 + this.random() * .4);
  }
  /** Seats the dining room can fill well: its seats, or what its servers and working chefs (one per station) can look after, whichever is fewer. */
  servableSeats(): number { return this.seatLimit().servable; }
  /** What caps the guests the room draws: its seats, its servers, its chefs, or its kitchen stations. */
  seatLimit(): { servable: number; seats: number; by: 'seats' | 'servers' | 'chefs' | 'stations' } {
    const s = this.state, seats = capacity(s), servers = s.staff.filter(m => m.role === 'server').length, chefs = s.staff.filter(m => m.role === 'chef').length;
    const stations = s.furniture.filter(f => f.kind === 'prep' || f.kind === 'grill').length, cooks = Math.min(chefs, stations);
    const bySeats = seats, byServers = Math.max(1, servers) * SEATS_PER_CREW, byCooks = Math.max(1, cooks) * SEATS_PER_CREW, servable = Math.min(bySeats, byServers, byCooks);
    return { servable, seats, by: servable === bySeats ? 'seats' : servable === byServers ? 'servers' : chefs <= stations ? 'chefs' : 'stations' };
  }
  /** Town effects, cached until a building changes. */
  townEffects(): TownEffects {
    const town = this.state.town; let key = town.zones.join(); for (const b of town.buildings) key += `|${b.x},${b.z},${b.turned ? 1 : 0}${b.wide ? 'w' : ''},${b.kind},${b.level},${b.job?.kind ?? ''}`;
    if (!this.effects || key !== this.effectsKey || town.roads !== this.effectsRoads) { this.effects = townEffects(town); this.effectsKey = key; this.effectsRoads = town.roads; }
    return this.effects;
  }
  crewLimit(): number { return 6 + this.townEffects().extraCrew; }
  /** Exact ingredient cost per dish, to the cent; charges carry the fraction so every discount counts. */
  dishCost(dish: Dish): number { const kelp = DISHES[dish].ingredient === 'kelp', town = this.townEffects(), tide = this.tideEffects(); return Math.max(1, Math.round(DISHES[dish].cost * (kelp ? town.kelpCost * tide.kelpCost : town.fishCost * tide.fishCost) * 100) / 100); }
  /** Permanent fame bonuses (capped), cached until fame changes. */
  fameBonuses(): FameBonuses {
    if (!this.fame || this.fameKey !== this.state.ocean.fame) { this.fame = fameBonuses(this.state.ocean.fame); this.fameKey = this.state.ocean.fame; }
    return this.fame;
  }
  /** What the region a plot stands in does to its plots, buildings and branch (neutral in the Home Reef). */
  regionModifiers(x: number, z: number): RegionModifiers { return plotModifiers({ x, z }); }
  /** A price in the world: base × the plot's region build cost × the fame discount, to $10. */
  private scaled(base: number, x = HOME_PLOT.x, z = HOME_PLOT.z): number { const k = this.regionModifiers(x, z).buildCost * (1 - this.fameBonuses().build); return k === 1 || base === 0 ? base : Math.max(10, Math.round(base * k / 10) * 10); }
  /** The next plot's price in the region of (x, z); home plots by default. */
  plotPrice(x = HOME_PLOT.x, z = HOME_PLOT.z): number {
    if (inHome({ x, z })) return this.scaled(unlockCost(this.state.town));
    const id = plotRegion({ x, z }); return this.scaled(regionPlotCost(regionById(id)!, ownedCount(this.state.town, id)), x, z);
  }
  buildPrice(kind: BuildingKind, x = HOME_PLOT.x, z = HOME_PLOT.z): number { return this.scaled(BUILDINGS[kind].buildCost, x, z); }
  upgradePrice(kind: BuildingKind, nextLevel: number, x = HOME_PLOT.x, z = HOME_PLOT.z): number { return this.scaled(upgradeCost(kind, nextLevel), x, z); }
  zonePrice(id: ZoneId): number { return this.scaled(ZONES[id].price); }
  /** Real seconds for a job on a plot: workshops and the region's build time applied. */
  jobSeconds(kind: BuildingKind, nextLevel: number, x = HOME_PLOT.x, z = HOME_PLOT.z): number { return jobSeconds(this.state.town, kind, nextLevel, this.regionModifiers(x, z).buildTime); }
  /** What a branch earns per service day at a level (its current, finished level by default). */
  branchIncomeAt(branch: Pick<Building, 'x' | 'z' | 'level' | 'job'>, level?: number): number {
    const p = buildingPlot(branch);
    return branchIncome(level ?? activeLevel(branch), this.regionModifiers(p.x, p.z).branchIncome, this.fameBonuses().branch);
  }
  /** Every finished branch's earnings for one service day. */
  branchTotal(): number { return this.state.town.buildings.reduce((sum, b) => b.kind === 'branch' ? sum + this.branchIncomeAt(b) : sum, 0); }
  /** One road tile's price on the plot holding (x, z). */
  roadPrice(x: number, z: number): number { const p = parcelOf(x, z); return this.scaled(TOWN_BALANCE.road, p.x, p.z); }
  /** The street tiles a plot still needs (its last row and column, where nothing stands), and their price. */
  streetsFor(px: number, pz: number): { tiles: string[]; price: number } {
    const town = this.state.town, tiles = streetTiles(px, pz).filter(k => { const [x, z] = k.split(',').map(Number); return roadError(town, x, z) === null; });
    return { tiles, price: tiles.length * this.scaled(TOWN_BALANCE.road, px, pz) };
  }
  /** A region's claim price now: grows with distance, difficulty and the regions already claimed; fame discount applied. */
  claimPrice(id: string): number { const region = regionById(id); return region ? this.scaled(claimPrice(region, this.state.ocean.regions.length)) : 0; }
  /** Why a region can't be claimed now, or null. */
  claimError(id: string): string | null {
    const region = regionById(id); if (!region) return 'Choose a region first.';
    if (isClaimed(this.state.ocean, id)) return `${region.name} is already yours.`;
    if (!regionClaimable(this.state.ocean, id)) return 'Claim a region next to this one first.';
    const gate = claimGate(region.ring); if (!hasZone(this.state.town, gate)) return `Reach ${ZONES[gate].place} at home to claim regions this far out.`;
    const price = this.claimPrice(id); if (this.state.cash < price) return `Claiming ${region.name} costs ${usd(price)}.`;
    return this.reserveError(price);
  }
  /** Claim a region next to your world: its plots appear in place, with the middle plot owned. Everything built stays. */
  claimRegion(id: string): string | null {
    const error = this.claimError(id); if (error) return error;
    const region = regionById(id)!, price = this.claimPrice(id);
    this.state.cash -= price; this.state.ocean.regions.push(id); addRegion(this.state.town, id);
    const fame = this.checkMastery();
    this.changed(`${region.name} is yours${fame ? ` (+${fame} fame)` : ''}. Unlock plots and build a branch restaurant there.`); return null;
  }
  /** Reward every mastery milestone reached and not yet rewarded. Fame is never taken back. Returns the fame added. */
  private checkMastery(): number {
    const o = this.state.ocean, town = this.state.town; let gained = 0;
    const award = (region: Region, kind: MasteryKind) => { const key = masteryKey(region.id, kind); if (o.mastery.includes(key)) return; o.mastery.push(key); const fame = masteryFame(region, kind); o.fame += fame; gained += fame; };
    if (hasZone(town, 'abyss')) award(regionAt(0, 0), 'abyss');
    for (const id of o.regions) {
      const region = regionById(id)!, plots = plotsIn(town, id), branch = branchIn(town, id), level = branch ? activeLevel(branch) : 0;
      award(region, 'claim');
      if (level >= 6) award(region, 'branch6');
      if (level >= 11) award(region, 'branch11');
      if (plots.length && plots.every(p => p.owned)) award(region, 'full');
    }
    return gained;
  }
  /** Finish construction whose end time has passed (wall-clock time, also while away). */
  /** Real-day rollover at local midnight: archive the day, roll its tide and a fresh challenge board. A clock set back changes nothing. */
  private rollCalendar(at: number): void {
    const s = this.state, c = s.calendar, key = localDateKey(at);
    if (c.date === key) { if (!s.season) this.checkSeason(); return; }
    if (!c.date) { Object.assign(c, { date: key, start: key, index: 1 }); this.checkSeason(); if (s.phase === 'service') this.startChallenges(); return; }
    if (dateNumber(key) < dateNumber(c.date)) return;
    if (c.totals.shifts > 0 || s.dailyChallenges.length) {
      const t = c.totals;
      s.days = [...s.days, { revenue: t.revenue, tips: t.tips, ingredients: t.ingredients, served: t.served, missed: t.missed, full: t.full, wages: t.wages, rent: t.rent, debtPayment: t.debtPayment, branch: t.branch, profit: t.profit, shifts: t.shifts, rating: t.shifts ? Math.round(t.ratingSum / t.shifts * 100) / 100 : s.reputation, challenges: s.dailyChallenges.map(ch => ({ ...ch })), day: c.index, date: c.date, tide: s.tide }].slice(-30);
    }
    Object.assign(c, { date: key, index: Math.max(c.index + 1, dateNumber(key) - dateNumber(c.start) + 1), totals: freshDayTotals() });
    this.rollTide(); this.checkSeason(); s.pricing.changes = {}; s.dailyChallenges = []; if (s.phase === 'service') this.startChallenges();
    this.event = 'A new day: fresh challenges and a new tide.';
  }
  /** Today so far: finished shifts plus the one in progress. */
  todayTotals(): { served: number; missed: number; revenue: number; tips: number; ingredients: number; wages: number; branch: number } {
    const t = this.state.calendar.totals, n = this.state.totals;
    return { served: t.served + n.served, missed: t.missed + n.missed, revenue: t.revenue + n.revenue, tips: t.tips + n.tips, ingredients: t.ingredients + n.ingredients, wages: t.wages, branch: t.branch };
  }
  private tickTown(at: number): void {
    this.rollCalendar(at);
    const done = completeJobs(this.state.town, at); if (!done.length) return;
    const last = done[done.length - 1], fame = this.checkMastery(), text = `${BUILDINGS[last.kind].name} ${last.level === 1 ? 'is built' : `reached level ${last.level}`}.${fame ? ` +${fame} fame.` : ''}`;
    this.lastCompletion = { id: ++this.completionSequence, text }; this.changed(text);
  }
  /** One Current charm per calendar day (UTC), granted on the first visit of the day. */
  private dailyGift(now: number): void {
    const day = localDateKey(now), town = this.state.town; if (town.lastGiftDay === day) return;
    town.lastGiftDay = day; town.charms.current++; this.event = 'Daily gift: a Current charm. It skips 15 minutes of building.';
  }
  private plot(x: number, z: number) { return plotAt(this.state.town, x, z); }
  /** Spending is never silently blocked by bills: the owner is warned before buying instead (see spend-guard). */
  private reserveError(cost: number): string | null {
    return this.state.cash < cost ? `This costs ${usd(cost)}.` : null;
  }
  unlockPlot(x: number, z: number): string | null {
    const town = this.state.town, plot = this.plot(x, z); if (!plot) return 'Choose a plot first.';
    const locked = plotLockReason(town, plot); if (locked) return locked;
    const cost = this.plotPrice(x, z); if (this.state.cash < cost) return `Unlocking costs ${usd(cost)}.`;
    const reserve = this.reserveError(cost); if (reserve) return reserve;
    this.state.cash -= cost; plot.owned = true; const fame = this.checkMastery();
    this.changed(`New plot unlocked. Lay roads, then build.${fame ? ` Every plot here is yours: +${fame} fame.` : ''}`); return null;
  }
  /** Reach a deeper zone: opens its ring of plots and its dishes once every requirement is met. */
  unlockZone(id: ZoneId): string | null {
    const info = ZONES[id]; if (!info) return 'Choose a zone first.';
    const price = this.zonePrice(id), error = zoneError(this.state, id, price); if (error) return error;
    this.state.cash -= price; this.state.town.zones.push(id);
    const fame = this.checkMastery(), more = { shallows: '', reef: ', new plots for your town, and the first ring of ocean regions to claim', twilight: ', new plots for your town, and a second ring of regions to claim', abyss: `${fame ? `, +${fame} fame` : ''}, and the open ocean beyond your regions to claim` }[id];
    this.changed(`You reached ${info.place}. New dishes are ready for the menu${more}.`); return null;
  }
  /** Why a building can't go on a spot, or null. `id` is a building being moved. */
  placeError(kind: BuildingKind, x: number, z: number, turned = false, id?: number): string | null {
    const town = this.state.town, moving = id === undefined ? undefined : buildingById(town, id), region = plotRegion(parcelOf(x, z));
    if (kind === 'restaurant' && !moving) return 'You already have a restaurant.';
    if (kind === 'restaurant' && region !== HOME_ID) return 'Your restaurant stays in the Home Reef.';
    if (kind === 'branch' && region === HOME_ID) return 'Branches open in other regions. Claim a region first.';
    if (moving && kind === 'branch' && region !== buildingRegion(moving)) return 'A branch stays in its own region.';
    if (kind === 'branch' && !moving && branchIn(town, region)) return 'This region already has a branch.';
    return sitingError(town, { kind, x, z, turned, wide: moving?.wide }, id);
  }
  /** Start a building with its corner on tile (x, z); `turned` swaps width and depth. */
  build(kind: BuildingKind, x: number, z: number, turned = false): string | null {
    const town = this.state.town, plot = parcelOf(x, z), place = this.placeError(kind, x, z, turned); if (place) return place;
    if (busyBuilders(town) >= town.builders) return 'Your builder is busy. Wait, use a charm, or hire a second builder.';
    const info = BUILDINGS[kind], price = this.buildPrice(kind, plot.x, plot.z); if (this.state.cash < price) return `${info.name} costs $${price}.`;
    const reserve = this.reserveError(price); if (reserve) return reserve;
    const now = this.now(), seconds = this.jobSeconds(kind, 1, plot.x, plot.z);
    this.state.cash -= price; town.buildings.push({ id: town.nextBuildingId++, kind, x, z, turned, wide: false, level: 1, job: { kind: 'build', startedAt: now, endsAt: now + seconds * 1000 } });
    this.changed(`Building a ${info.name.toLowerCase()}.`); return null;
  }
  /** Move or turn a building: free and instant, levels and timers stay. */
  moveBuilding(id: number, x: number, z: number, turned: boolean): string | null {
    const b = buildingById(this.state.town, id); if (!b) return 'Choose a building first.';
    const error = this.placeError(b.kind, x, z, turned, id); if (error) return error;
    Object.assign(b, { x, z, turned }); this.changed(`${BUILDINGS[b.kind].name} moved.`); return null;
  }
  /** Lay one road tile: instant, no builder needed. */
  placeRoad(x: number, z: number): string | null {
    const town = this.state.town, error = roadError(town, x, z); if (error) return error;
    const price = this.roadPrice(x, z); if (this.state.cash < price) return `A road costs ${usd(price)}.`;
    this.state.cash -= price; addRoads(town, [tileKey(x, z)]); this.changed(); return null;
  }
  /** Lift a road tile (free). Buildings that relied on it stop working until a road reaches them again. */
  removeRoad(x: number, z: number): string | null {
    const town = this.state.town; if (!isRoad(town, x, z)) return 'There is no road here.';
    const key = tileKey(x, z); town.roads = town.roads.filter(k => k !== key); this.changed(); return null;
  }
  /** Lay a plot's streets (its last row and column) in one go. */
  layStreets(px: number, pz: number): string | null {
    if (!plotAt(this.state.town, px, pz)?.owned) return 'Unlock this plot first.';
    const { tiles, price } = this.streetsFor(px, pz); if (!tiles.length) return 'This plot already has its streets.';
    if (this.state.cash < price) return `These streets cost ${usd(price)}.`;
    this.state.cash -= price; addRoads(this.state.town, tiles); this.changed(`${tiles.length} road tiles laid.`); return null;
  }
  upgrade(id: number): string | null {
    const town = this.state.town, b = buildingById(town, id);
    if (!b) return 'Build something here first.';
    if (b.job) return 'This building is already under construction.';
    if (b.level >= maxLevelOf(b.kind)) return 'Already at the highest level.';
    if (busyBuilders(town) >= town.builders) return 'Your builder is busy. Wait, use a charm, or hire a second builder.';
    const p = buildingPlot(b), cost = this.upgradePrice(b.kind, b.level + 1, p.x, p.z); if (this.state.cash < cost) return `This upgrade costs $${cost}.`;
    const reserve = this.reserveError(cost); if (reserve) return reserve;
    const now = this.now(); this.state.cash -= cost;
    b.job = { kind: 'upgrade', startedAt: now, endsAt: now + this.jobSeconds(b.kind, b.level + 1, p.x, p.z) * 1000 };
    this.changed(`Upgrading ${BUILDINGS[b.kind].name.toLowerCase()} to level ${b.level + 1}.`); return null;
  }
  useCharm(id: number, charm: CharmKind): string | null {
    const town = this.state.town, b = buildingById(town, id); if (!b?.job) return 'Nothing is being built here.';
    if (town.charms[charm] < 1) return `You have no ${CHARMS[charm].name}s.`;
    town.charms[charm]--; b.job.endsAt -= CHARMS[charm].seconds * 1000;
    this.event = `${CHARMS[charm].name} used.`; this.tickTown(this.now()); this.changed(); return null;
  }
  finishNow(id: number): string | null {
    const town = this.state.town, b = buildingById(town, id); if (!b?.job) return 'Nothing is being built here.';
    const now = this.now(), cost = finishCost(b.job, now); if (town.pearls < cost) return `Finishing now needs ${cost} pearls.`;
    town.pearls -= cost; b.job.endsAt = now; this.tickTown(now); return null;
  }
  buy(item: keyof typeof SHOP): string | null {
    const town = this.state.town, offer = SHOP[item];
    if (item === 'builder' && town.builders >= MAX_BUILDERS) return 'You already have every builder.';
    if (town.pearls < offer.pearls) return `${offer.name} costs ${offer.pearls} pearls.`;
    town.pearls -= offer.pearls;
    if (item === 'builder') town.builders++; else town.charms.current += 3;
    this.changed(`${offer.name} added.`); return null;
  }
  private finish(): void {
    const s = this.state;
    for (const guest of s.guests) if (!guest.paid && guest.stage !== 'leaving') s.totals.missed++;
    const wages = s.staff.reduce((sum, staff) => sum + staffWage(staff), 0), rent = s.expanded ? 50 : 30, debtPayment = Math.min(30, s.debt);
    // Branches earn at every closing, from their level, region and fame: deterministic, so offline replay matches.
    const branch = this.branchTotal();
    if (branch > 0) { s.cash += branch; this.recordIncome(branch, 'branch'); }
    s.cash -= wages + rent + debtPayment; s.debt -= debtPayment;
    // Short at closing: the bank covers the bills and the shortfall is repaid like a loan, $30 a day.
    const covered = s.cash < 0; if (covered) { s.debt += -s.cash; s.cash = 0; }
    // Guests turned away by a full room don't count against the rating: a packed restaurant is a popular one.
    const unhappy = s.totals.missed - s.totals.full, rating = Math.max(1, Math.min(5, 3 + (s.totals.served / Math.max(1, s.totals.served + unhappy)) * 1.5 + comfort(s) * .005 - unhappy * .06));
    s.reputation = Math.round((s.reputation * .65 + rating * .35) * 100) / 100;
    recordDay(s.collections, { ...s.totals, rating, tide: s.tide });
    const today = s.calendar.totals, shiftProfit = s.totals.revenue + s.totals.tips + branch - s.totals.ingredients - wages - rent - debtPayment;
    for (const key of ['revenue', 'tips', 'ingredients', 'served', 'missed', 'full'] as const) today[key] += s.totals[key];
    Object.assign(today, { wages: today.wages + wages, rent: today.rent + rent, debtPayment: today.debtPayment + debtPayment, branch: today.branch + branch, profit: today.profit + shiftProfit, shifts: today.shifts + 1, ratingSum: today.ratingSum + rating });
    s.history.push({ ...s.totals, challenges: s.dailyChallenges.map(c => ({ ...c })), day: s.day, wages, rent, debtPayment, profit: s.totals.revenue + s.totals.tips + branch - s.totals.ingredients - wages - rent - debtPayment, rating, tide: s.tide, branch }); s.history = s.history.slice(-20);
    // Regulars notice a price that keeps moving: more than PRICE_CHANGES_PER_DAY changes a day cost reputation.
    const upset: string[] = [];
    for (const dish of DISH_IDS) {
      const price = s.menu[dish].price, last = s.pricing.last[dish];
      if (last !== undefined && last !== price && s.menu[dish].enabled) {
        const n = (s.pricing.changes[dish] ?? 0) + 1; s.pricing.changes[dish] = n;
        if (n > PRICE_CHANGES_PER_DAY) { s.reputation = Math.max(1, Math.round((s.reputation - .05) * 100) / 100); upset.push(DISHES[dish].name.toLowerCase()); }
      }
      s.pricing.last[dish] = price;
    }
    this.beginNextDay();
    if (upset.length) this.event = `Regulars grumble about the changing price of the ${upset.join(' and ')}.`;
    if (covered) this.event = 'The bank covered the payroll. The shortfall is repaid $30 a shift.';
    this.changed();
  }
}
function browserStorage(): StorageAdapter | undefined { return typeof window === 'undefined' ? undefined : { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) }; }
export const restaurant = new RestaurantEngine(browserStorage());
