import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { KitchenEngine } from '@/game/engine';
import { EMOTION_SECONDS, sampleChefEmotion, type ChefEmotionCue } from '@/game/chef-emotion';
import { createChefRig } from '@/scene/chef-model';
import { RECIPES } from '@/game/config';
import type { Item, PlayerInput, Station, StationKind } from '@/game/types';

const idle: PlayerInput = { x: 0, y: 0, pick: false, work: false, dash: false };
let game: KitchenEngine;
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  game = new KitchenEngine(); game.select(0, 'coop'); game.start(true);
});
function station(kind: StationKind): Station { return game.state.stations.find(st => st.kind === kind)!; }
function tick(seconds: number): void { for (let t = 0; t < seconds - 1e-9; t += .02) game.update(Math.min(.02, seconds - t), []); }
function combine(id = 0, onCounter = false, burger = false): void {
  const c = game.state.chefs[id], st = station('counter');
  const plate: Item = { kind: 'plate', parts: burger ? ['lettuce:chopped', 'tomato:chopped', 'bun:raw'] : ['lettuce:chopped'] };
  const food: Item = burger ? { kind: 'patty', state: 'cooked' } : { kind: 'tomato', state: 'chopped' };
  c.held = onCounter ? food : plate; st.item = onCounter ? plate : food;
  game.interact(c, st);
}
function grill(id = 0, st = station('grill')): Station {
  game.state.chefs[id].held = { kind: 'patty', state: 'raw' };
  game.interact(game.state.chefs[id], st); return st;
}
function burn(st = station('grill')): void {
  st.heat = 14.99; if (st.item?.kind === 'patty') st.item.state = 'cooked'; game.update(.02, []);
}

