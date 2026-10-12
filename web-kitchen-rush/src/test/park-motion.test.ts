import { describe, expect, it } from 'vitest';
import { PARK, PARK_BENCHES, neighborhoodBounds, sampleParkVisitor, type ParkPose } from '@/management/park-motion';
import { cityLoop } from '@/management/city-motion';
const pose = (): ParkPose => ({ x: 0, z: 0, yaw: 0, seated: 0, walking: 0, stage: 'waiting' });

describe('pocket park choreography', () => {
  it('starts with one resting visitor and one waiting visitor', () => {
    expect(sampleParkVisitor(0, 0, true, pose()).stage).toBe('resting');
    expect(sampleParkVisitor(1, 0, true, pose()).stage).toBe('waiting');
  });
  it('never seats anyone on a bench that has not loaded', () => {
    for (const id of [0, 1]) expect(sampleParkVisitor(id, 30, false, pose())).toMatchObject({ stage: 'waiting', seated: 0 });
  });
  it('gives each visitor a separate bench and walking lane throughout the cycle', () => {
    for (let time = 0; time <= PARK.cycle * 2; time += .13) {
      const a = sampleParkVisitor(0, time, true, pose()), b = sampleParkVisitor(1, time, true, pose());
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2);
      [a, b].forEach((p, id) => {
        expect(p.x).toBeGreaterThan(.8); expect(p.x).toBeLessThan(10.4);
        expect(p.z).toBeGreaterThanOrEqual(23.5); expect(p.z).toBeLessThanOrEqual(25.22);
        expect(p.seated).toBeGreaterThanOrEqual(0); expect(p.seated).toBeLessThanOrEqual(1);
        if (p.seated > 0) { expect(p.x).toBe(PARK_BENCHES[id]); expect(p.yaw).toBe(Math.PI); }
      });
    }
  });
  it('blends position, yaw and sitting across every phase and the loop seam', () => {
    for (const id of [0, 1]) for (let time = 0; time < PARK.cycle; time += .01) {
      const a = sampleParkVisitor(id, time, true, pose()), b = sampleParkVisitor(id, time + .001, true, pose());
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(.002);
      expect(Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)))).toBeLessThan(.006);
      expect(Math.abs(a.seated - b.seated)).toBeLessThan(.002);
    }
  });
  it.each([10, 14])('keeps the park outside %i-column roads and inside the neighborhood camera bounds', columns => {
    const outerLane = cityLoop(columns, 1.15), bounds = neighborhoodBounds(columns);
    expect(PARK.z - PARK.depth / 2).toBeGreaterThan(outerLane.front + 1);
    expect(PARK.x - PARK.width / 2).toBeGreaterThan(bounds.left);
    expect(PARK.x + PARK.width / 2).toBeLessThan(bounds.right);
    expect(PARK.z + PARK.depth / 2).toBeLessThan(bounds.front);
  });
  it('samples deterministically without allocating or modifying another visitor', () => {
    const out = pose(), other = sampleParkVisitor(1, 6, true, pose()), saved = { ...other };
    expect(sampleParkVisitor(0, 15, true, out)).toBe(out);
    expect(other).toEqual(saved);
    expect(sampleParkVisitor(0, 15 + PARK.cycle, true, pose())).toEqual(out);
  });
});
