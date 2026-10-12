import { CHEF_DASH_SPEED, CHEF_WALK_SPEED, DASH_COOLDOWN_SECONDS, DASH_DURATION_SECONDS, GRILL_COOK_SECONDS, LABELS, makeStations, MAX_ACTIVE_ORDERS, recipeFor, RECIPES, SHIFTS, starsFor } from './config';
import { loadOutfits, loadProgress, saveOutfits, saveProgress } from './storage';
import { DEFAULT_OUTFIT, isOutfitColor, type ChefOutfit, type ChefOutfits, type OutfitPart } from './chef-outfit';
import { ACTION_EFFECT_LIFETIME, MAX_ACTION_EFFECTS } from './action-feedback';
import { CHOP_SECONDS, completedCuts, cutPosition, isVegetable } from './chopping';
import { EMOTION_SECONDS, sampleChefEmotion, type ChefEmotion, type ChefEmotionCue } from './chef-emotion';
import { CHEF_HOP_SECONDS, type ChefHopCue } from './chef-hop';
import { DiningRoom } from './diners';
import { MAX_SERVICE_REWARDS, SERVICE_REWARD_SECONDS, type ServiceReward } from './service-reward';
import type { Chef, ChefActionEffect, GameState, Ingredient, Item, Mode, PlayerInput, SoundEvent, Station } from './types';

