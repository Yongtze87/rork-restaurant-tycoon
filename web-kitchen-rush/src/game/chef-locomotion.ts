import { CHEF_DASH_SPEED, CHEF_WALK_SPEED } from './config';

/** Visual-only motion history. Never feeds back into collision, targeting or dash direction. */
export interface ChefLocomotion {
  x: number; z: number; time: number;
  yaw: number; angularVelocity: number; turnSign: number;
  gaitPhase: number; cadence: number; stride: number; gait: number;
  dashBlend: number; lean: number; lookYaw: number;
}
/** Positions are the resolved physics positions, not raw key intent. Time is simulation time. */
export interface LocomotionInput {
  x: number; z: number; time: number; yaw: number;
  moving: boolean; dashing: boolean; working: boolean; paused: boolean;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const damp = (value: number, target: number, rate: number, dt: number): number => target + (value - target) * Math.exp(-rate * dt);
const angleDelta = (target: number, current: number): number => Math.atan2(Math.sin(target - current), Math.cos(target - current));

/** Fresh history on spawn, restart, navigation or teleport; no inherited momentum. */
export function createChefLocomotion(x = 0, z = 0, yaw = 0, time = 0): ChefLocomotion {
  return { x, z, time, yaw, angularVelocity: 0, turnSign: 1, gaitPhase: 0, cadence: 0, stride: 0, gait: 0, dashBlend: 0, lean: 0, lookYaw: 0 };
}

/** Advance a continuous step cycle and a critically damped shortest-arc turn in-place. */
export function advanceChefLocomotion(motion: ChefLocomotion, input: LocomotionInput): void {
  if (input.paused) return;
  const elapsed = input.time - motion.time;
  const distance = Math.hypot(input.x - motion.x, input.z - motion.z);
  if (elapsed < 0 || distance > CHEF_DASH_SPEED * Math.max(0, elapsed) + .3) {
    Object.assign(motion, createChefLocomotion(input.x, input.z, input.yaw, input.time));
    return;
  }
  if (elapsed <= 1e-9) return;
  const dt = Math.min(elapsed, .25);
  const speed = input.moving ? Math.min(CHEF_DASH_SPEED, distance / elapsed) : 0;
  const travel = Math.min(1, speed / CHEF_WALK_SPEED);
  const cadence = speed <= CHEF_WALK_SPEED ? 13 * travel : 13 + 9 * (speed - CHEF_WALK_SPEED) / (CHEF_DASH_SPEED - CHEF_WALK_SPEED);
  // Integrate frequency, never multiply the global clock by a changing frequency.
  motion.gaitPhase += cadence * dt + (motion.cadence - cadence) * (1 - Math.exp(-20 * dt)) / 20;
  motion.cadence = damp(motion.cadence, cadence, 20, dt);
  motion.dashBlend = damp(motion.dashBlend, input.dashing && travel > 0 ? 1 : 0, 22, dt);
  // Small visual substeps keep turn-dependent stride/lean consistent at 30–144 Hz.
  const steps = Math.ceil(dt / (1 / 120)), h = dt / steps;
  for (let step = 0; step < steps; step++) {
    let error = angleDelta(input.yaw, motion.yaw);
    // At an exact reversal both arcs are valid. Retain the previous turn side
    // through the +/-PI seam instead of letting floating-point noise flip it.
    if (Math.abs(error) > Math.PI - .035) error = Math.abs(error) * motion.turnSign;
    const rate = input.working ? 26 : 22;
    const offset = -error, spring = motion.angularVelocity + rate * offset;
    const decay = Math.exp(-rate * h);
    motion.yaw += error + (offset + spring * h) * decay;
    motion.angularVelocity = (motion.angularVelocity - rate * spring * h) * decay;
    if (Math.abs(motion.angularVelocity) > .2) motion.turnSign = Math.sign(motion.angularVelocity);
    const turn = Math.min(1, Math.abs(error) / Math.PI);
    motion.stride = damp(motion.stride, travel * (1 - turn * .4), 22, h);
    motion.lean = damp(motion.lean, input.working ? 0 : clamp(-motion.angularVelocity * travel * .004, -.07, .07), 18, h);
    motion.lookYaw = damp(motion.lookYaw, input.working ? 0 : clamp(error * .16, -.24, .24), 20, h);
  }
  motion.gait = Math.sin(motion.gaitPhase) * motion.stride;
  motion.x = input.x; motion.z = input.z; motion.time = input.time;
}
