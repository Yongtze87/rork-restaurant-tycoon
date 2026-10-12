import { describe, expect, it } from 'vitest';
import { advanceChefLocomotion, createChefLocomotion, type ChefLocomotion, type LocomotionInput } from '@/game/chef-locomotion';
import { sampleChefPose } from '@/game/chef-animation';
import { CHEF_DASH_SPEED, CHEF_WALK_SPEED } from '@/game/config';

const input = (motion: ChefLocomotion, dt: number, patch: Partial<LocomotionInput> = {}): LocomotionInput => ({ x: motion.x, z: motion.z, time: motion.time + dt, yaw: motion.yaw, moving: false, dashing: false, working: false, paused: false, ...patch });
function step(motion: ChefLocomotion, dt: number, yaw: number, speed = CHEF_WALK_SPEED, patch: Partial<LocomotionInput> = {}): void {
  advanceChefLocomotion(motion, input(motion, dt, { yaw, moving: speed > 0, dashing: speed > CHEF_WALK_SPEED, x: motion.x + Math.sin(yaw) * speed * dt, z: motion.z + Math.cos(yaw) * speed * dt, ...patch }));
}
function travel(seconds = .4, yaw = 0, speed = CHEF_WALK_SPEED): ChefLocomotion {
  const motion = createChefLocomotion(0, 0, yaw);
  for (let i = 0; i < Math.round(seconds * 120); i++) step(motion, 1 / 120, yaw, speed);
  return motion;
}
const angle = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

describe('visual turning', () => {
  it.each([Math.PI / 2, -Math.PI / 2, Math.PI])('eases into a %f turn and settles quickly without overshooting', yaw => {
    const motion = createChefLocomotion();
    let previous = 0;
    for (let i = 0; i < 36; i++) {
      step(motion, 1 / 120, yaw);
      expect(Math.abs(motion.yaw)).toBeGreaterThanOrEqual(Math.abs(previous));
      expect(Math.abs(motion.yaw)).toBeLessThanOrEqual(Math.abs(yaw));
      expect(Math.abs(motion.yaw - previous)).toBeLessThan(.22);
      if (i === 0) expect(Math.abs(motion.yaw)).toBeLessThan(.05);
      previous = motion.yaw;
    }
    expect(Math.abs(angle(yaw, motion.yaw))).toBeLessThan(.04);
  });
  it('takes the short arc across the -PI/+PI seam', () => {
    const motion = createChefLocomotion(0, 0, Math.PI - .02);
    step(motion, .05, -Math.PI + .02);
    expect(motion.yaw).toBeGreaterThan(Math.PI - .02);
    expect(motion.yaw).toBeLessThan(Math.PI + .02);
  });
  it('retains a deterministic turn side at noisy exact 180-degree reversals', () => {
    const a = createChefLocomotion(), b = createChefLocomotion();
    step(a, .01, Math.PI - 1e-10); step(b, .01, -Math.PI + 1e-10);
    expect(a.yaw).toBeCloseTo(b.yaw, 8);
    expect(a.angularVelocity).toBeCloseTo(b.angularVelocity, 8);
    const left = createChefLocomotion(); left.turnSign = -1;
    step(left, .01, Math.PI); expect(left.angularVelocity).toBeLessThan(0);
  });
  it('keeps angular velocity continuous on rapid target changes, with bounded lean/head lead', () => {
    const motion = travel();
    for (const yaw of [Math.PI / 2, -Math.PI / 2, Math.PI, 0, -Math.PI, .3]) {
      for (let i = 0; i < 8; i++) {
        const before = { ...motion }; step(motion, 1 / 120, yaw);
        expect(Math.abs(motion.yaw - before.yaw)).toBeLessThan(.25);
        expect(Math.abs(motion.angularVelocity - before.angularVelocity)).toBeLessThan(13);
        expect(Math.abs(motion.lean)).toBeLessThanOrEqual(.07);
        expect(Math.abs(motion.lookYaw)).toBeLessThanOrEqual(.24);
      }
    }
  });
  it.each([30, 60, 144])('matches 120 Hz motion at %i Hz', fps => {
    const run = (hz: number): ChefLocomotion => {
      const motion = createChefLocomotion();
      for (let i = 0; i < hz / 2; i++) step(motion, 1 / hz, Math.PI / 2);
      for (let i = 0; i < hz / 2; i++) step(motion, 1 / hz, -Math.PI / 2, CHEF_DASH_SPEED);
      return motion;
    };
    const actual = run(fps), baseline = run(120);
    for (const key of ['yaw', 'angularVelocity', 'gaitPhase', 'cadence', 'gait', 'stride', 'dashBlend', 'lean', 'lookYaw'] as const) expect(Math.abs(actual[key] - baseline[key])).toBeLessThan(.003);
  });
});