const EMPTY_INPUT: PlayerInput = { x: 0, y: 0, pick: false, work: false, dash: false };
const INGREDIENTS: string[] = ['lettuce', 'tomato', 'patty', 'bun'];
/** Frame-rate independent simulation. React only receives a throttled HUD snapshot. */
export class KitchenEngine {
  state: GameState;
  readonly dining = new DiningRoom();
  actionEffects: ChefActionEffect[] = [];
  serviceRewards: ServiceReward[] = [];
  private nextRewardId = 1;
  readonly chefEmotions = new Map<number, ChefEmotionCue>();
  readonly chefHops = new Map<number, ChefHopCue>();
  private grillCooks = new WeakMap<Item, number>();
  private nextEffectId = 1;
  onSound: (event: SoundEvent) => void = () => {};
  private listeners = new Set<() => void>();
  private lastNotify = 0;
  private audioClock = 0;
  private snapshot: GameState;
  constructor() {
    this.state = { phase: 'menu', mode: 'solo', level: 0, practice: false, paused: false, time: 180, elapsed: 0, score: 0, combo: 0, orderPoints: 0, tips: 0, penalties: 0, served: 0, missed: 0, orders: [], stations: makeStations(0), chefs: this.makeChefs(), plates: 4, dirty: 0, returns: [], nextOrder: 0, nextId: 1, message: '', messageKind: 'info', messageTime: 0, tutorial: 0, results: null, progress: loadProgress(), progressSaveFailed: false, outfits: loadOutfits(), outfitSaveFailed: false, revision: 0, sound: true, music: true };
    this.snapshot = { ...this.state };
  }
  private makeChefs(): Chef[] { return [0, 1].map(id => ({ id, x: id === 0 ? -3.5 : 3.5, z: 1.1, facing: 0, held: null, near: null, moving: false, working: false, dash: 0, cooldown: 0 })); }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = (): GameState => this.snapshot;
  notify(): void { this.state.revision++; this.snapshot = { ...this.state }; this.listeners.forEach(fn => fn()); }
  unlocked(level: number, mode = this.state.mode): boolean { return level === 0 || starsFor(this.state.progress[mode][level - 1], level - 1, mode) >= 1; }
  select(level: number, mode: Mode): void { this.dining.reset(); this.chefHops.clear(); this.resetEmotions(); this.actionEffects = []; this.serviceRewards = []; this.state.mode = mode; this.state.level = this.unlocked(level, mode) ? level : 0; this.state.stations = makeStations(this.state.level); this.notify(); }
  setPhase(phase: GameState['phase']): void { this.dining.reset(); this.chefHops.clear(); this.resetEmotions(); this.actionEffects = []; this.serviceRewards = []; this.state.phase = phase; this.state.paused = false; this.state.chefs.forEach(c => { c.moving = false; c.working = false; }); this.notify(); }
  setAudio(key: 'sound' | 'music', value: boolean): void { this.state[key] = value; this.notify(); }
  /** Cosmetic changes only; preserve the other chef, scores and all simulation state. */
  setOutfitColor(id: number, part: OutfitPart, color: string): void {
    if ((id !== 0 && id !== 1) || (part !== 'hat' && part !== 'apron') || !isOutfitColor(color)) return;
    this.updateOutfit(id, { ...this.state.outfits[id], [part]: color });
  }
  resetOutfit(id: number): void {
    if (id === 0 || id === 1) this.updateOutfit(id, { ...DEFAULT_OUTFIT });
  }
  private updateOutfit(id: 0 | 1, outfit: ChefOutfit): void {
    if (this.state.phase !== 'menu' && this.state.phase !== 'briefing') return;
    const outfits: ChefOutfits = [...this.state.outfits]; outfits[id] = outfit;
    this.state.outfits = outfits;
    this.state.outfitSaveFailed = !saveOutfits(outfits);
    this.notify();
  }
  /** Retry a blocked write without discarding the best scores held in this session. */
  retryProgressSave(): void {
    if (!this.state.progressSaveFailed) return;
    this.state.progressSaveFailed = !saveProgress(this.state.progress);
    this.notify();
  }
  pause(value: boolean): void { if (this.state.phase !== 'playing') return; this.state.paused = value; this.notify(); }
  start(practice = false): void {
    this.dining.reset();
    this.chefHops.clear();
    this.resetEmotions();
    this.actionEffects = []; this.serviceRewards = [];
    const { level, mode, progress, sound, music } = this.state;
    Object.assign(this.state, { phase: 'playing', practice, paused: false, time: 180, elapsed: 0, score: 0, combo: 0, orderPoints: 0, tips: 0, penalties: 0, served: 0, missed: 0, orders: [], stations: makeStations(level), chefs: this.makeChefs(), plates: mode === 'solo' ? 4 : 6, dirty: 0, returns: [], nextOrder: SHIFTS[level].service[mode].arrivalSeconds, nextId: 1, message: '', messageKind: 'info', messageTime: 0, tutorial: 0, results: null, progress, sound, music });
    this.addOrder('salad'); if (!practice) this.addOrder('burger');
    this.notify();
  }
  private addOrder(recipe?: 'salad' | 'burger'): void {
    const s = this.state;
    const duration = SHIFTS[s.level].service[s.mode].patienceSeconds;
    s.orders.push({ id: s.nextId++, recipe: recipe ?? (s.nextId % 3 === 0 ? 'burger' : 'salad'), remaining: duration, duration });
    this.dining.order(s.orders[s.orders.length - 1], s.elapsed);
  }
  say(message: string, kind: GameState['messageKind'] = 'info'): void { this.state.message = message; this.state.messageKind = kind; this.state.messageTime = 3; }
  private sound(event: SoundEvent): void { if (this.state.sound) this.onSound(event); }
  private actionFeedback(kind: ChefActionEffect['kind'], chef: Chef, station: Station, ingredient?: Ingredient, cutIndex?: number): void {
    if (this.state.phase !== 'playing' || this.state.paused || (chef.id !== 0 && this.state.mode !== 'coop')) return;
    this.actionEffects.push({ id: this.nextEffectId++, kind, chefId: chef.id, stationId: station.id, x: station.x + (cutIndex ? cutPosition(cutIndex) : 0), z: station.z, startedAt: this.state.elapsed, ingredient, ...(cutIndex ? { cutIndex, item: station.item ?? undefined } : {}) });
    if (this.actionEffects.length > MAX_ACTION_EFFECTS) this.actionEffects.shift();
  }
  private resetEmotions(): void {
    this.chefEmotions.clear();
    this.grillCooks = new WeakMap<Item, number>();
  }
  private react(chefId: number, kind: ChefEmotion): void {
    const s = this.state;
    if (s.phase !== 'playing' || s.paused || !s.chefs.some(c => c.id === chefId) || (chefId !== 0 && s.mode !== 'coop')) return;
    const from = sampleChefEmotion(this.chefEmotions.get(chefId), s.elapsed);
    this.chefEmotions.set(chefId, { kind, startedAt: s.elapsed, from });
  }
  private placedFood(chef: Chef, station: Station, item: Item): void {
    if ('state' in item) this.actionFeedback('place', chef, station, item.kind);
    else if (item.kind === 'plate' && item.parts.length > 0) this.actionFeedback('place', chef, station);
  }
  nearest(chef: Chef): Station | null {
    let nearest: Station | null = null, best = 1.8;
    for (const station of this.state.stations) {
      const dx = station.x - chef.x, dz = station.z - chef.z;
      const distance = Math.hypot(dx, dz);
      const dot = distance > 0 ? (Math.sin(chef.facing) * dx + Math.cos(chef.facing) * dz) / distance : 0;
      const adjusted = distance + (1 - dot) * .16;
      if (adjusted < best) { best = adjusted; nearest = station; }
    }
    return nearest;
  }
  canMove(x: number, z: number): boolean {
    if (x < -7.15 || x > 7.15 || z < -4.3 || z > 4.3) return false;
    return !this.state.stations.some(st => Math.abs(x - st.x) < 1.04 && Math.abs(z - st.z) < 1.04);
  }
  private move(chef: Chef, dx: number, dz: number): void {
    // Small substeps keep dashes from tunnelling through counter footprints.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .12));
    for (let i = 0; i < steps; i++) {
      if (this.canMove(chef.x + dx / steps, chef.z)) chef.x += dx / steps;
      if (this.canMove(chef.x, chef.z + dz / steps)) chef.z += dz / steps;
    }
  }
  private combine(a: Item | null, b: Item | null): Item | null {
    const plate = a?.kind === 'plate' ? a : b?.kind === 'plate' ? b : null;
    const food = a?.kind === 'plate' ? b : a;
    if (!plate || !food || !('state' in food)) return null;
    const part = `${food.kind}:${food.state}`;
    if (!RECIPES.burger.parts.includes(part) || plate.parts.includes(part)) return null;
    return { kind: 'plate', parts: [...plate.parts, part] };
  }
  /** Only highlight ingredients an active chef's pick action can actually collect. */
  isIngredientSelectable(station: Station): boolean {
    const s = this.state;
    if (s.phase !== 'playing' || s.paused || station.fire > 0) return false;
    const supply = INGREDIENTS.includes(station.kind);
    const looseIngredient = ['board', 'counter', 'grill', 'sink'].includes(station.kind)
      && station.item !== null && 'state' in station.item;
    if (!supply && !looseIngredient) return false;
    return s.chefs.some(chef => {
      if ((chef.id !== 0 && s.mode !== 'coop') || chef.near !== station.id) return false;
      if (!chef.held) return true;
      // A compatible ingredient can also be collected directly onto a held plate.
      return !supply && chef.held.kind === 'plate' && this.combine(chef.held, station.item) !== null;
    });
  }
  interact(chef: Chef, station: Station): void {
    const s = this.state;
    if (station.fire > 0) { this.say('Fire! Take the extinguisher and hold Work nearby.'); return; }
    if (INGREDIENTS.includes(station.kind)) {
      if (chef.held) { this.say('Hands full — put your item on a prep counter.'); return; }
      chef.held = { kind: station.kind as Ingredient, state: 'raw' }; this.sound('pick');
      if (station.kind === 'lettuce' && s.tutorial === 0) s.tutorial = 1;
      return;
    }
    if (station.kind === 'plates') {
      if (chef.held?.kind === 'plate' && chef.held.parts.length === 0) { s.plates++; chef.held = null; }
      else if (!chef.held && s.plates > 0) { chef.held = { kind: 'plate', parts: [] }; s.plates--; s.tutorial = Math.max(s.tutorial, 4); this.sound('pick'); }
      else this.say(s.plates === 0 ? 'No clean plates — collect and wash a dirty one.' : 'Put your food down before taking a plate.');
      return;
    }
    if (station.kind === 'dirty') { if (!chef.held && s.dirty > 0) { chef.held = { kind: 'dirty' }; s.dirty--; this.sound('pick'); } else this.say('Served plates return here after 7 seconds.'); return; }
    if (station.kind === 'extinguisher') {
      if (chef.held?.kind === 'extinguisher') chef.held = null;
      else if (!chef.held) chef.held = { kind: 'extinguisher' };
      else this.say('Set down your food first.');
      return;
    }
    if (station.kind === 'trash') {
      if (chef.held?.kind === 'plate') s.plates++;
      if (chef.held?.kind === 'dirty') s.dirty++;
      chef.held = null; this.say('All clear. Back to cooking!'); return;
    }
    if (station.kind === 'serve') {
      const recipe = recipeFor(chef.held);
      const index = s.orders.findIndex(order => order.recipe === recipe);
      if (index < 0 || !recipe) { this.say(recipe ? 'No matching order. Keep the dish for the next guest.' : 'Finish a recipe on a clean plate before serving.'); return; }
      const order = s.orders[index];
      s.combo = Math.min(5, s.combo + 1);
      const points = RECIPES[recipe].points;
      const tip = Math.round(20 * order.remaining / order.duration) + (s.combo - 1) * 5;
      s.orderPoints += points; s.tips += tip; s.score = s.orderPoints + s.tips - s.penalties; s.served++;
      if (s.phase === 'playing' && !s.paused && (chef.id === 0 || s.mode === 'coop')) {
        if (this.serviceRewards.length >= MAX_SERVICE_REWARDS) this.serviceRewards.shift();
        const slot = Array.from({ length: MAX_SERVICE_REWARDS }, (_, i) => i).find(i => !this.serviceRewards.some(reward => reward.slot === i)) ?? 0;
        this.serviceRewards.push({ id: this.nextRewardId++, orderId: order.id, chefId: chef.id, recipe, points, tip, total: points + tip, x: station.x, z: station.z, slot, startedAt: s.elapsed });
      }
      this.dining.serve(order.id, s.elapsed);
      s.orders.splice(index, 1); s.returns.push(7); chef.held = null;
      this.say(`Beautifully served! +${points}  +${tip} tip`, 'service'); this.sound('serve');
      this.react(chef.id, 'happy');
      if (s.practice) { s.tutorial = Math.max(s.tutorial, 6); this.addOrder('burger'); }
      else if (s.orders.length < 2) this.addOrder();
      return;
    }
    if (station.kind === 'grill' && chef.held && !(chef.held.kind === 'patty' && chef.held.state === 'raw') && !station.item) { this.say('Only a raw patty goes on the grill.'); return; }
    if (station.kind === 'sink' && chef.held && chef.held.kind !== 'dirty' && !station.item) { this.say('Place a dirty plate here, then hold Work to wash.'); return; }
    const combined = this.combine(chef.held, station.item);
    if (combined) {
      if (chef.held?.kind === 'plate') { chef.held = combined; station.item = null; }
      else { station.item = combined; if (chef.held) this.placedFood(chef, station, chef.held); chef.held = null; }
      station.progress = 0;
      if (recipeFor(combined)) this.react(chef.id, 'happy');
      if (recipeFor(combined) === 'salad') s.tutorial = Math.max(s.tutorial, 5);
      this.sound('pick'); return;
    }
    if (chef.held && station.item) { this.say('Counter occupied. Use an empty one, or combine prepared food with a plate.'); return; }
    [chef.held, station.item] = [station.item, chef.held];
    if (station.item) this.placedFood(chef, station, station.item);
    if (station.kind === 'grill' && station.item?.kind === 'patty' && station.item.state === 'raw') this.grillCooks.set(station.item, chef.id);
    station.progress = 0; station.heat = 0;
    this.sound('pick');
    if (chef.held && 'state' in chef.held && chef.held.state === 'chopped') s.tutorial = Math.max(s.tutorial, 3);
  }
  private work(chef: Chef, station: Station, dt: number): void {
    const s = this.state;
    if (chef.held?.kind === 'extinguisher' && station.fire > 0) {
      chef.working = true; station.fire = Math.max(0, station.fire - dt / 2);
      if (station.fire === 0) { station.heat = 0; this.say('Fire out! Discard the burnt patty.'); }
      return;
    }
    if (station.fire > 0 || chef.held) return;
    const chopping = station.kind === 'board' && isVegetable(station.item) && station.item.state === 'raw';
    const washing = station.kind === 'sink' && station.item?.kind === 'dirty';
    if (!chopping && !washing) return;
    chef.working = true;
    const previousCuts = completedCuts(station.progress);
    station.progress = Math.min(1, station.progress + dt / (chopping ? CHOP_SECONDS : 2.5));
    // Contact boundaries belong to the board, not a global audio clock. Co-op
    // retains its additive work rate without duplicating a shared-board impact.
    if (chopping && isVegetable(station.item)) {
      for (let cut = previousCuts + 1; cut <= completedCuts(station.progress); cut++) {
        this.actionFeedback('chop', chef, station, station.item.kind, cut);
        this.sound('chop');
      }
    } else if (dt > 0 && this.audioClock <= 0) { this.sound('wash'); this.audioClock = .25; }
    if (station.progress >= 1 - 1e-9) {
      station.progress = 0;
      if (chopping && station.item && 'state' in station.item) { station.item.state = 'chopped'; s.tutorial = Math.max(s.tutorial, 2); }
      if (washing) { station.item = { kind: 'plate', parts: [] }; this.actionFeedback('wash', chef, station); if (s.tutorial >= 6) s.tutorial = 7; this.say('Squeaky clean! Pick up your plate.'); }
    }
  }
  /** Inputs use ground-plane camera right/forward, not assumed world directions. */
  update(dt: number, inputs: PlayerInput[], basis = { rx: 1, rz: 0, fx: 0, fz: -1 }): void {
    const s = this.state;
    if (s.phase !== 'playing' || s.paused) return;
    dt = Math.min(dt, .05); s.elapsed += dt; this.audioClock -= dt;
    this.actionEffects = this.actionEffects.filter(effect => s.elapsed - effect.startedAt < ACTION_EFFECT_LIFETIME[effect.kind]);
    this.serviceRewards = this.serviceRewards.filter(reward => s.elapsed - reward.startedAt < SERVICE_REWARD_SECONDS);
    for (const [id, cue] of this.chefEmotions) if (s.elapsed >= cue.startedAt + EMOTION_SECONDS[cue.kind]) this.chefEmotions.delete(id);
    for (const [id, cue] of this.chefHops) if (s.elapsed >= cue.startedAt + CHEF_HOP_SECONDS) this.chefHops.delete(id);
    if (!s.practice) s.time = Math.max(0, s.time - dt);
    s.messageTime = Math.max(0, s.messageTime - dt);
    for (const chef of s.chefs.slice(0, s.mode === 'solo' ? 1 : 2)) {
      const input = inputs[chef.id] ?? EMPTY_INPUT;
      chef.working = false;
      const magnitude = Math.hypot(input.x, input.y);
      const hasDirection = magnitude > .1;
      const x = (basis.rx * input.x + basis.fx * input.y) / Math.max(1, magnitude);
      const z = (basis.rz * input.x + basis.fz * input.y) / Math.max(1, magnitude);
      if (chef.dash === 0 && hasDirection) chef.facing = Math.atan2(x, z);
      if (input.dash && chef.cooldown <= 1e-9) {
        chef.dash = DASH_DURATION_SECONDS;
        chef.cooldown = DASH_COOLDOWN_SECONDS;
        this.sound('dash');
      }
      // Keep the burst's heading after keys are released. Split the final frame so
      // distance is independent of render rate and walking resumes without a jump.
      const dashTime = Math.min(dt, chef.dash);
      const walkTime = dt - dashTime;
      chef.moving = hasDirection || dashTime > 0;
      if (dashTime > 0) this.move(chef, Math.sin(chef.facing) * CHEF_DASH_SPEED * dashTime, Math.cos(chef.facing) * CHEF_DASH_SPEED * dashTime);
      if (walkTime > 0 && hasDirection) {
        chef.facing = Math.atan2(x, z);
        this.move(chef, x * CHEF_WALK_SPEED * walkTime, z * CHEF_WALK_SPEED * walkTime);
      }
      chef.dash = Math.max(0, chef.dash - dt);
      chef.cooldown = Math.max(0, chef.cooldown - dt);
      if (chef.dash < 1e-9) chef.dash = 0;
      if (chef.cooldown < 1e-9) chef.cooldown = 0;
      const station = this.nearest(chef); chef.near = station?.id ?? null;
      // Input is edge-triggered. Never restart a hop midair or delay the actual interaction.
      if (input.pick && !this.chefHops.has(chef.id)) this.chefHops.set(chef.id, { startedAt: s.elapsed });
      if (input.pick && station) this.interact(chef, station);
      else if (input.pick) this.say('Move close to a station to pick up or place.');
      if (input.work && station) this.work(chef, station, dt);
    }
    for (const station of s.stations) {
      if (station.kind !== 'grill' || !station.item || station.item.kind !== 'patty' || station.fire > 0) continue;
      station.heat += dt;
      if (station.heat >= GRILL_COOK_SECONDS && station.item.state === 'raw') { station.item.state = 'cooked'; this.say('Patty ready! Take it off the grill.'); }
      if (station.heat >= 15 && station.item.state === 'cooked') {
        station.item.state = 'burnt'; this.say('Patty burnt — discard it before a fire starts!');
        const cook = this.grillCooks.get(station.item);
        if (cook !== undefined) this.react(cook, 'disappointed');
        this.grillCooks.delete(station.item);
      }
      if (station.heat >= 21) { station.fire = 1; this.sound('fire'); this.say('Watch the grill! Grab the extinguisher.'); }
    }
    s.returns = s.returns.map(t => t - dt).filter(t => { if (t <= 0) { s.dirty++; return false; } return true; });
    if (!s.practice) {
      for (const order of s.orders) order.remaining -= dt;
      const expiredOrders = s.orders.filter(order => order.remaining <= 0);
      expiredOrders.forEach(order => this.dining.miss(order.id, s.elapsed));
      const expired = expiredOrders.length;
      if (expired) { s.missed += expired; s.penalties += expired * 20; s.score = s.orderPoints + s.tips - s.penalties; s.combo = 0; this.sound('miss'); this.say('An order timed out. Fresh start — keep cooking!'); }
      s.orders = s.orders.filter(order => order.remaining > 0);
      s.nextOrder -= dt;
      if ((s.nextOrder <= 0 || s.orders.length === 0) && s.orders.length < MAX_ACTIVE_ORDERS) { this.addOrder(); s.nextOrder = SHIFTS[s.level].service[s.mode].arrivalSeconds; }
      if (s.time <= 0) this.finish();
    }
    if (s.phase === 'playing') this.dining.update(dt, s.elapsed, s.orders);
    this.lastNotify += dt;
    if (this.lastNotify >= .08) { this.lastNotify = 0; this.notify(); }
  }
  finish(): void {
    const s = this.state;
    if (s.practice || s.phase !== 'playing') return;
    const stars = starsFor(s.score, s.level, s.mode);
    const newBest = s.score > s.progress[s.mode][s.level];
    const wasUnlocked = s.level < 2 && this.unlocked(s.level + 1);
    if (newBest) s.progress = { ...s.progress, [s.mode]: s.progress[s.mode].map((n, i) => i === s.level ? s.score : n) };
    if (newBest || s.progressSaveFailed) s.progressSaveFailed = !saveProgress(s.progress);
    s.results = { score: s.score, orderPoints: s.orderPoints, tips: s.tips, penalties: s.penalties, served: s.served, missed: s.missed, stars, level: s.level, mode: s.mode, newBest, unlocked: !wasUnlocked && stars > 0 && s.level < 2 };
    this.actionEffects = []; this.serviceRewards = [];
    this.chefHops.clear();
    this.resetEmotions();
    this.dining.reset();
    s.phase = 'results'; s.paused = false; this.notify();
  }
  prompt(chef: Chef): string {
    const station = this.state.stations.find(st => st.id === chef.near);
    if (!station) return 'Move near a station';
    if (station.fire > 0) return chef.held?.kind === 'extinguisher' ? 'Hold Work · Extinguish' : 'Fire! Find extinguisher';
    if (station.kind === 'board' && station.item && 'state' in station.item && station.item.state === 'raw') return 'Hold Work · Chop';
    if (station.kind === 'sink' && station.item?.kind === 'dirty') return 'Hold Work · Wash';
    return `${chef.held ? 'Place' : 'Pick up'} · ${LABELS[station.kind]}`;
  }
}
export const engine = new KitchenEngine();
