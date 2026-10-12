import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KitchenEngine } from '@/game/engine';
import { ACTION_EFFECT_LIFETIME, MAX_ACTION_EFFECTS, PARTICLES_PER_ACTION, latestChefAction, sampleActionParticle, sampleChefAction } from '@/game/action-feedback';
import type { ChefActionEffect, Item, PlayerInput, Station, StationKind } from '@/game/types';

const idle: PlayerInput = { x: 0, y: 0, pick: false, work: false, dash: false };
let game: KitchenEngine;
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  game = new KitchenEngine(); game.start(true);
});
function station(kind: StationKind): Station { return game.state.stations.find(st => st.kind === kind)!; }
function target(st: Station, id = 0): void {
  Object.assign(game.state.chefs[id], { x: st.x, z: st.z + 1.25, facing: Math.PI });
  game.update(0, []);
  expect(game.state.chefs[id].near).toBe(st.id);
}
function tick(seconds: number, inputs: PlayerInput[] = []): void {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += .02) game.update(Math.min(.02, seconds - elapsed), inputs);
}
function place(item: Item = { kind: 'lettuce', state: 'raw' }, st = station('board'), id = 0): void {
  game.state.chefs[id].held = item;
  game.interact(game.state.chefs[id], st);
}

describe('successful action cues', () => {
  it.each(['board', 'counter', 'grill'] as const)('emits exactly one station-anchored placement for %s', kind => {
    const st = station(kind); const item: Item = kind === 'grill' ? { kind: 'patty', state: 'raw' } : { kind: 'tomato', state: 'raw' };
    target(st); game.state.chefs[0].held = item;
    game.update(.02, [{ ...idle, pick: true }]);
    expect(st.item).toEqual(item); expect(game.state.chefs[0].held).toBeNull();
    expect(game.actionEffects).toHaveLength(1);
    expect(game.actionEffects[0]).toMatchObject({ kind: 'place', chefId: 0, stationId: st.id, x: st.x, z: st.z, startedAt: game.state.elapsed, ingredient: item.kind });
    tick(.2); expect(game.actionEffects).toHaveLength(1);
  });

  it('celebrates adding prepared food to a station plate, not collecting food onto a held plate', () => {
    const st = station('counter'); st.item = { kind: 'plate', parts: [] };
    place({ kind: 'tomato', state: 'chopped' }, st);
    expect(game.actionEffects).toHaveLength(1);
    expect(st.item).toEqual({ kind: 'plate', parts: ['tomato:chopped'] });
    game.actionEffects = [];
    st.item = { kind: 'lettuce', state: 'chopped' };
    game.state.chefs[0].held = { kind: 'plate', parts: [] };
    game.interact(game.state.chefs[0], st);
    expect(game.actionEffects).toHaveLength(0);
    expect(st.item).toBeNull();
    game.interact(game.state.chefs[0], st);
    expect(game.actionEffects).toHaveLength(1);
  });

  it('does not celebrate blocked, invalid, duplicate, burning, or discarded placements', () => {
    const st = station('counter');
    st.item = { kind: 'bun', state: 'raw' }; place({ kind: 'tomato', state: 'raw' }, st);
    st.item = { kind: 'plate', parts: [] }; place({ kind: 'tomato', state: 'raw' }, st);
    st.item = { kind: 'plate', parts: ['tomato:chopped'] }; place({ kind: 'tomato', state: 'chopped' }, st);
    st.item = null; st.fire = 1; place({ kind: 'bun', state: 'raw' }, st);
    place({ kind: 'bun', state: 'raw' }, station('grill'));
    place({ kind: 'bun', state: 'raw' }, station('sink'));
    place({ kind: 'bun', state: 'raw' }, station('trash'));
    place({ kind: 'tomato', state: 'raw' }, station('tomato'));
    expect(game.actionEffects).toHaveLength(0);
  });

  it.each<Item>([{ kind: 'dirty' }, { kind: 'plate', parts: [] }, { kind: 'extinguisher' }])('does not celebrate non-food placement: $kind', item => {
    place(item, station('counter')); expect(game.actionEffects).toHaveLength(0);
    game.interact(game.state.chefs[0], station('counter')); expect(game.actionEffects).toHaveLength(0);
  });

  it('emits washing only on completion, exactly once even while Work is held', () => {
    const sink = station('sink'); place({ kind: 'dirty' }, sink); target(sink);
    tick(2.4, [{ ...idle, work: true }]); expect(game.actionEffects).toHaveLength(0);
    tick(.12, [{ ...idle, work: true }]);
    expect(sink.item).toEqual({ kind: 'plate', parts: [] });
    expect(game.actionEffects).toHaveLength(1);
    const id = game.actionEffects[0].id;
    expect(game.actionEffects[0]).toMatchObject({ kind: 'wash', chefId: 0, stationId: sink.id });
    tick(.5, [{ ...idle, work: true }]); expect(game.actionEffects.map(effect => effect.id)).toEqual([id]);
    tick(1, [{ ...idle, work: true }]); expect(game.actionEffects).toHaveLength(0);
  });

  it('requires hands-free work and never turns chopping into a wash celebration', () => {
    const sink = station('sink'); sink.item = { kind: 'dirty' }; target(sink);
    game.state.chefs[0].held = { kind: 'bun', state: 'raw' };
    tick(3, [{ ...idle, work: true }]); expect(game.actionEffects).toHaveLength(0);
    game.state.chefs[0].held = null;
    const board = station('board'); board.item = { kind: 'tomato', state: 'raw' }; target(board);
    tick(2, [{ ...idle, work: true }]); expect(game.actionEffects.length).toBeGreaterThan(0);
    expect(game.actionEffects.every(effect => effect.kind === 'chop')).toBe(true);
  });

  it('keeps co-op chef reactions independent when place and wash succeed together', () => {
    game.select(0, 'coop'); game.start(true);
    const board = station('board'), sink = station('sink');
    target(board, 0); target(sink, 1);
    game.state.chefs[0].held = { kind: 'tomato', state: 'raw' };
    sink.item = { kind: 'dirty' }; sink.progress = .999;
    game.update(.02, [{ ...idle, pick: true }, { ...idle, work: true }]);
    expect(latestChefAction(game.actionEffects, 0)?.kind).toBe('place');
    expect(latestChefAction(game.actionEffects, 1)?.kind).toBe('wash');
    expect(game.actionEffects).toHaveLength(2);
  });

  it('credits only the chef who completes a shared sink and excludes the inactive solo chef', () => {
    const sink = station('sink'); sink.item = { kind: 'dirty' }; sink.progress = .999;
    Object.assign(game.state.chefs[1], { x: sink.x, z: sink.z + 1.25, facing: Math.PI });
    game.update(.02, [idle, { ...idle, work: true }]); expect(game.actionEffects).toHaveLength(0);
    game.select(0, 'coop'); game.start(true);
    const shared = station('sink'); shared.item = { kind: 'dirty' }; shared.progress = .99;
    target(shared, 0); target(shared, 1);
    game.update(.05, [{ ...idle, work: true }, { ...idle, work: true }]);
    expect(game.actionEffects).toHaveLength(1); expect(game.actionEffects[0].chefId).toBe(0);
  });

  it('freezes cue age and all sampled poses/particles while paused, then expires', () => {
    place(); tick(.1);
    const effect = game.actionEffects[0];
    const pose = sampleChefAction(effect, game.state.elapsed, false);
    const particle = sampleActionParticle(effect, 2, game.state.elapsed);
    game.pause(true); tick(5);
    expect(sampleChefAction(effect, game.state.elapsed, false)).toEqual(pose);
    expect(sampleActionParticle(effect, 2, game.state.elapsed)).toEqual(particle);
    expect(game.actionEffects).toEqual([effect]);
    game.pause(false); tick(.7); expect(game.actionEffects).toHaveLength(0);
  });

  it('clears feedback on restart, navigation, layout selection, and shift end', () => {
    place(); game.start(); expect(game.actionEffects).toHaveLength(0);
    place(); game.setPhase('menu'); expect(game.actionEffects).toHaveLength(0);
    game.start(); place(); game.select(0, 'coop'); expect(game.actionEffects).toHaveLength(0);
    game.start(); place(); game.finish(); expect(game.actionEffects).toHaveLength(0);
  });

  it('bounds rapid repeated effects, uses unique IDs, and never changes collision or inventory', () => {
    const st = station('board'); const chef = game.state.chefs[0]; const position = [chef.x, chef.z];
    for (let i = 0; i < 100; i++) { place({ kind: 'tomato', state: 'raw' }, st); game.interact(chef, st); }
    expect(game.actionEffects).toHaveLength(MAX_ACTION_EFFECTS);
    expect(new Set(game.actionEffects.map(effect => effect.id)).size).toBe(MAX_ACTION_EFFECTS);
    expect(chef.held).toEqual({ kind: 'tomato', state: 'raw' });
    expect([chef.x, chef.z]).toEqual(position);
    expect(game.canMove(st.x, st.z)).toBe(false);
  });
});

