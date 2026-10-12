import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { cleanOutfits, DEFAULT_OUTFIT, OUTFIT_COLORS, outfitColor } from '@/game/chef-outfit';
import { KitchenEngine } from '@/game/engine';
import { loadOutfits } from '@/game/storage';
import { createChefRig } from '@/scene/chef-model';

const key = 'kitchen-rush-outfits-v1';
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('cosmetic preferences', () => {
  it('starts in cream with independent player objects', () => {
    const outfits = loadOutfits(); expect(outfits).toEqual([DEFAULT_OUTFIT, DEFAULT_OUTFIT]);
    expect(outfits[0]).not.toBe(outfits[1]); outfits[0].hat = 'teal'; expect(outfits[1].hat).toBe('cream');
  });
  it.each(['{bad json', 'null', '{}', '"tomato"'])('recovers corrupt storage %s', raw => {
    storage.set(key, raw); expect(loadOutfits()).toEqual([DEFAULT_OUTFIT, DEFAULT_OUTFIT]);
  });
  it('sanitizes each garment, ignores extras and never accepts arbitrary CSS', () => {
    expect(cleanOutfits([{ hat: 'gold', apron: 'url(unsafe)' }, { hat: 7, apron: 'dusk', ignored: true }, {}])).toEqual([{ hat: 'gold', apron: 'cream' }, { hat: 'cream', apron: 'dusk' }]);
  });
  it('preserves valid P2 choices even when P1 is missing', () => {
    expect(cleanOutfits([null, { hat: 'teal', apron: 'tomato' }])[1]).toEqual({ hat: 'teal', apron: 'tomato' });
  });
  it('updates only the chosen player and garment and survives a new engine', () => {
    const game = new KitchenEngine(), before = game.getSnapshot(); const listener = vi.fn(); game.subscribe(listener);
    game.setOutfitColor(0, 'hat', 'gold'); game.setOutfitColor(1, 'apron', 'dusk');
    expect(before.outfits).toEqual([DEFAULT_OUTFIT, DEFAULT_OUTFIT]); expect(listener).toHaveBeenCalledTimes(2);
    expect(game.state.outfits).toEqual([{ hat: 'gold', apron: 'cream' }, { hat: 'cream', apron: 'dusk' }]);
    expect(new KitchenEngine().state.outfits).toEqual(game.state.outfits);
  });
  it('never changes score storage, gameplay values or recipes', () => {
    storage.set('kitchen-rush-progress-v1', JSON.stringify({ solo: [900, 500, 0], coop: [800, 0, 0] }));
    const progress = storage.get('kitchen-rush-progress-v1'), game = new KitchenEngine();
    const { outfits: _outfits, revision: _revision, ...before } = game.getSnapshot();
    game.setOutfitColor(1, 'hat', 'tomato');
    const { outfits: _newOutfits, revision: _newRevision, ...after } = game.getSnapshot();
    expect(after).toEqual(before); expect(storage.get('kitchen-rush-progress-v1')).toBe(progress);
  });
  it('retains colors across mode, shift, practice, restart and results', () => {
    const game = new KitchenEngine(); game.setOutfitColor(0, 'hat', 'teal'); game.setOutfitColor(1, 'apron', 'gold');
    const expected = structuredClone(game.state.outfits);
    game.select(0, 'coop'); game.setPhase('briefing'); game.start(true); game.pause(true); game.pause(false); game.start(); game.finish(); game.setPhase('menu'); game.select(0, 'solo'); game.start();
    expect(game.state.outfits).toEqual(expected);
  });
  it('reset affects only the selected chef and persists', () => {
    const game = new KitchenEngine(); game.setOutfitColor(0, 'hat', 'apricot'); game.setOutfitColor(1, 'apron', 'tomato'); game.resetOutfit(0);
    expect(game.state.outfits).toEqual([DEFAULT_OUTFIT, { hat: 'cream', apron: 'tomato' }]); expect(loadOutfits()).toEqual(game.state.outfits);
  });
  it('allows briefing edits but rejects invalid values or editing during gameplay', () => {
    const game = new KitchenEngine(); game.setPhase('briefing'); game.setOutfitColor(1, 'hat', 'gold');
    game.setOutfitColor(-1, 'hat', 'teal'); game.setOutfitColor(2, 'hat', 'teal'); game.setOutfitColor(0, 'hat', '#fff'); game.resetOutfit(5);
    expect(game.state.outfits).toEqual([DEFAULT_OUTFIT, { hat: 'gold', apron: 'cream' }]);
    game.start(); game.setOutfitColor(0, 'apron', 'teal'); game.resetOutfit(1);
    expect(game.state.outfits).toEqual([DEFAULT_OUTFIT, { hat: 'gold', apron: 'cream' }]);
  });
  it('keeps session choices when storage fails, reports failure and can retry', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    const game = new KitchenEngine(); game.setOutfitColor(0, 'apron', 'teal');
    expect(game.state.outfits[0].apron).toBe('teal'); expect(game.state.outfitSaveFailed).toBe(true);
    vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) });
    game.setOutfitColor(0, 'apron', 'teal'); expect(game.state.outfitSaveFailed).toBe(false); expect(loadOutfits()[0].apron).toBe('teal');
  });
});

