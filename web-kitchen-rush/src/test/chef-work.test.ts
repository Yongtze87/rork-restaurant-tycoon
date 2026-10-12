import { describe, expect, it } from 'vitest';
import { blendChefWork, createChefWorkBlend } from '@/game/chef-work';
import { CHOP_CUTS, KNIFE_LIFT_HEIGHT, cutPosition, knifeCutPosition, knifeLift } from '@/game/chopping';
import type { JointPoint } from '@/game/chef-animation';

const rest: [JointPoint, JointPoint] = [[-.47, .57, .1], [.47, .57, .1]];
const work: [JointPoint, JointPoint] = [[-.2, 1.8, .8], [.22, 1.5, .7]];

describe('chopping transitions', () => {
  it('eases into work without slowing the exact grip during each stroke', () => {
    const blend = createChefWorkBlend(rest, 0);
    expect(blendChefWork(blend, work, 'board', 0, false)).toEqual(rest);
    const halfway = blendChefWork(blend, work, 'board', .07, false);
    expect(halfway[0][1]).toBeCloseTo((rest[0][1] + work[0][1]) / 2);
    expect(blendChefWork(blend, work, 'board', .14, false)).toEqual(work);
    const contact: [JointPoint, JointPoint] = [[-.2, 1.5, .8], work[1]];
    expect(blendChefWork(blend, contact, 'board', .3, false)).toEqual(contact);
  });
  it('settles smoothly on release and can resume partway without snapping', () => {
    const blend = createChefWorkBlend(work, 0); blend.key = 'board';
    expect(blendChefWork(blend, rest, '', .3, false)).toEqual(work);
    const halfway = blendChefWork(blend, rest, '', .38, false);
    expect(halfway[0][1]).toBeCloseTo((work[0][1] + rest[0][1]) / 2);
    expect(blendChefWork(blend, work, 'board', .39, false)).toEqual(halfway);
    expect(blendChefWork(blend, work, 'board', .54, false)).toEqual(work);
    blendChefWork(blend, rest, '', .55, false);
    expect(blendChefWork(blend, rest, '', .72, false)).toEqual(rest);
  });
  it('freezes on simulation time and samples static targets for reduced motion', () => {
    const blend = createChefWorkBlend(rest, 0);
    blendChefWork(blend, work, 'board', .2, false);
    const before = blendChefWork(blend, work, 'board', .25, false);
    for (let frame = 0; frame < 30; frame++) expect(blendChefWork(blend, work, 'board', .25, false)).toEqual(before);
    expect(blendChefWork(blend, work, 'board', .25, true)).toEqual(work);
    expect(blendChefWork(blend, work, 'board', .25, false)).toEqual(before);
  });
  it('clears stale work on restart and keeps each player independent', () => {
    const first = createChefWorkBlend(rest, 0), second = createChefWorkBlend(rest, 0);
    blendChefWork(first, work, 'board', 1, false); blendChefWork(first, work, 'board', 1.2, false);
    expect(second.hands).toEqual(rest);
    expect(blendChefWork(first, rest, '', 0, false)).toEqual(rest);
  });
});

describe('continuous knife strokes', () => {
  it('holds contact then advances laterally while lifted, never snapping between cuts', () => {
    for (let cut = 1; cut < CHOP_CUTS; cut++) {
      const at = cut / CHOP_CUTS;
      expect(knifeCutPosition(at - 1e-7)).toBeCloseTo(cutPosition(cut), 5);
      expect(knifeCutPosition(at)).toBeCloseTo(cutPosition(cut), 5);
      expect(knifeCutPosition(at + .15 / CHOP_CUTS)).toBeCloseTo(cutPosition(cut), 5);
      expect(knifeCutPosition(at + .7 / CHOP_CUTS)).toBeCloseTo(cutPosition(cut + 1), 5);
    }
  });
  it('uses a bounded compact lift with smooth reversal at the top and contact', () => {
    for (let i = 0; i <= 1000; i++) {
      const height = knifeLift(i / 1000);
      expect(height).toBeGreaterThanOrEqual(0); expect(height).toBeLessThanOrEqual(KNIFE_LIFT_HEIGHT);
    }
    const epsilon = 1e-5;
    for (const phase of [.16, .68, 1]) {
      const p = phase / CHOP_CUTS;
      expect(Math.abs(knifeLift(p + epsilon) - knifeLift(p - epsilon)) / (2 * epsilon)).toBeLessThan(.01);
    }
  });
});