describe('action animation sampling', () => {
  const makeEffect = (kind: ChefActionEffect['kind']): ChefActionEffect => ({ id: 1, kind, chefId: 0, stationId: 'test', x: 2, z: 3, startedAt: 10 });
  it.each(['place', 'wash'] as const)('%s squashes, stretches, preserves volume, and settles exactly', kind => {
    const effect = makeEffect(kind);
    const squash = sampleChefAction(effect, 10.07, false);
    const stretch = sampleChefAction(effect, kind === 'place' ? 10.16 : 10.22, false);
    expect(squash.height).toBeLessThan(1); expect(squash.width).toBeGreaterThan(1);
    expect(stretch.height).toBeGreaterThan(1); expect(stretch.width).toBeLessThan(1);
    expect(stretch.width ** 2 * stretch.height).toBeCloseTo(1);
    if (kind === 'place') expect(stretch.lift).toBe(0);
    else expect(stretch.lift).toBeGreaterThan(0);
    for (const age of [-1, 0, 1, 10]) expect(sampleChefAction(effect, 10 + age, false)).toEqual({ width: 1, height: 1, lift: 0 });
    expect(sampleChefAction(effect, 10.2, true)).toEqual({ width: 1, height: 1, lift: 0 });
  });

  it('gives washing a taller rebound and hop than placing', () => {
    const wash = sampleChefAction(makeEffect('wash'), 10.22, false);
    const placePose = sampleChefAction(makeEffect('place'), 10.16, false);
    expect(wash.height).toBeGreaterThan(placePose.height); expect(wash.lift).toBeGreaterThan(0);
  });

  it.each(['place', 'wash'] as const)('%s particles are distinct, bounded, deterministic, and finite', kind => {
    const effect = makeEffect(kind);
    for (let i = 0; i < PARTICLES_PER_ACTION; i++) {
      const p = sampleActionParticle(effect, i, 10.2)!;
      expect(p).toEqual(sampleActionParticle(effect, i, 10.2));
      expect(p.shape).toBe(i >= 12 ? 'sparkle' : kind === 'place' ? 'seasoning' : 'bubble');
      expect(Math.hypot(p.x - effect.x, p.z - effect.z)).toBeLessThan(1.2);
      expect(p.y).toBeGreaterThan(1.6); expect(p.size).toBeGreaterThan(0);
      expect(sampleActionParticle(effect, i, 10 + ACTION_EFFECT_LIFETIME[kind] + .001)).toBeNull();
    }
  });
});
