import { describe, expect, it } from 'vitest';
import { KitchenEngine } from '@/game/engine';
import { DiningRoom, sampleDinerPose } from '@/game/diners';
import { DINING_SEATS, MAX_VISIBLE_GUESTS } from '@/game/dining-layout';
import { RECIPES, SHIFTS } from '@/game/config';
import { createDinerRig } from '@/scene/diner-model';
import type { Order, Recipe } from '@/game/types';

function tick(game: KitchenEngine, seconds: number): void { for (let t = 0; t < seconds - 1e-9; t += .02) game.update(Math.min(.02, seconds - t), []); }
function serve(game: KitchenEngine, recipe: Recipe): void { const chef = game.state.chefs[0]; chef.held = { kind: 'plate', parts: [...RECIPES[recipe].parts] }; game.interact(chef, game.state.stations.find(s => s.kind === 'serve')!); }
const order = (id: number): Order => ({ id, recipe: 'salad', remaining: 100, duration: 100 });

describe('order-linked dining lifecycle', () => {
  it('creates a unique guest per ticket and seats them outside the kitchen', () => {
    const game = new KitchenEngine(); game.start(); expect(game.dining.guests.map(g => g.id)).toEqual([1, 2]);
    tick(game, 10);
    for (const g of game.dining.guests) { expect(g.stage).toBe('waiting'); expect(g.z).toBeLessThan(-4.3); expect(g.seat).not.toBeNull(); }
    expect(new Set(game.dining.guests.map(g => g.seat)).size).toBe(2);
  });
  it('delivers to the exact first matching ticket, never every guest with that recipe', () => {
    const game = new KitchenEngine(); game.start(); tick(game, SHIFTS[0].service.solo.arrivalSeconds + .05);
    const salads = game.state.orders.filter(o => o.recipe === 'salad'); expect(salads).toHaveLength(2);
    serve(game, 'salad');
    expect(game.dining.guests.find(g => g.id === salads[0].id)?.outcome).toBe('served');
    expect(game.dining.guests.find(g => g.id === salads[1].id)?.outcome).toBe('pending');
    expect(game.state.served).toBe(1); expect(game.state.returns).toEqual([7]);
  });
  it('eats, stands, leaves and frees the seat, returning exactly one plate at seven seconds', () => {
    const game = new KitchenEngine(); game.start(); tick(game, 10); serve(game, 'salad');
    const g = game.dining.guests.find(g => g.id === 1)!;
    expect(g.stage).toBe('eating'); tick(game, 5.6); expect(g.stage).toBe('standing');
    tick(game, 1.3); expect(game.state.dirty).toBe(0); tick(game, .2); expect(game.state.dirty).toBe(1);
    tick(game, 15); expect(game.dining.guests.some(g => g.id === 1)).toBe(false); expect(game.state.dirty).toBe(1);
  });
  it('remembers service during arrival without teleporting or losing the meal', () => {
    const game = new KitchenEngine(); game.start(); const g = game.dining.guests[0]; const before = [g.x, g.z];
    serve(game, 'salad'); expect([g.x, g.z]).toEqual(before); expect(g.outcome).toBe('served');
    tick(game, 7); expect(g.stage).toBe('eating'); expect(game.state.missed).toBe(0);
  });
  it('times out several guests independently with unchanged penalties and no dirty dishes', () => {
    const game = new KitchenEngine(); game.start(); tick(game, 10); const guests = [...game.dining.guests];
    game.state.orders.forEach(o => { o.remaining = .01; }); tick(game, .02);
    expect(game.state.penalties).toBe(40); expect(game.state.missed).toBe(2);
    expect(guests.every(g => g.outcome === 'missed' && g.stage === 'standing')).toBe(true);
    tick(game, 15); expect(game.state.dirty).toBe(0); expect(game.dining.guests.every(g => !guests.includes(g))).toBe(true);
  });
  it('freezes transforms, paths, meal timing and patience on pause', () => {
    const game = new KitchenEngine(); game.start(); tick(game, 2); game.pause(true);
    const before = JSON.stringify(game.dining.guests); tick(game, 20); expect(JSON.stringify(game.dining.guests)).toBe(before);
    game.pause(false); tick(game, 1); expect(JSON.stringify(game.dining.guests)).not.toBe(before);
  });
  it.each(['restart', 'menu', 'briefing', 'selection', 'finish'])('clears old guests on %s', action => {
    const game = new KitchenEngine(); game.start(); tick(game, 2); const old = game.dining.guests[0];
    if (action === 'restart') game.start(); else if (action === 'selection') game.select(0, 'coop'); else if (action === 'finish') game.finish(); else game.setPhase(action as 'menu' | 'briefing');
    expect(game.dining.guests.includes(old)).toBe(false);
    expect(game.dining.guests).toHaveLength(action === 'restart' ? 2 : 0);
  });
  it.each(['solo', 'coop'] as const)('%s practice keeps its guest waiting without expiry or progression changes', mode => {
    const game = new KitchenEngine(); game.select(0, mode); game.start(true); tick(game, 120);
    expect(game.dining.guests[0].stage).toBe('waiting'); expect(game.state.time).toBe(180);
    serve(game, 'salad'); expect(game.state.served).toBe(1); expect(game.state.orders[0].recipe).toBe('burger');
  });
  it('does not fabricate a meal on invalid or unmatched service', () => {
    const game = new KitchenEngine(); game.start(true); serve(game, 'burger');
    expect(game.dining.guests[0].outcome).toBe('pending'); expect(game.state.returns).toHaveLength(0);
  });
});

