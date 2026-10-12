import { describe, expect, it } from 'vitest';
import { KitchenEngine } from '@/game/engine';
import { DiningRoom } from '@/game/diners';
import { DINER_ANGER_THRESHOLD, DINER_HAPPY_SECONDS, sampleDinerEmotion } from '@/game/diner-emotion';
import { RECIPES, SHIFTS } from '@/game/config';
import type { Mode, Recipe } from '@/game/types';

function tick(game: KitchenEngine, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += .02) game.update(Math.min(.02, seconds - t), []);
}
function serve(game: KitchenEngine, recipe: Recipe, id = 0): void {
  const chef = game.state.chefs[id]; chef.held = { kind: 'plate', parts: [...RECIPES[recipe].parts] };
  game.interact(chef, game.state.stations.find(s => s.kind === 'serve')!);
}
function start(mode: Mode = 'solo', practice = false): KitchenEngine {
  const game = new KitchenEngine(); game.select(0, mode); game.start(practice); tick(game, 10); return game;
}

describe('diner emotion cues use real service and patience', () => {
  it('does not show an emotion on a comfortable waiting guest', () => {
    const game = start(); expect(sampleDinerEmotion(game.dining.guests[0], game.state.elapsed, false).kind).toBeNull();
  });
  it.each(['solo', 'coop'] as const)('shows exactly the first matching %s guest’s thank-you with scoring unchanged', mode => {
    const game = start(mode); tick(game, SHIFTS[0].service[mode].arrivalSeconds);
    const salads = game.dining.guests.filter(g => g.recipe === 'salad'); expect(salads).toHaveLength(2);
    const original = game.state.orders.find(o => o.id === salads[0].id)!;
    const tip = Math.round(20 * original.remaining / original.duration);
    serve(game, 'salad', mode === 'coop' ? 1 : 0);
    expect(sampleDinerEmotion(salads[0], game.state.elapsed, false).kind).toBe('happy');
    expect(sampleDinerEmotion(salads[1], game.state.elapsed, false).kind).toBeNull();
    expect(game.state.score).toBe(50 + tip); expect(game.state.returns).toEqual([7]);
    tick(game, DINER_HAPPY_SECONDS + .01);
    expect(sampleDinerEmotion(salads[0], game.state.elapsed, false).kind).toBeNull();
  });
  it.each([0, 1, 2])('uses the actual solo/co-op patience threshold for shift %i', level => {
    for (const mode of ['solo', 'coop'] as const) {
      const game = new KitchenEngine(); game.state.progress = { solo: [1000, 1000, 1000], coop: [1000, 1000, 1000] };
      game.select(level, mode); game.start();
      const guest = game.dining.guests[0];
      const deadline = SHIFTS[level].service[mode].patienceSeconds * (1 - DINER_ANGER_THRESHOLD);
      tick(game, deadline - .1); expect(sampleDinerEmotion(guest, game.state.elapsed, false).kind).toBeNull();
      tick(game, .2); expect(sampleDinerEmotion(guest, game.state.elapsed, false).kind).toBe('angry');
      expect(game.state.missed).toBe(0); expect(game.state.penalties).toBe(0);
    }
  });
  it('includes exactly 20% remaining and immediately changes anger into thanks on service', () => {
    const game = start(); const guest = game.dining.guests[0]; guest.patience = .2;
    expect(sampleDinerEmotion(guest, game.state.elapsed, false).kind).toBe('angry');
    serve(game, 'salad'); expect(sampleDinerEmotion(guest, game.state.elapsed, false).kind).toBe('happy');
    tick(game, 3.1); expect(sampleDinerEmotion(guest, game.state.elapsed, false).kind).toBeNull();
  });
  it('stays angry through timeout and departure without delaying penalties or adding dirty dishes', () => {
    const game = start(); const guest = game.dining.guests[0]; game.state.orders[0].remaining = .001;
    tick(game, .02); expect(guest.outcome).toBe('missed'); expect(game.state.penalties).toBe(20);
    expect(sampleDinerEmotion(guest, game.state.elapsed, false).kind).toBe('angry');
    tick(game, 1); expect(guest.stage).toBe('leaving'); expect(sampleDinerEmotion(guest, game.state.elapsed, false).kind).toBe('angry');
    tick(game, 14); expect(game.dining.guests.includes(guest)).toBe(false); expect(game.state.dirty).toBe(0);
    expect(sampleDinerEmotion(guest, game.state.elapsed, false).kind).toBeNull();
  });
  it('does not thank a guest for an unmatched or incomplete dish', () => {
    const game = start('solo', true); serve(game, 'burger');
    const chef = game.state.chefs[0]; chef.held = { kind: 'plate', parts: ['lettuce:chopped'] };
    game.interact(chef, game.state.stations.find(s => s.kind === 'serve')!);
    expect(sampleDinerEmotion(game.dining.guests[0], game.state.elapsed, false).kind).toBeNull();
    expect(game.state.served).toBe(0);
  });
  it('shows early-service thanks while entering and again when the meal arrives at the seat', () => {
    const game = new KitchenEngine(); game.start(); const guest = game.dining.guests[0]; serve(game, 'salad');
    expect(guest.stage).toBe('entering'); expect(sampleDinerEmotion(guest, 0, false).kind).toBe('happy');
    tick(game, 7); expect(guest.stage).toBe('eating'); expect(sampleDinerEmotion(guest, game.state.elapsed, false).kind).toBe('happy');
  });
  it('never renders offscreen reservations, and remembers an early delivery until seated', () => {
    const room = new DiningRoom();
    const orders = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, recipe: 'salad' as const, remaining: 100, duration: 100 }));
    orders.forEach(o => room.order(o, 0)); const queued = room.guests[8]; room.serve(queued.id, 0);
    expect(sampleDinerEmotion(queued, 0, false).kind).toBeNull();
    for (let t = .02; t < 12; t += .02) room.update(.02, t, orders);
    room.miss(1, 12); room.miss(2, 12); room.miss(3, 12);
    for (let t = 12.02; t < 28; t += .02) room.update(.02, t, orders);
    expect(queued.mealStarted).not.toBeNull();
    expect(sampleDinerEmotion(queued, queued.mealStarted! + .1, false).kind).toBe('happy');
  });
  it.each(['solo', 'coop'] as const)('%s practice never becomes angry just from time spent waiting', mode => {
    const game = start(mode, true); tick(game, 240);
    expect(sampleDinerEmotion(game.dining.guests[0], game.state.elapsed, false).kind).toBeNull();
    serve(game, 'salad'); expect(sampleDinerEmotion(game.dining.guests[0], game.state.elapsed, true).kind).toBe('happy');
  });
  it('freezes the thank-you pop/fade and angry threshold while paused', () => {
    const game = start(); const guest = game.dining.guests[0]; serve(game, 'salad'); tick(game, .12);
    const pose = sampleDinerEmotion(guest, game.state.elapsed, false); game.pause(true); tick(game, 20);
    expect(sampleDinerEmotion(guest, game.state.elapsed, false)).toEqual(pose);
    game.pause(false); tick(game, 3); expect(sampleDinerEmotion(guest, game.state.elapsed, false).kind).toBeNull();
  });
  it('reduced motion retains static expressive states without pop, lift or fading', () => {
    const game = start(); const guest = game.dining.guests[0]; serve(game, 'salad'); const time = game.state.elapsed;
    const still = { kind: 'happy', opacity: 1, scale: 1, lift: 0 };
    expect(sampleDinerEmotion(guest, time, true)).toEqual(still);
    expect(sampleDinerEmotion(guest, time + 2.9, true)).toEqual(still);
    expect(sampleDinerEmotion(guest, time + 3, true).kind).toBeNull();
    expect(sampleDinerEmotion(guest, time, false).scale).toBeLessThan(1);
    expect(sampleDinerEmotion(guest, time + .18, false).scale).toBeCloseTo(1.1);
    expect(sampleDinerEmotion(guest, time + .4, false).scale).toBe(1);
    expect(sampleDinerEmotion(guest, time + 2.9, false).opacity).toBeLessThan(.3);
    expect(sampleDinerEmotion(guest, time + 1, false).lift).toBe(4);
  });
  it.each(['restart', 'menu', 'briefing', 'select', 'finish'])('removes old emotion owners on %s', action => {
    const game = start(); const guest = game.dining.guests[0]; serve(game, 'salad');
    if (action === 'restart') game.start(); else if (action === 'select') game.select(0, 'coop'); else if (action === 'finish') game.finish(); else game.setPhase(action as 'menu' | 'briefing');
    expect(game.dining.guests.includes(guest)).toBe(false);
    expect(game.dining.guests.every(g => sampleDinerEmotion(g, game.state.elapsed, false).kind === null)).toBe(true);
  });
});