describe('event-driven chef emotions', () => {
  it.each([false, true])('celebrates complete salad and burger, counter plate = %s', onCounter => {
    combine(0, onCounter);
    expect(game.chefEmotions.get(0)?.kind).toBe('happy'); expect(game.chefEmotions.has(1)).toBe(false);
    tick(3.1); expect(game.chefEmotions.size).toBe(0);
    combine(1, onCounter, true); expect(game.chefEmotions.get(1)?.kind).toBe('happy');
  });
  it('does not celebrate partial, duplicate, raw or blocked food combinations', () => {
    const c = game.state.chefs[0], st = station('counter');
    st.item = { kind: 'plate', parts: [] }; c.held = { kind: 'tomato', state: 'chopped' }; game.interact(c, st);
    c.held = { kind: 'tomato', state: 'chopped' }; game.interact(c, st);
    c.held = { kind: 'lettuce', state: 'raw' }; game.interact(c, st);
    st.fire = 1; c.held = { kind: 'lettuce', state: 'chopped' }; game.interact(c, st);
    expect(game.chefEmotions.size).toBe(0);
  });
  it('does not retrigger by picking up or putting down a finished dish', () => {
    combine(); tick(3.1); const c = game.state.chefs[0], st = station('counter');
    game.interact(c, st); game.interact(c, st); expect(game.chefEmotions.size).toBe(0);
  });
  it('celebrates actual delivery, not failed orders, without changing scoring', () => {
    const c = game.state.chefs[1], serve = station('serve');
    c.held = { kind: 'plate', parts: [...RECIPES.burger.parts] }; game.interact(c, serve);
    expect(game.chefEmotions.size).toBe(0); expect(game.state.served).toBe(0);
    c.held = { kind: 'plate', parts: [...RECIPES.salad.parts] }; game.interact(c, serve);
    expect(game.state.served).toBe(1); expect(game.state.score).toBe(70); expect(c.held).toBeNull();
    expect(game.chefEmotions.get(1)?.kind).toBe('happy'); expect(game.chefEmotions.has(0)).toBe(false);
  });
  it('attributes burnt food to the chef who placed it, not the nearest teammate', () => {
    const st = grill(1); const other = game.state.chefs[0];
    Object.assign(other, { x: st.x, z: st.z + 1.25, facing: Math.PI });
    st.heat = 4.99; game.update(.02, []); expect(st.item).toMatchObject({ state: 'cooked' }); expect(game.chefEmotions.size).toBe(0);
    burn(st); expect(game.chefEmotions.get(1)?.kind).toBe('disappointed'); expect(game.chefEmotions.has(0)).toBe(false);
    const cue = game.chefEmotions.get(1); tick(1); expect(game.chefEmotions.get(1)).toBe(cue);
    tick(6); expect(st.fire).toBe(1); expect(game.chefEmotions.size).toBe(0);
  });
  it('reassigns a removed and replaced raw patty and never blames a stale grill owner', () => {
    const st = grill(0); game.interact(game.state.chefs[1], st);
    game.interact(game.state.chefs[1], st); burn(st);
    expect(game.chefEmotions.get(1)?.kind).toBe('disappointed'); expect(game.chefEmotions.has(0)).toBe(false);
    tick(4); st.item = null; st.fire = 0; grill(0, st); burn(st);
    expect(game.chefEmotions.get(0)?.kind).toBe('disappointed'); expect(game.chefEmotions.has(1)).toBe(false);
  });
  it('supports simultaneous independent happy and disappointed faces via actual player input', () => {
    const st = grill(1), counter = station('counter'), c = game.state.chefs[0];
    st.heat = 14.99; if (st.item?.kind === 'patty') st.item.state = 'cooked';
    counter.item = { kind: 'tomato', state: 'chopped' }; c.held = { kind: 'plate', parts: ['lettuce:chopped'] };
    Object.assign(c, { x: counter.x, z: counter.z + 1.25, facing: Math.PI });
    game.update(.02, [{ ...idle, pick: true }, idle]);
    expect([...game.chefEmotions.values()].map(cue => cue.kind)).toEqual(['happy', 'disappointed']);
  });
  it('keeps ownership independent on two grills burning at once', () => {
    const grills = game.state.stations.filter(st => st.kind === 'grill');
    grills.forEach((st, i) => { grill(i, st); st.heat = 14.99; if (st.item?.kind === 'patty') st.item.state = 'cooked'; });
    game.update(.02, []); expect(game.chefEmotions.size).toBe(2);
    expect([...game.chefEmotions.values()].every(cue => cue.kind === 'disappointed')).toBe(true);
  });
  it('smoothly interrupts joy with disappointment and allows recovery through a new dish', () => {
    const st = grill(); combine(); tick(.5);
    const previous = sampleChefEmotion(game.chefEmotions.get(0), game.state.elapsed); burn(st);
    expect(sampleChefEmotion(game.chefEmotions.get(0), game.state.elapsed)).toEqual(previous);
    tick(.3); expect(sampleChefEmotion(game.chefEmotions.get(0), game.state.elapsed)).toEqual({ happy: 0, disappointed: 1 });
    combine(); tick(.3); expect(sampleChefEmotion(game.chefEmotions.get(0), game.state.elapsed)).toEqual({ happy: 1, disappointed: 0 });
    expect(game.chefEmotions.size).toBe(1);
  });
  it('freezes expression blends and cooking during pause and expires after resume', () => {
    const st = grill(1); combine(); tick(.08); st.heat = 14.99;
    const pose = sampleChefEmotion(game.chefEmotions.get(0), game.state.elapsed);
    game.pause(true); tick(20);
    expect(sampleChefEmotion(game.chefEmotions.get(0), game.state.elapsed)).toEqual(pose); expect(st.heat).toBe(14.99);
    game.pause(false); tick(4); expect(game.chefEmotions.size).toBe(0);
  });
  it.each(['restart', 'menu', 'select', 'finish'] as const)('clears cues and ownership at %s', action => {
    const st = grill(1), oldItem = st.item; combine();
    if (action === 'restart') game.start(true);
    if (action === 'menu') game.setPhase('menu');
    if (action === 'select') game.select(0, 'solo');
    if (action === 'finish') { game.state.practice = false; game.finish(); }
    expect(game.chefEmotions.size).toBe(0);
    game.start(true); const newGrill = station('grill'); newGrill.item = oldItem; burn(newGrill);
    expect(game.chefEmotions.size).toBe(0);
  });
  it('excludes inactive solo chef and suppresses reactions outside active play', () => {
    game.select(0, 'solo'); game.start(true); combine(1); expect(game.chefEmotions.size).toBe(0);
    game.pause(true); combine(); expect(game.chefEmotions.size).toBe(0);
    game.setPhase('menu'); combine(); expect(game.chefEmotions.size).toBe(0);
  });
});

