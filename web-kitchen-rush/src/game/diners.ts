import type { Order, Recipe } from './types';
import { ARRIVAL_LANE, DINING_SEATS, EXIT_LANE, GUEST_ENTRY, GUEST_SPEED, MAX_VISIBLE_GUESTS, type GuestPoint } from './dining-layout';

export type GuestSpecies = 'mouse' | 'crocodile' | 'rabbit' | 'bear';
export type GuestStage = 'queued' | 'lobby' | 'entering' | 'sitting' | 'waiting' | 'eating' | 'standing' | 'leaving' | 'gone';
/** Transient visual service record. It never owns scoring, order patience or plate inventory. */
export interface Diner {
  id: number; recipe: Recipe; species: GuestSpecies; seat: number | null;
  stage: GuestStage; since: number; admitted: number; x: number; z: number; yaw: number;
  path: GuestPoint[]; waypoint: number; distance: number; moving: boolean;
  servedAt: number | null; outcome: 'pending' | 'served' | 'missed';
  patience: number; sit: number; mealStarted: number | null; lobby: number | null; standStart: { sit: number; z: number } | null;
}
const SPECIES: GuestSpecies[] = ['mouse', 'crocodile', 'rabbit', 'bear'];
const SEAT_ORDER = [2, 4, 0, 3, 5, 1];
const LOBBY = [{ x: 7.5, z: -6.85 }, { x: 8.25, z: -6.85 }];
const SIT_SECONDS = .55;
export const EATING_SECONDS = 5.5;
const ease = (t: number): number => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