function fabric(rig: ReturnType<typeof createChefRig>, name: string): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  return rig.root.getObjectByName(`${name}-fabric-mesh`) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
}
describe('independent clothing material tints', () => {
  it.each([0, 1])('applies all palettes to chef %i without rebuilding geometry or touching skin/identity', id => {
    const rig = createChefRig(id), hat = fabric(rig, 'hat'), apron = fabric(rig, 'apron');
    const geo = hat.geometry, positions = geo.attributes.position, faces = rig.face.mouth.geometry.morphAttributes.position;
    const nonFabric: { mesh: THREE.Mesh; paint: string; vertices: number[] }[] = [];
    rig.root.traverse(node => {
      if (node instanceof THREE.Mesh && node !== hat && node !== apron) nonFabric.push({ mesh: node, paint: (node.material as THREE.MeshStandardMaterial).color.getHexString(), vertices: Array.from(node.geometry.attributes.color?.array ?? []) });
    });
    try {
      for (const color of OUTFIT_COLORS) {
        rig.setOutfit({ hat: color.id, apron: 'cream' });
        expect(hat.material.color.getHexString()).toBe(color.hex.slice(1).toLowerCase()); expect(apron.material.color.getHexString()).toBe('fff2d7');
        rig.setOutfit({ hat: 'cream', apron: color.id });
        expect(apron.material.color.getHexString()).toBe(color.hex.slice(1).toLowerCase()); expect(hat.material.color.getHexString()).toBe('fff2d7');
      }
      expect(hat.geometry).toBe(geo); expect(geo.attributes.position).toBe(positions); expect(rig.face.mouth.geometry.morphAttributes.position).toBe(faces);
      nonFabric.forEach(({ mesh, paint, vertices }) => { expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(paint); expect(Array.from(mesh.geometry.attributes.color?.array ?? [])).toEqual(vertices); });
    } finally { rig.dispose(); }
  });
  it('isolates preview/player instances and disposes clothing resources', () => {
    const one = createChefRig(0), two = createChefRig(0); const firstHat = fabric(one, 'hat'), secondHat = fabric(two, 'hat');
    const disposeMaterial = vi.fn(), disposeGeometry = vi.fn(); firstHat.material.addEventListener('dispose', disposeMaterial); firstHat.geometry.addEventListener('dispose', disposeGeometry);
    one.setOutfit({ hat: 'teal', apron: 'gold' }); expect(secondHat.material.color.getHexString()).toBe(outfitColor('cream').hex.slice(1).toLowerCase());
    expect(firstHat.material).not.toBe(secondHat.material); one.dispose(); expect(disposeMaterial).toHaveBeenCalledOnce(); expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(secondHat.material.color.getHexString()).toBe('fff2d7'); two.dispose();
  });
});
