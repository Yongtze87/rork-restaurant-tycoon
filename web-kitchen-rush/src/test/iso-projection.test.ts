import { describe, expect, it } from 'vitest';
import { cellAt, depthOf, facing, fitView, toGrid, toScreen } from '@/management/iso/projection';
import { createAmbience, stepAmbience } from '@/management/iso/ambience';
import { furnitureAt, seabedDecor } from '@/management/iso/render';
import { HEIGHT } from '@/management/types';

describe('isometric projection', () => {
  const view = fitView(800, 600, 10, HEIGHT);
  it('round-trips every cell center between grid and screen', () => {
    for (let x = 0; x < 10; x++) for (let z = 0; z < HEIGHT; z++) {
      const s = toScreen(view, x, z), g = toGrid(view, s.x, s.y);
      expect(g.x).toBeCloseTo(x, 6); expect(g.z).toBeCloseTo(z, 6);
      expect(cellAt(view, s.x, s.y, 10, HEIGHT)).toEqual({ x, z });
    }
  });
  it('rejects taps outside the editable grid', () => {
    const outside = toScreen(view, -1, 4), beyond = toScreen(view, 10, 4);
    expect(cellAt(view, outside.x, outside.y, 10, HEIGHT)).toBeNull();
    expect(cellAt(view, beyond.x, beyond.y, 10, HEIGHT)).toBeNull();
    expect(cellAt(view, beyond.x, beyond.y, 14, HEIGHT)).toEqual({ x: 10, z: 4 });
  });
  it('fits the whole floor on phone and desktop sizes, and zoom scales around the fit', () => {
    for (const [w, h] of [[320, 360], [390, 500], [1280, 640]]) {
      for (const columns of [10, 14]) {
        const v = fitView(w, h, columns, HEIGHT);
        for (const [x, z] of [[-.5, -.5], [columns - .5, -.5], [-.5, HEIGHT - .5], [columns - .5, HEIGHT - .5]]) {
          const p = toScreen(v, x, z); expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(w); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(h);
        }
      }
    }
    expect(fitView(800, 600, 10, HEIGHT, 2).scale).toBeCloseTo(view.scale * 2);
    const panned = fitView(800, 600, 10, HEIGHT, 1, { x: 30, y: -20 });
    expect(panned.originX - view.originX).toBe(30); expect(panned.originY - view.originY).toBe(-20);
  });
  it('draws nearer objects later and maps headings to front/back sprites with mirroring', () => {
    expect(depthOf(2, 3)).toBeLessThan(depthOf(3, 3));
    expect(facing(0)).toEqual({ back: false, flip: true });          // +z: down-left on screen
    expect(facing(Math.PI / 2)).toEqual({ back: false, flip: false }); // +x: down-right
    expect(facing(Math.PI)).toEqual({ back: true, flip: false });      // -z: up-right
    expect(facing(-Math.PI / 2)).toEqual({ back: true, flip: true });  // -x: up-left
  });
});

describe('scene helpers', () => {
  it('picks the front-most furniture under a tap', () => {
    const hits = [{ id: 1, left: 0, right: 100, top: 0, bottom: 50 }, { id: 2, left: 40, right: 140, top: 20, bottom: 80 }];
    expect(furnitureAt(hits, 60, 40)).toBe(2); expect(furnitureAt(hits, 10, 10)).toBe(1); expect(furnitureAt(hits, 200, 10)).toBeNull();
  });
  it('keeps seabed decoration off the playable floor and stable between frames', () => {
    for (const columns of [10, 14]) {
      const decor = seabedDecor(columns);
      expect(decor).toEqual(seabedDecor(columns));
      for (const d of decor) expect(d.x < -.5 || d.z < -.5 || d.x > columns - .5 || d.z > HEIGHT - .5).toBe(true);
    }
  });
  it('wraps ambient bubbles, motes and fish inside the screen without touching game state', () => {
    const a = createAmbience(), b = createAmbience();
    expect(a).toEqual(b);
    for (let i = 0; i < 2000; i++) stepAmbience(a, .1);
    expect(a.time).toBeCloseTo(200);
    for (const bubble of a.bubbles) { expect(bubble.y).toBeGreaterThanOrEqual(-.03); expect(bubble.y).toBeLessThanOrEqual(1.03); }
    for (const mote of a.motes) { expect(mote.x).toBeGreaterThanOrEqual(-.02); expect(mote.x).toBeLessThanOrEqual(1.02); }
    for (const school of a.schools) { expect(school.x).toBeGreaterThanOrEqual(-.15); expect(school.x).toBeLessThanOrEqual(1.15); }
    const time = a.time; stepAmbience(a, Number.NaN); stepAmbience(a, -1); expect(a.time).toBe(time);
  });
});