/** Orders enter through explicit creation/serve/expiry events, never inferred from HUD removal. */
export class DiningRoom {
  guests: Diner[] = [];
  private nextArrival = 0;
  reset(): void { this.guests = []; this.nextArrival = 0; }
  order(order: Order, time: number): void {
    if (this.guests.some(g => g.id === order.id)) return;
    this.guests.push({ id: order.id, recipe: order.recipe, species: SPECIES[(order.id - 1) % 4], seat: null,
      stage: 'queued', since: time, admitted: time, ...GUEST_ENTRY, yaw: Math.PI,
      path: [], waypoint: 0, distance: 0, moving: false, servedAt: null, outcome: 'pending',
      patience: 1, sit: 0, mealStarted: null, lobby: null, standStart: null });
    this.admit(time);
  }
  serve(id: number, time: number): void {
    const guest = this.guests.find(g => g.id === id && g.outcome === 'pending');
    if (!guest) return;
    guest.outcome = 'served'; guest.servedAt = time;
    if (guest.stage === 'waiting') this.eat(guest, time);
  }
  miss(id: number, time: number): void {
    const guest = this.guests.find(g => g.id === id && g.outcome === 'pending');
    if (!guest) return;
    guest.outcome = 'missed'; this.leave(guest, time);
  }
  private eat(g: Diner, time: number): void { g.stage = 'eating'; g.since = time; g.mealStarted = time; }
  private route(g: Diner, path: GuestPoint[]): void { g.path = path; g.waypoint = 0; }
  private leave(g: Diner, time: number): void {
    if (g.stage === 'queued') { g.stage = 'gone'; return; }
    g.standStart = { sit: g.sit, z: g.z };
    g.stage = 'standing'; g.since = time; g.moving = false;
  }
  private admit(time: number): void {
    // A small lobby and offscreen reservations absorb overflow without delaying real tickets.
    if (time < this.nextArrival || this.guests.filter(g => g.stage !== 'queued' && g.stage !== 'gone').length >= MAX_VISIBLE_GUESTS - 4) return;
    const g = this.guests.find(g => g.stage === 'queued' || g.stage === 'lobby');
    if (!g) return;
    const seat = SEAT_ORDER.find(index => !this.guests.some(other => other.seat === index && other.stage !== 'gone'));
    if (seat === undefined) {
      const next = this.guests.find(g => g.stage === 'queued');
      const slot = LOBBY.findIndex((_, i) => !this.guests.some(other => other.lobby === i && other.stage !== 'gone'));
      if (next && slot >= 0) {
        next.stage = 'lobby'; next.lobby = slot; next.admitted = time;
        this.route(next, [{ x: LOBBY[slot].x, z: GUEST_ENTRY.z }, LOBBY[slot]]);
        this.nextArrival = time + .8;
      }
      return;
    }
    const target = DINING_SEATS[seat]; g.seat = seat; g.stage = 'entering'; g.since = time; g.admitted = time;
    this.route(g, [{ x: g.lobby === null ? 8.05 : g.x, z: ARRIVAL_LANE }, { x: target.x, z: ARRIVAL_LANE }, { x: target.x, z: target.z + .5 }]);
    this.nextArrival = time + .8;
  }
  update(dt: number, time: number, orders: readonly Order[]): void {
    if (dt <= 0) return;
    for (const g of this.guests) {
      g.moving = false;
      const order = orders.find(o => o.id === g.id);
      if (order) g.patience = order.remaining / order.duration;
      if (g.stage === 'queued') continue;
      if (g.stage === 'entering' || g.stage === 'leaving' || g.stage === 'lobby') {
        let budget = dt * GUEST_SPEED;
        while (budget > 1e-8 && g.waypoint < g.path.length) {
          const point = g.path[g.waypoint];
          const dx = point.x - g.x, dz = point.z - g.z, distance = Math.hypot(dx, dz);
          const step = Math.min(budget, distance);
          if (distance > 1e-8) {
            g.x += dx / distance * step; g.z += dz / distance * step;
            const yaw = Math.atan2(dx, dz), delta = Math.atan2(Math.sin(yaw - g.yaw), Math.cos(yaw - g.yaw));
            g.yaw += delta * (1 - Math.exp(-14 * dt)); g.distance += step; g.moving = true;
          }
          budget -= step;
          if (distance <= step + 1e-8) g.waypoint++; else break;
        }
        if (g.lobby !== null && g.z >= ARRIVAL_LANE - .02) g.lobby = null;
        if (g.stage === 'leaving' && g.seat !== null && g.z >= EXIT_LANE - .02) g.seat = null;
        if (g.waypoint >= g.path.length && g.stage !== 'lobby') { g.stage = g.stage === 'entering' ? 'sitting' : 'gone'; g.since = time; g.moving = false; }
      }
      if (g.stage === 'sitting') {
        g.sit = ease((time - g.since) / SIT_SECONDS);
        g.z = DINING_SEATS[g.seat ?? 0].z + .5 * (1 - g.sit);
        if (g.sit >= 1) { g.stage = 'waiting'; g.since = time; if (g.outcome === 'served') this.eat(g, time); }
      }
      if (g.stage === 'sitting' || g.stage === 'waiting' || g.stage === 'eating') {
        const target = DINING_SEATS[g.seat ?? 0];
        const delta = Math.atan2(Math.sin(target.yaw - g.yaw), Math.cos(target.yaw - g.yaw));
        g.yaw += delta * (1 - Math.exp(-14 * dt));
      }
      if (g.stage === 'eating' && time - g.since >= EATING_SECONDS) this.leave(g, time);
      if (g.stage === 'standing') {
        const rise = ease((time - g.since) / SIT_SECONDS);
        const from = g.standStart ?? { sit: 0, z: g.z };
        g.sit = from.sit * (1 - rise); g.z = from.z + .5 * from.sit * rise;
        if (time - g.since >= SIT_SECONDS) {
          g.stage = 'leaving'; g.sit = 0; g.since = time;
          // Turn into the aisle before heading for the door, never cross tabletops.
          this.route(g, [{ x: g.x, z: EXIT_LANE }, { x: 8.8, z: EXIT_LANE }, { x: 9.15, z: GUEST_ENTRY.z }]);
        }
      }
    }
    this.guests = this.guests.filter(g => g.stage !== 'gone');
    this.admit(time);
  }
}

/** All secondary motion is sampled from simulation time, so pause and reduced motion are exact. */
export function sampleDinerPose(g: Readonly<Diner>, time: number, reduced: boolean) {
  const gait = reduced || !g.moving ? 0 : Math.sin(g.distance * 8) * .45;
  const eating = g.stage === 'eating';
  const bite = !eating || reduced ? 0 : (1 - Math.cos((time - g.since) * Math.PI * 1.4)) / 2;
  const wave = !reduced && g.stage === 'waiting' && time - g.since < 1.8 ? Math.sin((time - g.since) * 8) * .15 : 0;
  return { gait, bite, wave, sit: g.sit, bob: reduced ? 0 : Math.abs(gait) * .035,
    headX: eating ? .12 - bite * .12 : g.outcome === 'missed' ? .16 : 0,
    headY: reduced || g.moving ? 0 : Math.sin(time * 1.4 + g.id) * .06,
    happy: g.outcome === 'served' ? 1 : 0, sad: g.outcome === 'missed' ? 1 : g.patience < .2 ? .45 : 0,
    bubble: g.stage === 'waiting' && time - g.since < 4,
    meal: eating, portion: eating ? Math.max(.15, 1 - (time - g.since) / EATING_SECONDS * .75) : 1,
  };
}
