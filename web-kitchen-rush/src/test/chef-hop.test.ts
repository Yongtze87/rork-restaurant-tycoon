import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KitchenEngine } from '@/game/engine';
import { CHEF_HOP_HEIGHT, CHEF_HOP_SECONDS, sampleChefHop } from '@/game/chef-hop';
import type { PlayerInput, StationKind } from '@/game/types';

const idle: PlayerInput = { x: 0, y: 0, pick: false, work: false, dash: false };
const pick: PlayerInput = { ...idle, pick: true };
let game: KitchenEngine;
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  game = new KitchenEngine(); game.start(true);
  Object.assign(game.state.chefs[0], { x: 0, z: -1.5, facing: Math.PI / 2 });
});
function tick(seconds: number, inputs: PlayerInput[] = []): void {
  for (let t = 0; t < seconds - 1e-9; t += .02) game.update(Math.min(.02, seconds - t), inputs);
}
function target(kind: StationKind) {
  const station = game.state.stations.find(s => s.kind === kind)!;
  Object.assign(game.state.chefs[0], { x: station.x, z: station.z + 1.25, facing: Math.PI });
  return station;
}

describe('interaction hop sampling', () => {
  it('starts and settles exactly at ground level, with a small bounded apex', () => {
    const cue = { startedAt: 10 };
    expect(sampleChefHop(undefined, 10, false)).toBe(0);
    for (const age of [-1, 0, CHEF_HOP_SECONDS, 1]) expect(sampleChefHop(cue, 10 + age, false)).toBe(0);
    expect(sampleChefHop(cue, 10 + CHEF_HOP_SECONDS / 2, false)).toBeCloseTo(CHEF_HOP_HEIGHT);
    for (let t = 0; t < CHEF_HOP_SECONDS; t += .001) {
      const lift = sampleChefHop(cue, 10 + t, false);
      expect(lift).toBeGreaterThanOrEqual(0); expect(lift).toBeLessThanOrEqual(CHEF_HOP_HEIGHT);
    }
  });
  it('has smooth takeoff, apex and landing without dependence on frame rate', () => {
    const cue = { startedAt: 0 }, dt = .0001;
    expect(sampleChefHop(cue, dt, false) / dt).toBeLessThan(.002);
    expect(sampleChefHop(cue, CHEF_HOP_SECONDS - dt, false) / dt).toBeLessThan(.002);
    expect(sampleChefHop(cue, .19 - dt, false)).toBeCloseTo(sampleChefHop(cue, .19 + dt, false), 10);
    for (const fps of [30, 60, 144]) {
      let elapsed = 0;
      while (elapsed < .18 - 1e-9) { elapsed += Math.min(1 / fps, .18 - elapsed); sampleChefHop(cue, elapsed, false); }
      expect(sampleChefHop(cue, elapsed, false)).toBeCloseTo(sampleChefHop(cue, .18, false), 10);
    }
  });
  it('suppresses all lift under reduced motion without changing the cue', () => {
    const cue = { startedAt: 0 };
    expect(sampleChefHop(cue, .19, true)).toBe(0);
    expect(sampleChefHop(cue, .19, false)).toBe(CHEF_HOP_HEIGHT);
    expect(cue).toEqual({ startedAt: 0 });
  });
});

