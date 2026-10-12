import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KitchenEngine } from '@/game/engine';
import { CHOP_CUTS, CHOP_SECONDS, completedCuts, isVegetable, knifeLift, latestChop, sliceSettle } from '@/game/chopping';
import { MAX_ACTION_EFFECTS, sampleActionParticle, sampleChefAction } from '@/game/action-feedback';
import type { ChefActionEffect, Item, PlayerInput, Station } from '@/game/types';

const idle: PlayerInput = { x: 0, y: 0, pick: false, work: false, dash: false };
const work: PlayerInput = { ...idle, work: true };
let game: KitchenEngine;
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  game = new KitchenEngine(); game.start(true);
});
function prepare(id = 0, st = game.state.stations.find(s => s.kind === 'board')!, kind: 'tomato' | 'lettuce' = 'tomato'): Station {
  st.item = { kind, state: 'raw' };
  Object.assign(game.state.chefs[id], { x: st.x, z: st.z + 1.25, facing: Math.PI, held: null });
  game.update(0, []); return st;
}
function tick(seconds: number, inputs: PlayerInput[] = [work], step = .02): ChefActionEffect[] {
  const seen = new Map<number, ChefActionEffect>();
  for (let t = 0; t < seconds - 1e-9; t += step) {
    game.update(Math.min(step, seconds - t), inputs);
    game.actionEffects.filter(e => e.kind === 'chop').forEach(e => seen.set(e.id, e));
  }
  return [...seen.values()];
}