describe('continuous stride', () => {
  it('preserves phase and momentum when direction reverses instead of cancelling velocity vectors', () => {
    const motion = travel(), before = { ...motion };
    step(motion, 1 / 60, Math.PI);
    expect(motion.gaitPhase).toBeGreaterThan(before.gaitPhase);
    expect(motion.cadence).toBeCloseTo(before.cadence, 2);
    expect(motion.stride).toBeGreaterThan(.8);
    expect(motion.stride).toBeLessThan(before.stride);
    expect(Math.abs(motion.gait - before.gait)).toBeLessThan(.28);
  });
  it('walk/dash/walk changes frequency without jumping the existing phase even late in a shift', () => {
    const motion = travel(); motion.time = 150;
    let before = { ...motion };
    step(motion, 1 / 120, 0, CHEF_DASH_SPEED);
    expect(motion.gaitPhase - before.gaitPhase).toBeGreaterThan(13 / 120 - .001);
    expect(motion.gaitPhase - before.gaitPhase).toBeLessThan(22 / 120);
    expect(motion.dashBlend).toBeGreaterThan(0); expect(motion.dashBlend).toBeLessThan(.2);
    before = { ...motion }; step(motion, 1 / 120, 0);
    expect(Math.abs(motion.gait - before.gait)).toBeLessThan(.2);
    expect(motion.gaitPhase).toBeGreaterThan(before.gaitPhase);
  });
  it('blends start/stop without resetting or instantly snapping the legs to neutral', () => {
    const motion = createChefLocomotion(); step(motion, 1 / 120, 0);
    expect(motion.stride).toBeGreaterThan(0); expect(motion.stride).toBeLessThan(.2);
    for (let i = 0; i < 40; i++) step(motion, 1 / 120, 0);
    const before = { ...motion }; step(motion, 1 / 120, 0, 0);
    expect(motion.gaitPhase).toBeGreaterThan(before.gaitPhase);
    expect(motion.stride).toBeGreaterThan(.8);
    for (let i = 0; i < 60; i++) step(motion, 1 / 120, 0, 0);
    expect(motion.stride).toBeLessThan(.0001); expect(motion.cadence).toBeLessThan(.001);
    const stoppedPhase = motion.gaitPhase; step(motion, .02, Math.PI / 2);
    expect(motion.gaitPhase).toBeGreaterThan(stoppedPhase); expect(motion.stride).toBeLessThan(.4);
  });
  it('does not run in place against a counter and follows actual wall-slide distance', () => {
    const blocked = travel(), sliding = { ...blocked };
    for (let i = 0; i < 60; i++) {
      step(blocked, 1 / 120, 0, 0, { moving: true });
      step(sliding, 1 / 120, 0, CHEF_WALK_SPEED / 2);
    }
    expect(blocked.stride).toBeLessThan(.0001);
    expect(sliding.stride).toBeCloseTo(.5, 3); expect(sliding.cadence).toBeCloseTo(6.5, 3);
  });
  it('uses one step phase for opposing legs, arms and body sway', () => {
    const motion = travel();
    const pose = sampleChefPose({ time: 100, id: 0, motion, held: null, action: 'idle', reduced: false });
    expect(pose.gait).toBe(motion.gait);
    expect(pose.legLeft).toBe(-pose.legRight);
    expect(pose.legLeft).toBeCloseTo(motion.gait * .52);
    expect(pose.right[2]).toBeCloseTo(.10 + motion.gait * .22);
    expect(pose.left[2]).toBeCloseTo(.10 - motion.gait * .22);
  });
});

describe('lifecycle and existing gameplay isolation', () => {
  it('freezes all motion history on pause and repeated render frames', () => {
    const motion = travel(); step(motion, .02, Math.PI);
    const before = { ...motion };
    for (let i = 0; i < 100; i++) advanceChefLocomotion(motion, input(motion, 0, { yaw: 1 }));
    expect(motion).toEqual(before);
    advanceChefLocomotion(motion, input(motion, 10, { paused: true, yaw: 0 }));
    expect(motion).toEqual(before);
    step(motion, .02, Math.PI); expect(motion.yaw).toBeGreaterThan(before.yaw);
  });
  it.each(['restart', 'teleport'] as const)('clears old turn and step state on %s', reason => {
    const motion = travel(); step(motion, .02, Math.PI);
    const next = input(motion, 0, { time: reason === 'restart' ? 0 : motion.time, x: 50, z: 40, yaw: .7 });
    advanceChefLocomotion(motion, next);
    expect(motion).toEqual(createChefLocomotion(50, 40, .7, next.time));
  });
  it('keeps players independent and never mutates the supplied physics sample', () => {
    const one = travel(), two = travel(); const unchanged = { ...two };
    const sample = Object.freeze(input(one, .02, { yaw: Math.PI, x: one.x + .076, moving: true }));
    expect(() => advanceChefLocomotion(one, sample)).not.toThrow();
    expect(two).toEqual(unchanged); expect(sample.yaw).toBe(Math.PI);
  });
  it('removes secondary motion live and restores the exact paused pose', () => {
    const motion = travel(); step(motion, .03, Math.PI / 2, CHEF_DASH_SPEED);
    const props = { time: 1, id: 0, motion, held: null, action: 'idle' as const, reduced: false };
    const before = sampleChefPose(props);
    const reduced = sampleChefPose({ ...props, reduced: true });
    expect([reduced.gait, reduced.headY, reduced.hatZ, reduced.tailY, reduced.scarfX]).toEqual([0, 0, 0, 0, 0]);
    expect(sampleChefPose(props)).toEqual(before);
  });
  it('keeps carried hand targets stable during turns and settles lean on workstation entry', () => {
    const motion = travel(); step(motion, .05, Math.PI);
    const props = { time: 1, id: 0, motion, held: { kind: 'plate' as const, parts: [] }, action: 'idle' as const, reduced: false };
    const before = sampleChefPose(props);
    for (let i = 0; i < 60; i++) step(motion, 1 / 120, Math.PI / 2, 0, { working: true });
    const after = sampleChefPose(props);
    expect(after.right).toEqual(before.right); expect(after.left).toEqual(before.left);
    expect(Math.abs(motion.lean)).toBeLessThan(.0001); expect(Math.abs(motion.lookYaw)).toBeLessThan(.0001);
  });
  it('bounds work after a long suspended frame and never accumulates nonfinite values', () => {
    const motion = travel(); step(motion, 600, Math.PI, 0);
    for (const value of Object.values(motion)) expect(Number.isFinite(value)).toBe(true);
    expect(motion.cadence).toBeLessThan(.1);
  });
});
