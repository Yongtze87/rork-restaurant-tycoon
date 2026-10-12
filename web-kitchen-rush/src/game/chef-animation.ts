import type { Item } from './types';
import type { ChefLocomotion } from './chef-locomotion';

/** Public pose inputs make new actions independent of any animation file format. */
export interface ChefPoseInput {
  time: number; id: number; motion: Readonly<ChefLocomotion>;
  held: Item | null; action: 'idle' | 'chop' | 'wash' | 'extinguish' | 'celebrate'; reduced: boolean;
}
export type JointPoint = [number, number, number];
/** Shoulder sits inside the jacket; the same anchor is used in gameplay and portraits. */
export const chefShoulder = (side: number): JointPoint => [side * .30, 1, 0];
/** Deterministic local pose; hand targets can subsequently be overridden by world-space IK. */
export function sampleChefPose(input: ChefPoseInput) {
  const { id, held, action, reduced, motion } = input;
  const t = reduced ? 0 : input.time;
  const gait = reduced ? 0 : motion.gait;
  const idle = Math.sin(t * 2.4 + id) * (reduced ? 0 : 1);
  const celebrate = action === 'celebrate';
  const wave = celebrate && !reduced ? Math.sin(t * 9 + id) : 0;
  const blinkPhase = (t + id * 1.73) % 4.6;
  const blink = reduced || blinkPhase < 4.42 ? 1 : Math.max(.075, Math.abs(blinkPhase - 4.51) / .09);
  const right: JointPoint = held ? [-.3, 1.01, .72] : [-.47, .57, .10 + gait * .22];
  const left: JointPoint = held ? [.3, 1.01, .72] : [.47, .57, .10 - gait * .22];
  if (celebrate) {
    right.splice(0, 3, -.61, 1.58 + wave * .12, .13);
    left.splice(0, 3, .61, 1.58 - wave * .12, .13);
  }
  return {
    right, left, blink, gait,
    headX: action === 'chop' || action === 'wash' ? .14 : reduced ? 0 : motion.dashBlend * -.1,
    headY: reduced ? 0 : (action === 'idle' && !held ? idle * .055 * (1 - motion.stride) : 0) + motion.lookYaw,
    headZ: celebrate ? wave * .06 : 0,
    hatZ: reduced ? 0 : gait * -.045 + idle * .017,
    earZ: reduced ? 0 : gait * .075 + idle * .035,
    tailY: reduced ? 0 : gait * .18 + idle * .13,
    scarfX: reduced ? 0 : Math.abs(gait) * .22 + motion.dashBlend * .45,
    legLeft: gait * .52, legRight: -gait * .52,
  };
}

/** Symmetric two-bone IK with outward elbow poles and controlled cartoon stretch. */
export function solveChefElbow(shoulder: JointPoint, hand: JointPoint, side: number): JointPoint {
  const d = hand.map((v, i) => v - shoulder[i]);
  const distance = Math.max(.0001, Math.hypot(...d));
  const axis = d.map(v => v / distance);
  const pole = [side, -.3, -.35];
  const dot = pole.reduce((sum, v, i) => sum + v * axis[i], 0);
  let bend = pole.map((v, i) => v - axis[i] * dot);
  let length = Math.hypot(...bend);
  if (length < .0001) { bend = [-axis[1], axis[0], 0]; length = Math.hypot(...bend) || 1; }
  // Short relaxed arms avoid the near-horizontal, wing-like elbows at rest.
  // Extend only for distant work/carry targets so hands still meet the actual props.
  const bone = Math.max(.26, distance * .53);
  const height = Math.sqrt(Math.max(0, bone * bone - distance * distance / 4));
  return shoulder.map((v, i) => v + d[i] / 2 + bend[i] / length * height) as JointPoint;
}