describe('board contact beats', () => {
  it.each([.01, .02, 1 / 30, .05])('creates exactly six cuts and sounds in 1.8s at %ss steps', step => {
    const board = prepare(); const sound = vi.fn(); game.onSound = sound;
    const events = tick(CHOP_SECONDS, [work], step);
    expect(events.map(e => e.cutIndex)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events.every(e => e.item === board.item && e.ingredient === 'tomato' && e.chefId === 0)).toBe(true);
    expect(sound.mock.calls.map(c => c[0])).toEqual(Array(CHOP_CUTS).fill('chop'));
    expect(board.item).toEqual({ kind: 'tomato', state: 'chopped' });
    expect(board.progress).toBe(0);
    sound.mockClear(); tick(1); expect(sound).not.toHaveBeenCalled();
  });

  it('does not emit sound or slices until the first knife contact', () => {
    const board = prepare(); const sound = vi.fn(); game.onSound = sound;
    tick(.28); expect(completedCuts(board.progress)).toBe(0); expect(sound).not.toHaveBeenCalled();
    tick(.02); expect(completedCuts(board.progress)).toBe(1); expect(sound).toHaveBeenCalledOnce();
    expect(latestChop(game.actionEffects, board)?.cutIndex).toBe(1);
  });

  it('preserves partial work while released, away, or paused; resumes without replaying cuts', () => {
    const board = prepare(); tick(.74); const progress = board.progress;
    tick(.5, []); expect(board.progress).toBe(progress); expect(game.state.chefs[0].working).toBe(false);
    game.state.chefs[0].z = board.z + 4; tick(.5); expect(board.progress).toBe(progress);
    game.state.chefs[0].z = board.z + 1.25;
    game.pause(true); const time = game.state.elapsed; tick(2); expect(board.progress).toBe(progress); expect(game.state.elapsed).toBe(time);
    game.pause(false); const events = tick(1.06);
    expect(events.map(e => e.cutIndex)).toEqual([3, 4, 5, 6]);
    expect(isVegetable(board.item) && board.item.state).toBe('chopped');
  });

  it('retains additive co-op speed on one board but never duplicates contact indices', () => {
    game.select(0, 'coop'); game.start(true); const board = prepare();
    Object.assign(game.state.chefs[1], { x: board.x, z: board.z - 1.25, facing: 0 });
    const sound = vi.fn(); game.onSound = sound;
    const events = tick(.9, [work, work]);
    expect(events.map(e => e.cutIndex)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(sound).toHaveBeenCalledTimes(6); expect(isVegetable(board.item) && board.item.state).toBe('chopped');
  });

  it('emits independent beats at two boards, never throttled by washing or the other chef', () => {
    game.select(0, 'coop'); game.start(true);
    const boards = game.state.stations.filter(s => s.kind === 'board'); expect(boards.length).toBeGreaterThan(1);
    prepare(0, boards[0]); prepare(1, boards[1], 'lettuce');
    const sound = vi.fn(); game.onSound = sound;
    const events = tick(1.8, [work, work]);
    expect(events.filter(e => e.chefId === 0)).toHaveLength(6); expect(events.filter(e => e.chefId === 1)).toHaveLength(6);
    expect(sound).toHaveBeenCalledTimes(12); expect(game.actionEffects.length).toBeLessThanOrEqual(MAX_ACTION_EFFECTS);
  });

  it.each<Item | null>([null, { kind: 'patty', state: 'raw' }, { kind: 'bun', state: 'raw' }, { kind: 'plate', parts: [] }, { kind: 'tomato', state: 'chopped' }])('ignores invalid work on %j', item => {
    const board = prepare(); board.item = item;
    expect(tick(2)).toHaveLength(0); expect(board.progress).toBe(0);
  });

  it('ignores full hands, fire, and inactive solo chef', () => {
    const board = prepare(); game.state.chefs[0].held = { kind: 'bun', state: 'raw' };
    expect(tick(2)).toHaveLength(0); game.state.chefs[0].held = null; board.fire = 1;
    expect(tick(2)).toHaveLength(0); board.fire = 0; prepare(1, board);
    expect(tick(2, [idle, work])).toHaveLength(0);
  });

  it('does not reuse an old impact for a replacement of the same kind', () => {
    const board = prepare(); tick(.3); expect(latestChop(game.actionEffects, board)).toBeDefined();
    game.interact(game.state.chefs[0], board); expect(board.progress).toBe(0);
    expect(latestChop(game.actionEffects, board)).toBeUndefined();
    game.state.chefs[0].held = { kind: 'tomato', state: 'raw' }; game.interact(game.state.chefs[0], board);
    expect(latestChop(game.actionEffects, board)).toBeUndefined();
    const fresh = tick(.3).filter(effect => effect.item === board.item);
    expect(fresh[fresh.length - 1]?.cutIndex).toBe(1);
  });

  it('preserves prepared ingredients through pickup, counters, and plate assembly', () => {
    const board = prepare(); tick(1.8); const chef = game.state.chefs[0]; game.interact(chef, board);
    expect(chef.held).toEqual({ kind: 'tomato', state: 'chopped' });
    const counter = game.state.stations.find(s => s.kind === 'counter')!; game.interact(chef, counter);
    expect(counter.item).toEqual({ kind: 'tomato', state: 'chopped' });
    chef.held = { kind: 'plate', parts: [] }; game.interact(chef, counter);
    expect(chef.held).toEqual({ kind: 'plate', parts: ['tomato:chopped'] });
  });

  it('clears contacts on restart, navigation, selection and finish; honors mute', () => {
    prepare(); tick(.3); game.start(); expect(game.actionEffects).toHaveLength(0);
    prepare(); tick(.3); game.setPhase('menu'); expect(game.actionEffects).toHaveLength(0);
    game.start(); prepare(); tick(.3); game.select(0, 'coop'); expect(game.actionEffects).toHaveLength(0);
    game.start(); prepare(); const sound = vi.fn(); game.onSound = sound; game.setAudio('sound', false);
    tick(.3); expect(sound).not.toHaveBeenCalled(); expect(game.actionEffects).toHaveLength(1);
    game.finish(); expect(game.actionEffects).toHaveLength(0);
  });
});

describe('bounded cut animation', () => {
  it('raises before the downstroke and lands on contact', () => {
    expect(knifeLift(.1)).toBeGreaterThan(.3); expect(knifeLift(.1)).toBeLessThanOrEqual(.36); expect(knifeLift(1 / 6 - .001)).toBeLessThan(.01);
    expect(knifeLift(1 / 6)).toBe(0);
    expect(completedCuts(1 / 6 - 1e-12)).toBe(1);
    expect(sliceSettle(.1, false).hop).toBeGreaterThan(0);
    expect(sliceSettle(.1, true)).toEqual({ travel: 1, hop: 0 });
    expect(sliceSettle(.3, false)).toEqual({ travel: 1, hop: 0 });
  });
  it('samples seven low vegetable flecks with no wash celebration and freezes exactly on pause', () => {
    const board = prepare(); tick(.3); const effect = latestChop(game.actionEffects, board)!;
    tick(.1, []); const particles = Array.from({ length: 16 }, (_, i) => sampleActionParticle(effect, i, game.state.elapsed));
    expect(particles.filter(Boolean)).toHaveLength(7);
    for (const p of particles.filter(p => p !== null)) {
      expect(p.shape).toBe('seasoning'); expect(p.y).toBeLessThan(1.8);
      expect(Math.hypot(p.x - effect.x, p.z - effect.z)).toBeLessThan(.4);
    }
    expect(sampleChefAction(effect, game.state.elapsed, false)).toEqual({ width: 1, height: 1, lift: 0 });
    game.pause(true); tick(2);
    expect(particles).toEqual(Array.from({ length: 16 }, (_, i) => sampleActionParticle(effect, i, game.state.elapsed)));
    game.pause(false); tick(.4, []); expect(game.actionEffects).toHaveLength(0);
  });
});