describe('facial blending', () => {
  it.each(['happy', 'disappointed'] as const)('%s eases in, holds, and returns exactly to neutral', kind => {
    const cue: ChefEmotionCue = { kind, startedAt: 10, from: { happy: 0, disappointed: 0 } };
    expect(sampleChefEmotion(cue, 10)[kind]).toBe(0);
    expect(sampleChefEmotion(cue, 10.1)[kind]).toBeCloseTo(.5);
    expect(sampleChefEmotion(cue, 11)[kind]).toBe(1);
    expect(sampleChefEmotion(cue, 10 + EMOTION_SECONDS[kind] - .1)[kind]).toBeLessThan(.1);
    expect(sampleChefEmotion(cue, 10 + EMOTION_SECONDS[kind])).toEqual({ happy: 0, disappointed: 0 });
    expect(sampleChefEmotion(cue, 9)).toEqual({ happy: 0, disappointed: 0 });
  });
  it('reduced motion retains a static readable face, no blink or animated transition needed', () => {
    const cue: ChefEmotionCue = { kind: 'disappointed', startedAt: 0, from: { happy: 1, disappointed: 0 } };
    expect(sampleChefEmotion(cue, 0, true)).toEqual({ happy: 0, disappointed: 1 });
    expect(sampleChefEmotion(cue, .1, true)).toEqual(sampleChefEmotion(cue, 3.5, true));
    expect(sampleChefEmotion(cue, 4, true)).toEqual({ happy: 0, disappointed: 0 });
  });
  it.each([0, 1])('chef %i preserves editable features after batching and restores neutral without drift', id => {
    const rig = createChefRig(id), face = rig.face;
    try {
      const baseline = face.brows.map(b => b.rotation.z);
      const neutralEye = face.eyeJoints[0].position.toArray();
      const positions = face.mouth.geometry.getAttribute('position');
      expect(face.mouth.geometry.morphAttributes.position).toHaveLength(2);
      face.mouth.geometry.morphAttributes.position.forEach(attr => { expect(attr.count).toBe(positions.count); expect([...attr.array].every(Number.isFinite)).toBe(true); });
      const geometry = face.mouth.geometry;
      face.apply({ happy: 1, disappointed: 0 }, 1);
      expect(face.mouth.morphTargetInfluences).toEqual([1, 0]); expect(face.smileEyes[0].scale.x).toBe(1); expect(face.smileEyes[0].visible).toBe(true);
      face.apply({ happy: 0, disappointed: 1 }, 1);
      expect(face.brows[0].rotation.z).toBeGreaterThan(0); expect(face.brows[1].rotation.z).toBeLessThan(0);
      expect(face.pupils[0].position.y).toBeLessThan(-.02);
      face.apply({ happy: 0, disappointed: 0 }, .1);
      expect(face.eyeJoints[0].position.toArray()).toEqual(neutralEye);
      face.apply({ happy: 0, disappointed: 0 }, 1);
      expect(face.brows.map(b => b.rotation.z)).toEqual(baseline); expect(face.mouth.morphTargetInfluences).toEqual([0, 0]); expect(face.smileEyes[0].visible).toBe(false);
      expect(face.mouth.geometry).toBe(geometry); expect(rig.root.getObjectByName('brow--1')).toBe(face.brows[0]);
      expect(new THREE.Box3().setFromObject(rig.root).isEmpty()).toBe(false);
    } finally { rig.dispose(); }
  });
  it('does not share facial weights or dispose another player’s geometry', () => {
    const first = createChefRig(0), second = createChefRig(1);
    const released = vi.fn(); second.face.mouth.geometry.addEventListener('dispose', released);
    first.face.apply({ happy: 1, disappointed: 0 }, 1); first.dispose();
    expect(second.face.mouth.morphTargetInfluences).toEqual([0, 0]); expect(released).not.toHaveBeenCalled();
    second.dispose(); expect(released).toHaveBeenCalledOnce();
  });
});
