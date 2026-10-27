import { accessPoints, findPath, layoutError, placementError, seatPoint } from './layout';
import { CATALOG, DAY_LENGTH, DISHES, FURNITURE_MAX_LEVEL, SAVE_KEY, capacity, comfort, createRestaurant, entrance, freshTotals, furnitureUpgradeCost, guestPatienceSeconds, restaurantSchema, staffWage, stationSpeedup, tableTipBonus, width, type Dish, type Furniture, type Guest, type Placement, type Point, type RestaurantState, type Role, type Staff } from './types';

import { advanceDailyChallenges, createDailyChallenges, isSpecialGuest, challengeTitles } from './daily-challenges';
import type { CashReceipt } from './cash-feedback';
import { TIDES, rollTide, type TideEffects } from './tides';
import { BUILDINGS, CHARMS, MAX_BUILDERS, MAX_LEVEL, SHOP, busyBuilders, canUnlock, completeJobs, dayKey, finishCost, jobSeconds, lookFor, plotAt, townEffects, unlockCost, upgradeCost, type BuildingKind, type CharmKind, type TownEffects } from './town';

export const GOALS = [
  { id: 'first-service', title: 'A warm welcome', text: 'Serve your first 5 guests', target: 5, reward: 180, value: (s: RestaurantState) => s.lifetimeServed },
  { id: 'atmosphere', title: 'Make it yours', text: 'Reach 50 atmosphere', target: 50, reward: 150, value: comfort },
  { id: 'more-tables', title: 'Room for everyone', text: 'Build 5 coral tables', target: 5, reward: 250, value: (s: RestaurantState) => capacity(s) / 2 },
  { id: 'three-days', title: 'The reef favorite', text: 'Complete 3 service days', target: 3, reward: 300, value: (s: RestaurantState) => s.history.length },
];
/** Exact business results computed while the owner was away, not an idle-income estimate. */
export interface AwaySummary { seconds: number; days: number; served: number; cashChange: number; challengeBonus: number; }
export interface StorageAdapter { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const resetStaff = (staff: Staff): void => { staff.task = 'idle'; staff.guestId = null; staff.stationId = null; staff.timer = 0; staff.route = []; };
const seatKey = (g: Pick<Guest, 'tableId' | 'seat'>): string => `${g.tableId}:${g.seat}`;
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
  private effectsKey = '';
  private revision = 0;
  private accumulator = 0;
  private savedAt = 0;
  private rewardSavePending = false;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly storage?: StorageAdapter, private readonly now: () => number = Date.now) {
    try {
      const raw = storage?.getItem(SAVE_KEY);
      if (raw) {
        const result = restaurantSchema.safeParse(JSON.parse(raw));
        if (!result.success) throw new Error('Invalid save');
        const restored = result.data as RestaurantState;
        if (layoutError(restored.furniture, width(restored))) throw new Error('Invalid layout');
        if (restored.dailyChallenges.some(c => c.day !== restored.day)) throw new Error('Invalid challenge day');
        this.state = restored;
        // Legacy receipts were already charged: migrate without charging or completing that day twice.
        if (this.state.phase === 'report') { this.beginNextDay(); this.state.lastActiveAt = 0; }
        // Legacy service starts challenges next day, never assigns full-day goals near closing.
        if (this.state.phase === 'service' && this.state.elapsed === 0 && !this.state.dailyChallenges.length) this.startChallenges();
        if (this.state.phase === 'planning') this.rollTide();
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
  /** Replay all elapsed wall time at 1× using the same fixed simulation step, yielding between chunks. */
  async resume(): Promise<void> {
    this.backgrounded = false;
    if (this.catchingUp) return;
    const s = this.state, start = s.lastActiveAt;
    let target = this.now();
    this.dailyGift(target);
    if (!start || target <= start || this.paused || s.phase !== 'service') { this.tickTown(target); this.save(); this.notify(); return; }
    let steps = Math.floor((target - start) / 100);
    if (!steps) return;
    const before = { day: s.day, cash: s.cash, served: s.lifetimeServed, clock: s.clock, challengeBonus: s.lifetimeChallengeBonus };
    this.catchingUp = true; this.catchUpProgress = 0; this.incomeReceipts = []; this.notify();
    let done = 0;
    // Save partial checkpoints so closing the page during recovery never duplicates completed business.
    while (this.state === s && !this.paused && s.phase === 'service') {
      // Include time spent replaying/throttled in the background instead of silently discarding it.
      target = Math.max(target, this.now()); steps = Math.floor((target - start) / 100);
      if (done >= steps) break;
      const end = Math.min(steps, done + 1000);
      for (; done < end && s.phase === 'service' && !this.paused; done++) { this.tickTown(start + done * 100); this.step(.1); }
      s.lastActiveAt = start + done * 100;
      this.catchUpProgress = done / steps;
      this.save(); this.notify();
      if (done < steps && s.phase === 'service' && !this.paused) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (this.state !== s) return;
    this.tickTown(target);
    s.lastActiveAt = Math.max(s.lastActiveAt, target);
    this.awaySummary = s.clock - before.clock >= 1 ? { seconds: Math.round(s.clock - before.clock), days: s.day - before.day, served: s.lifetimeServed - before.served, cashChange: s.cash - before.cash, challengeBonus: s.lifetimeChallengeBonus - before.challengeBonus } : null;
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
  private relocateStaff(): void {
    this.state.staff.forEach((staff, i) => {
      resetStaff(staff);
      const candidate = { x: entrance.x + (i % 3) - 1, z: entrance.z - Math.floor(i / 3) };
      const safe = this.route(entrance, candidate) !== null ? candidate : entrance;
      staff.x = safe.x; staff.z = safe.z;
    });
  }
  place(item: Placement): string | null {
    if (this.state.phase !== 'planning') return 'Rearrange the restaurant between service days.';
    const existing = this.state.furniture.find(f => f.id === item.id);
    if (existing && existing.kind !== item.kind) return 'Move the selected furniture without changing its type.';
    if (!existing && this.state.cash < CATALOG[item.kind].price) return 'Not enough cash. Serve a day or sell something you no longer need.';
    const error = placementError(this.state, item); if (error) return error;
    if (existing) Object.assign(existing, item, { level: existing.level });
    else { this.state.cash -= CATALOG[item.kind].price; this.state.furniture.push({ ...item, id: this.state.nextId++, level: 1 }); }
    this.relocateStaff(); this.changed(`${CATALOG[item.kind].name} ${existing ? 'moved' : 'built'}. A little more you.`); return null;
  }
  sell(id: number): string | null {
    if (this.state.phase !== 'planning') return 'Wait until closing to sell furniture.';
    const item = this.state.furniture.find(f => f.id === id); if (!item) return 'Select a piece of furniture first.';
    if (this.state.furniture.length === 1) return 'Keep at least one piece of furniture.';
    this.state.furniture = this.state.furniture.filter(f => f.id !== id); this.state.cash += Math.floor(CATALOG[item.kind].price * .7);
    this.recordIncome(Math.floor(CATALOG[item.kind].price * .7), 'sale');
    this.relocateStaff(); this.changed('Sold for 70% of the original price.'); return null;
  }
  /** Instant, planning-only upgrade of one placed piece. Selling still refunds 70% of the base price. */
  upgradeFurniture(id: number): string | null {
    if (this.state.phase !== 'planning') return 'Upgrade furniture between service days.';
    const item = this.state.furniture.find(f => f.id === id); if (!item) return 'Select a piece of furniture first.';
    if (item.level >= FURNITURE_MAX_LEVEL) return 'Already at the highest level.';
    const cost = furnitureUpgradeCost(item.kind, item.level + 1); if (this.state.cash < cost) return `This upgrade costs $${cost}.`;
    this.state.cash -= cost; item.level++;
    this.changed(`${CATALOG[item.kind].name} is now level ${item.level}.${lookFor(item.level) > lookFor(item.level - 1) ? ' A whole new look!' : ''}`); return null;
  }
  hire(role: Role): string | null {
    if (this.state.phase !== 'planning') return 'Hire before opening for the day.';
    if (this.state.staff.length >= this.crewLimit()) return `Your crew is limited to ${this.crewLimit()} Mareen. Build Mareen homes for more.`;
    if (this.state.cash < 150) return 'Recruitment costs $150.';
    const names = role === 'chef' ? ['Marlo', 'Nerin', 'Coralie', 'Kai', 'Delphine', 'Ondine'] : ['Pearl', 'Tidus', 'Maris', 'Shelly', 'Reef', 'Calyx'];
    const name = names.find(n => !this.state.staff.some(s => s.name === n)) ?? names[0];
    this.state.cash -= 150; this.state.staff.push({ id: this.state.nextId++, name, role, level: 1, ...entrance, yaw: 0, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 });
    this.changed(`${name} joined your team. Welcome aboard!`); return null;
  }
  train(id: number): string | null {
    const staff = this.state.staff.find(s => s.id === id);
    if (this.state.phase !== 'planning' || !staff) return 'Train staff between service days.';
    if (staff.level === 3) return 'Already fully trained.';
    const cost = 180 * staff.level; if (this.state.cash < cost) return `Training costs $${cost}.`;
    this.state.cash -= cost; staff.level++; this.changed(`${staff.name} is now level ${staff.level}. Faster service, happier guests.`); return null;
  }
  dismiss(id: number): string | null {
    const member = this.state.staff.find(s => s.id === id);
    if (!member || this.state.phase !== 'planning') return 'Manage your team before opening.';
    if (this.state.staff.filter(s => s.role === member.role).length <= 1) return 'Keep at least one chef and one server.';
    this.state.staff = this.state.staff.filter(s => s.id !== id); this.changed(`${member.name} has left the team.`); return null;
  }
  setDish(dish: Dish, enabled: boolean, price: number): string | null {
    if (this.state.phase !== 'planning') return 'Set tomorrow’s menu after closing.';
    if (!enabled && !Object.entries(this.state.menu).some(([key, value]) => key !== dish && value.enabled)) return 'Keep at least one dish on the menu.';
    this.state.menu[dish] = { enabled, price: Math.max(10, Math.min(60, Math.round(price))) }; this.changed(); return null;
  }
  expand(): string | null {
    if (this.state.phase !== 'planning') return 'Build the extension before opening.';
    if (this.state.expanded) return 'Your east grotto is already open.';
    if (this.state.history.length < 3) return 'Complete 3 service days to unlock the east grotto.';
    if (this.state.cash < 900) return 'The east grotto costs $900.';
    this.state.cash -= 900; this.state.expanded = true; this.changed('The east grotto is yours. Forty new tiles, endless possibilities.'); return null;
  }
  claim(id: string): string | null {
    const goal = GOALS.find(g => g.id === id);
    if (!goal || this.state.claimed.includes(id) || goal.value(this.state) < goal.target) return 'Complete this milestone first.';
    this.state.claimed.push(id); this.state.cash += goal.reward; this.state.town.charms.tide++; this.state.town.pearls += 5;
    this.recordIncome(goal.reward, 'milestone'); this.changed(`Milestone complete: ${goal.title}. +$${goal.reward}, a Tide charm and 5 pearls.`); return null;
  }
  loan(): string | null {
    if (this.state.phase !== 'planning' || this.state.cash >= 200 || this.state.debt > 0) return 'A $600 recovery loan is available below $200, with no existing loan.';
    this.state.cash += 600; this.state.debt = 600; this.recordIncome(600, 'loan'); this.changed('Recovery loan received. $30 is repaid after each day, with no interest.'); return null;
  }
  rename(name: string): void { this.state.name = name.trim().slice(0, 28) || 'Little Reef'; this.changed(); }
  setMusic(value: boolean): void { this.state.music = value; this.changed(); }
  welcome(): void { this.state.welcomed = true; this.changed(); }
  reset(): void { this.rewardSavePending = false; this.pauseAfterCatchUp = null; this.catchingUp = false; this.backgrounded = false; this.awaySummary = null; this.speed = 1; this.incomeReceipts = []; this.state = createRestaurant(); this.paused = false; this.accumulator = 0; this.savedAt = 0; this.loadWarning = ''; this.changed('A fresh beginning. Make this reef your own.'); }
  readiness(): string[] {
    const errors: string[] = [];
    if (!capacity(this.state)) errors.push('Build at least one coral table.');
    for (const dish of ['salad', 'burger'] as const) if (this.state.menu[dish].enabled && !this.state.furniture.some(f => f.kind === DISHES[dish].station)) errors.push(`Add a ${DISHES[dish].station === 'prep' ? 'kelp counter' : 'vent grill'} for ${DISHES[dish].name.toLowerCase()}, or remove it from the menu.`);
    if (this.state.cash < this.operatingCost() + 30) errors.push(`Keep $${this.operatingCost() + 30} for wages, rent and starting ingredients.`);
    const layout = layoutError(this.state.furniture, width(this.state)); if (layout) errors.push(layout);
    return errors;
  }
  operatingCost(): number { return this.state.staff.reduce((sum, staff) => sum + staffWage(staff), 0) + (this.state.expanded ? 50 : 30); }
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
  private rollTide(): void { this.state.tide = rollTide(this.state.seed, this.state.day); }
  tideEffects(): TideEffects { return TIDES[this.state.tide].effects; }
  private beginNextDay(): void {
    const renovate = this.state.renovation;
    this.state.day++; this.state.phase = 'planning'; this.state.guests = []; this.state.dirty = []; this.state.elapsed = 0; this.state.nextArrival = 1; this.state.totals = freshTotals(); this.relocateStaff();
    this.state.renovation = false; this.incomeReceipts = []; this.state.dailyChallenges = []; this.rollTide();
    const errors = this.readiness();
    if (!renovate && !errors.length) { this.state.phase = 'service'; this.startChallenges(); this.event = `Day ${this.state.day}. Doors open again — yesterday’s receipt is in Ledger.`; }
    else this.event = renovate ? 'Closed for renovation. Reopen whenever you are ready.' : `Waiting for the owner: ${errors[0]}`;
  }
  /** Compatibility for older receipts; normal service rolls forward automatically. */
  nextDay(): void { if (this.state.phase === 'report') { this.beginNextDay(); this.changed(); } }
  closeEarly(): void { if (this.state.phase === 'service') { this.state.renovation = true; this.state.elapsed = Math.max(DAY_LENGTH, this.state.elapsed); this.changed('Last orders, then renovation. Your team will finish serving before closing.'); } }
  private arrive(): void {
    const s = this.state;
    if (s.guests.length >= 20) return;
    let selected: { table: Furniture; seat: number } | undefined;
    for (const table of s.furniture.filter(f => f.kind === 'table')) for (let seat = 0; seat < 2; seat++) {
      if (!selected && !s.dirty.includes(`${table.id}:${seat}`) && !s.guests.some(g => g.tableId === table.id && g.seat === seat && g.stage !== 'leaving')) selected = { table, seat };
    }
    if (!selected) { s.totals.missed++; this.event = 'A guest found no free seat. More tables or faster clearing would help.'; return; }
    const dishes = (['salad', 'burger'] as const).filter(dish => s.menu[dish].enabled);
    const dish = dishes[Math.floor(this.random() * dishes.length)]; if (!dish) return;
    const price = s.menu[dish].price;
    if (this.random() < Math.max(0, (price / DISHES[dish].fair - 1) * .7)) { s.totals.missed++; this.event = 'A guest thought the menu was too expensive.'; return; }
    const route = this.route(entrance, accessPoints(selected.table)[selected.seat]); if (!route) return;
    route.push(seatPoint(selected.table, selected.seat));
    const special = isSpecialGuest(s.day, s.nextId);
    s.guests.push({ id: s.nextId++, special, ...entrance, yaw: Math.PI, route, look: (['coral', 'pearl', 'lagoon', 'dusk'] as const)[Math.floor(this.random() * 4)], tableId: selected.table.id, seat: selected.seat, dish, price, stage: 'arriving', waiting: 0, timer: 0, happy: false, stationId: null, paid: false });
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
          const cost = this.dishCost(guest.dish);
          if (!station || s.cash < cost) continue;
          const route = this.route(member, accessPoints(station)[0]); if (!route) continue;
          guest.stage = 'cooking'; guest.stationId = station.id; member.guestId = guest.id; member.stationId = station.id; member.task = 'toKitchen'; member.route = route;
          s.cash -= cost; s.totals.ingredients += cost; break;
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
  private step(dt: number): void {
    const s = this.state; s.clock += dt; s.elapsed += dt;
    if (s.elapsed < DAY_LENGTH && s.elapsed >= s.nextArrival) { this.arrive(); s.nextArrival = s.elapsed + (Math.max(5.5, 9.5 - s.reputation * .6 - Math.min(s.day, 10) * .12) + this.random() * 2) / ((1 + this.townEffects().arrivalBonus) * this.tideEffects().arrival); }
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
          const table = s.furniture.find(f => f.id === guest.tableId);
          const tip = Math.max(0, Math.round(guest.price * (.04 + comfort(s) * .001 + tableTipBonus(table?.level ?? 1)) * Math.max(.15, 1 - guest.waiting / 60) * this.tideEffects().tips));
          const earned = guest.price + tip; s.cash += earned; s.totals.revenue += guest.price; s.totals.tips += tip; s.totals.served++; s.lifetimeServed++; guest.paid = true;
          this.recordIncome(earned, 'service', guest.id, tip);
          this.event = `${DISHES[guest.dish].name} served. +$${earned}${tip ? ` including $${tip} tip` : ''}`;
          for (const challenge of advanceDailyChallenges(s.dailyChallenges, guest, tip)) {
            s.cash += challenge.reward; s.lifetimeChallengeBonus += challenge.reward;
            this.recordIncome(challenge.reward, 'challenge');
            this.event = `Daily challenge complete: ${challengeTitles[challenge.kind]}. +$${challenge.reward} automatically added.`;
            if (!this.catchingUp) this.rewardSavePending = true;
            if (s.dailyChallenges.length === 3 && s.dailyChallenges.every(c => c.rewarded)) { s.town.charms.current++; s.town.pearls++; this.event = 'All three daily challenges done: a Current charm and a pearl are yours.'; }
          }
        }
        resetStaff(staff);
      }
    }
    if (s.elapsed >= DAY_LENGTH && (s.guests.length === 0 && s.dirty.length === 0 || s.elapsed >= DAY_LENGTH + 90)) this.finish();
  }
  /** Town effects, cached until a building changes. */
  townEffects(): TownEffects {
    const key = JSON.stringify(this.state.town.plots.map(p => [p.building, p.level, p.job?.kind ?? '']));
    if (!this.effects || key !== this.effectsKey) { this.effects = townEffects(this.state.town); this.effectsKey = key; }
    return this.effects;
  }
  crewLimit(): number { return 6 + this.townEffects().extraCrew; }
  dishCost(dish: Dish): number { return Math.max(1, Math.round(DISHES[dish].cost * (dish === 'salad' ? this.townEffects().saladCost * this.tideEffects().kelpCost : this.townEffects().burgerCost * this.tideEffects().fishCost))); }
  /** Finish construction whose end time has passed (wall-clock time, also while away). */
  private tickTown(at: number): void {
    const done = completeJobs(this.state.town, at); if (!done.length) return;
    const last = done[done.length - 1], text = `${BUILDINGS[last.building!].name} ${last.level === 1 ? 'is built' : `reached level ${last.level}`}.`;
    this.lastCompletion = { id: ++this.completionSequence, text }; this.changed(text);
  }
  /** One Current charm per calendar day (UTC), granted on the first visit of the day. */
  private dailyGift(now: number): void {
    const day = dayKey(now), town = this.state.town; if (town.lastGiftDay === day) return;
    town.lastGiftDay = day; town.charms.current++; this.event = 'Daily gift: a Current charm. It skips 15 minutes of building.';
  }
  private plot(x: number, z: number) { return plotAt(this.state.town, x, z); }
  unlockPlot(x: number, z: number): string | null {
    const town = this.state.town, plot = this.plot(x, z); if (!plot) return 'Choose a plot first.';
    if (plot.owned) return 'You already own this plot.';
    if (!canUnlock(town, plot)) return 'Unlock a plot next to your town first.';
    const cost = unlockCost(town); if (this.state.cash < cost) return `Unlocking costs ${cost.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}.`;
    this.state.cash -= cost; plot.owned = true; this.changed('New plot unlocked. Choose what to build.'); return null;
  }
  build(x: number, z: number, kind: BuildingKind): string | null {
    const town = this.state.town, plot = this.plot(x, z);
    if (!plot?.owned) return 'Unlock this plot first.';
    if (plot.building) return 'This plot already has a building.';
    if (kind === 'restaurant') return 'You already have a restaurant.';
    if (busyBuilders(town) >= town.builders) return 'Your builder is busy. Wait, use a charm, or hire a second builder.';
    const info = BUILDINGS[kind]; if (this.state.cash < info.buildCost) return `${info.name} costs $${info.buildCost}.`;
    const now = this.now(), seconds = jobSeconds(town, kind, 1);
    this.state.cash -= info.buildCost; Object.assign(plot, { building: kind, level: 1, job: { kind: 'build', startedAt: now, endsAt: now + seconds * 1000 } });
    this.changed(`Building a ${info.name.toLowerCase()}.`); return null;
  }
  upgrade(x: number, z: number): string | null {
    const town = this.state.town, plot = this.plot(x, z);
    if (!plot?.building) return 'Build something here first.';
    if (plot.job) return 'This building is already under construction.';
    if (plot.level >= MAX_LEVEL) return 'Already at the highest level.';
    if (busyBuilders(town) >= town.builders) return 'Your builder is busy. Wait, use a charm, or hire a second builder.';
    const cost = upgradeCost(plot.building, plot.level + 1); if (this.state.cash < cost) return `This upgrade costs $${cost}.`;
    const now = this.now(); this.state.cash -= cost;
    plot.job = { kind: 'upgrade', startedAt: now, endsAt: now + jobSeconds(town, plot.building, plot.level + 1) * 1000 };
    this.changed(`Upgrading ${BUILDINGS[plot.building].name.toLowerCase()} to level ${plot.level + 1}.`); return null;
  }
  useCharm(x: number, z: number, charm: CharmKind): string | null {
    const town = this.state.town, plot = this.plot(x, z); if (!plot?.job) return 'Nothing is being built here.';
    if (town.charms[charm] < 1) return `You have no ${CHARMS[charm].name}s.`;
    town.charms[charm]--; plot.job.endsAt -= CHARMS[charm].seconds * 1000;
    this.event = `${CHARMS[charm].name} used.`; this.tickTown(this.now()); this.changed(); return null;
  }
  finishNow(x: number, z: number): string | null {
    const town = this.state.town, plot = this.plot(x, z); if (!plot?.job) return 'Nothing is being built here.';
    const now = this.now(), cost = finishCost(plot.job, now); if (town.pearls < cost) return `Finishing now needs ${cost} pearls.`;
    town.pearls -= cost; plot.job.endsAt = now; this.tickTown(now); return null;
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
    s.cash -= wages + rent + debtPayment; s.debt -= debtPayment;
    const rating = Math.max(1, Math.min(5, 3 + (s.totals.served / Math.max(1, s.totals.served + s.totals.missed)) * 1.5 + comfort(s) * .005 - s.totals.missed * .06));
    s.reputation = Math.round((s.reputation * .65 + rating * .35) * 100) / 100;
    s.history.push({ ...s.totals, challenges: s.dailyChallenges.map(c => ({ ...c })), day: s.day, wages, rent, debtPayment, profit: s.totals.revenue + s.totals.tips - s.totals.ingredients - wages - rent - debtPayment, rating, tide: s.tide }); s.history = s.history.slice(-20);
    this.beginNextDay(); this.changed();
  }
}
function browserStorage(): StorageAdapter | undefined { return typeof window === 'undefined' ? undefined : { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) }; }
export const restaurant = new RestaurantEngine(browserStorage());
