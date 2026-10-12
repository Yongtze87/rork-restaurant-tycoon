import { describe, expect, it } from 'vitest';
import { cityDelta, cityLoop, sampleStreet } from '@/management/city-motion';
import { CELL } from '@/management/types';

const pose = () => ({ x: 0, z: 0, yaw: 0 });
describe('cosmetic city motion', () => {
  it.each([10, 14])('keeps both road lanes and sidewalks outside the %i-column restaurant', columns => {
    for (const offset of [-3.65, -3.03, -1.15, 1.15]) {
      const loop = cityLoop(columns, offset);
      for (let d = 0; d < loop.length; d += .15) {
        const p = sampleStreet(loop, d, 1, pose());
        expect(p.x < -1 || p.x > columns * CELL - .5 || p.z < -1 || p.z > 14).toBe(true);
        expect(Number.isFinite(p.yaw)).toBe(true);
      }
    }
  });
  it('wraps continuously forward and backward without teleporting at the seam', () => {
    const loop = cityLoop(10);
    expect(sampleStreet(loop, -2, -1, pose())).toEqual(sampleStreet(loop, loop.length - 2, -1, pose()));
    const a = sampleStreet(loop, loop.length - .001, 1, pose()), b = sampleStreet(loop, .001, 1, pose());
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(.0021);
    expect(Math.abs(a.yaw - b.yaw)).toBeLessThan(.01);
  });
  it('moves at constant distance with tangent-aligned forward and reverse headings', () => {
    const loop = cityLoop(10);
    for (let d = 0; d < loop.length; d += .19) {
      for (const direction of [1, -1] as const) {
        const a = sampleStreet(loop, d, direction, pose()), b = sampleStreet(loop, d + .001 * direction, direction, pose());
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(.001, 6);
        expect((b.x - a.x) * Math.sin(a.yaw) + (b.z - a.z) * Math.cos(a.yaw)).toBeGreaterThan(.00099);
      }
    }
  });
  it('maintains ample headway for three 2.25-unit cars per lane', () => {
    for (const offset of [-1.15, 1.15]) {
      const loop = cityLoop(10, offset);
      for (let d = 0; d < loop.length; d += .2) {
        const a = sampleStreet(loop, d, 1, pose()), b = sampleStreet(loop, d + loop.length / 3, 1, pose());
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(8);
      }
    }
  });
  it('runs in planning, follows service speed, and freezes pause, hidden, report and reduced motion', () => {
    expect(cityDelta(.08, 'planning', false, 3, false, false)).toBe(.08);
    expect(cityDelta(.08, 'service', false, 3, false, false)).toBe(.24);
    expect(cityDelta(.08, 'service', true, 1, false, false)).toBe(0);
    expect(cityDelta(.08, 'planning', false, 1, true, false)).toBe(0);
    expect(cityDelta(.08, 'planning', false, 1, false, true)).toBe(0);
    expect(cityDelta(.08, 'report', false, 1, false, false)).toBe(0);
    expect(cityDelta(10, 'service', false, 1, false, false)).toBe(.1);
    expect(cityDelta(NaN, 'planning', false, 1, false, false)).toBe(0);
  });
});