describe('bounded seating and motion', () => {
  it('queues overflow without overlapping seats and admits waiting orders after departure', () => {
    const room = new DiningRoom(); const orders = Array.from({ length: 10 }, (_, i) => order(i + 1)); orders.forEach(o => room.order(o, 0));
    for (let t = .02; t < 12; t += .02) room.update(.02, t, orders);
    expect(room.guests.filter(g => g.seat !== null)).toHaveLength(6);
    expect(room.guests.filter(g => g.stage === 'queued')).toHaveLength(2);
    expect(room.guests.filter(g => g.stage === 'lobby')).toHaveLength(2);
    room.serve(1, 12); room.miss(2, 12);
    for (let t = 12.02; t < 35; t += .02) {
      room.update(.02, t, orders);
      const seats = room.guests.flatMap(g => g.seat === null ? [] : [g.seat]); expect(new Set(seats).size).toBe(seats.length);
      expect(room.guests.filter(g => g.stage !== 'queued').length).toBeLessThanOrEqual(MAX_VISIBLE_GUESTS);
      for (const g of room.guests) { expect(g.z).toBeLessThan(-4.3); expect(Number.isFinite(g.yaw)).toBe(true); }
    }
    expect(room.guests.find(g => g.id === 7)?.stage).toBe('waiting');
  });
  it('holds an early lobby delivery until a chair is free, without losing its meal', () => {
    const room = new DiningRoom(), orders = Array.from({ length: 8 }, (_, i) => order(i + 1));
    orders.forEach(o => room.order(o, 0));
    for (let t = .02; t < 12; t += .02) room.update(.02, t, orders);
    room.serve(7, 12);
    for (let t = 12; t < 22; t += .02) room.update(.02, t, orders);
    const lobby = room.guests.find(g => g.id === 7)!;
    expect(lobby.outcome).toBe('served'); expect(lobby.stage).toBe('lobby');
    room.miss(1, 22);
    for (let t = 22; t < 31; t += .02) room.update(.02, t, orders);
    expect(lobby.mealStarted).not.toBeNull(); expect(lobby.outcome).toBe('served');
  });
  it.each([0, 1, 2])('preserves chef collision and order timings in layout %i', level => {
    const game = new KitchenEngine(); game.state.level = level; game.start();
    const chefs = game.state.chefs.map(c => ({ x: c.x, z: c.z, facing: c.facing }));
    tick(game, 10);
    expect(game.state.chefs.map(c => ({ x: c.x, z: c.z, facing: c.facing }))).toEqual(chefs);
    expect(game.state.orders).toHaveLength(2); expect(game.state.orders[0].remaining).toBeCloseTo(SHIFTS[level].service.solo.patienceSeconds - 10);
    for (const g of game.dining.guests) expect(game.canMove(g.x, g.z)).toBe(false);
  });
  it('ignores duplicate creation and duplicate service/expiry', () => {
    const room = new DiningRoom(); room.order(order(1), 0); room.order(order(1), 0); room.serve(1, 1); room.serve(1, 2); room.miss(1, 3);
    expect(room.guests).toHaveLength(1); expect(room.guests[0].servedAt).toBe(1); expect(room.guests[0].outcome).toBe('served');
  });
  it('gives all species distinct rigs, articulated knees, no chef hats and disposable resources', () => {
    for (const species of ['mouse', 'crocodile', 'rabbit', 'bear'] as const) {
      const rig = createDinerRig(species, 1);
      expect(rig.root.userData.species).toBe(species); expect(rig.root.getObjectByName('toque')).toBeUndefined();
      expect(rig.legs).toHaveLength(2); expect(rig.legs[0].knee.parent).toBe(rig.legs[0].hip); rig.dispose();
    }
  });
  it('reduced motion keeps seated/eating/emotion states while removing flourishes', () => {
    const room = new DiningRoom(); room.order(order(1), 0); const g = room.guests[0];
    Object.assign(g, { stage: 'eating', sit: 1, since: 2, outcome: 'served' });
    const a = sampleDinerPose(g, 3, true), b = sampleDinerPose(g, 4, true);
    expect([a.gait, a.bite, a.wave, a.bob, a.headY]).toEqual([0, 0, 0, 0, 0]);
    expect(a.sit).toBe(1); expect(a.meal).toBe(true); expect(a.happy).toBe(1); expect(a.headX).toBe(b.headX);
    expect(sampleDinerPose(g, 3, false)).toEqual(sampleDinerPose(g, 3, false));
  });
  it('every dining seat faces its own tabletop and is outside the playfield', () => {
    for (const s of DINING_SEATS) { expect(Math.sign(Math.sin(s.yaw))).toBe(Math.sign(s.mealX - s.x)); expect(s.z).toBeLessThan(-4.3); }
  });
});