describe('visual-only hop lifecycle', () => {
  it('responds in open space without creating a successful-action particle effect', () => {
    game.update(.02, [pick]);
    expect(game.state.chefs[0].near).toBeNull();
    expect(game.chefHops.get(0)).toEqual({ startedAt: .02 });
    tick(.1); expect(sampleChefHop(game.chefHops.get(0), game.state.elapsed, false)).toBeGreaterThan(0);
    expect(game.actionEffects).toHaveLength(0);
  });
  it('picks and places immediately even while a previous hop is airborne', () => {
    target('lettuce'); game.update(.02, [pick]);
    expect(game.state.chefs[0].held).toEqual({ kind: 'lettuce', state: 'raw' });
    const cue = game.chefHops.get(0);
    tick(.08);
    const board = target('board'); game.update(.02, [pick]);
    expect(game.state.chefs[0].held).toBeNull(); expect(board.item).toEqual({ kind: 'lettuce', state: 'raw' });
    expect(game.chefHops.get(0)).toBe(cue);
    expect(game.actionEffects).toHaveLength(1); expect(game.actionEffects[0].kind).toBe('place');
  });
  it('hops on a blocked interaction without changing inventory or fabricating success', () => {
    const board = target('board'); board.item = { kind: 'tomato', state: 'raw' };
    game.state.chefs[0].held = { kind: 'lettuce', state: 'raw' };
    game.update(.02, [pick]);
    expect(game.chefHops.has(0)).toBe(true); expect(game.actionEffects).toHaveLength(0);
    expect(board.item).toEqual({ kind: 'tomato', state: 'raw' });
    expect(game.state.chefs[0].held).toEqual({ kind: 'lettuce', state: 'raw' });
  });
  it('does not restart or queue hops on rapid presses, then accepts a press after landing', () => {
    game.update(.02, [pick]); const cue = game.chefHops.get(0);
    tick(.3, [pick]); expect(game.chefHops.get(0)).toBe(cue); expect(game.chefHops.size).toBe(1);
    tick(.1); expect(game.chefHops.size).toBe(0);
    game.update(.02, [pick]); expect(game.chefHops.get(0)?.startedAt).toBe(game.state.elapsed);
    tick(1); expect(game.chefHops.size).toBe(0);
  });
  it('keeps co-op timing independent and ignores P2 in solo', () => {
    game.update(.02, [idle, pick]); expect(game.chefHops.size).toBe(0);
    game.select(0, 'coop'); game.start(true);
    game.update(.02, [pick, idle]); tick(.1); game.update(.02, [idle, pick]);
    expect(game.chefHops.size).toBe(2);
    expect(game.chefHops.get(0)?.startedAt).toBe(.02);
    expect(game.chefHops.get(1)?.startedAt).toBe(game.state.elapsed);
    tick(.28); expect(game.chefHops.has(0)).toBe(false); expect(game.chefHops.has(1)).toBe(true);
  });
  it('freezes in midair on pause, ignores paused input and resumes to an exact landing', () => {
    game.update(.02, [pick]); tick(.19); game.pause(true);
    const cue = game.chefHops.get(0), time = game.state.elapsed, lift = sampleChefHop(cue, time, false);
    tick(2, [pick, pick]); expect(game.state.elapsed).toBe(time); expect(game.chefHops.get(0)).toBe(cue);
    expect(sampleChefHop(cue, game.state.elapsed, false)).toBe(lift);
    game.pause(false); tick(.2); expect(game.chefHops.size).toBe(0);
  });
  it.each(['restart', 'menu', 'select', 'finish'] as const)('clears hops on %s and prevents non-playing input', action => {
    game.start(); game.update(.02, [pick]);
    if (action === 'restart') game.start();
    if (action === 'menu') game.setPhase('menu');
    if (action === 'select') game.select(0, 'coop');
    if (action === 'finish') game.finish();
    expect(game.chefHops.size).toBe(0);
    game.setPhase('briefing'); tick(.4, [pick, pick]); expect(game.chefHops.size).toBe(0);
  });
  it.each([false, true])('does not affect movement, dash or collision (dash=%s)', dash => {
    const baseline = new KitchenEngine(); baseline.start(true);
    for (const engine of [game, baseline]) Object.assign(engine.state.chefs[0], { x: 0, z: -1.5, held: { kind: 'plate', parts: ['tomato:chopped'] } });
    for (let step = 0; step < 60; step++) {
      const move = { ...idle, x: step < 15 ? 1 : 0, y: step >= 15 ? 1 : 0, dash: dash && step === 0 };
      game.update(.02, [{ ...move, pick: step % 6 === 0 }]); baseline.update(.02, [move]);
      const physics = (engine: KitchenEngine) => {
        const { x, z, facing, moving, working, dash, cooldown, near } = engine.state.chefs[0];
        return { x, z, facing, moving, working, dash, cooldown, near };
      };
      expect(physics(game)).toEqual(physics(baseline));
      expect(game.state.score).toBe(baseline.state.score);
    }
    expect(game.canMove(0, -3.5)).toBe(false);
  });
  it('keeps carried food attached while hopping away from stations', () => {
    const food = { kind: 'plate' as const, parts: ['tomato:chopped', 'lettuce:chopped'] };
    game.state.chefs[0].held = food; game.update(.02, [pick]); tick(.2);
    expect(game.state.chefs[0].held).toBe(food); expect(game.state.chefs[0].near).toBeNull();
    expect(sampleChefHop(game.chefHops.get(0), game.state.elapsed, false)).toBeGreaterThan(.2);
  });
  it('does not turn held work into repeated hops or slow chopping', () => {
    const board = target('board'); board.item = { kind: 'tomato', state: 'raw' };
    tick(1.8, [{ ...idle, work: true }]);
    expect(game.chefHops.size).toBe(0); expect(board.item).toEqual({ kind: 'tomato', state: 'chopped' });
  });
});
