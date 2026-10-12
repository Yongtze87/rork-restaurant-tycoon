import { CELL } from './types';

/** Public garden coordinates stay independent of the editable restaurant and its orders. */
export const PARK = { x: 5.6, z: 24.6, width: 11.2, depth: 4.8, ground: -.9, benchZ: 25.35, benchWidth: 2.35, visitorScale: .68, cycle: 56 } as const;
export const PARK_BENCHES = [2.7, 8.5] as const;
export interface ParkPose { x: number; z: number; yaw: number; seated: number; walking: number; stage: 'waiting' | 'walking' | 'sitting' | 'resting' | 'standing'; }
const ease = (t: number): number => { const p = Math.max(0, Math.min(1, t)); return p * p * (3 - 2 * p); };
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Two reserved benches and separate paths prevent overlapping seats or crossing traffic. */
export function sampleParkVisitor(id: number, time: number, seatsReady: boolean, out: ParkPose): ParkPose {
  const side = id % 2, x = PARK_BENCHES[side], waitX = PARK.x + (side ? 1.2 : -1.2);
  const t = seatsReady ? ((time + (side ? 0 : 28)) % PARK.cycle + PARK.cycle) % PARK.cycle : 0;
  const towardBench = side ? Math.PI / 2 : -Math.PI / 2, towardWait = -towardBench;
  out.x = waitX; out.z = 23.5; out.yaw = Math.PI; out.seated = 0; out.walking = 0; out.stage = 'waiting';
  if (t < 12) return out;
  out.stage = 'walking';
  if (t < 13) { out.yaw = lerp(Math.PI, towardBench < 0 ? towardBench + Math.PI * 2 : towardBench, ease(t - 12)); return out; }
  if (t < 16) { out.x = lerp(waitX, x, ease((t - 13) / 3)); out.yaw = towardBench; out.walking = Math.sin(Math.PI * (t - 13) / 3); return out; }
  out.x = x;
  if (t < 17) { out.yaw = lerp(towardBench, 0, ease(t - 16)); return out; }
  if (t < 19) { out.z = lerp(23.5, 24.7, ease((t - 17) / 2)); out.yaw = 0; out.walking = Math.sin(Math.PI * (t - 17) / 2); return out; }
  out.z = 24.7;
  if (t < 20) { out.yaw = Math.PI * ease(t - 19); return out; }
  if (t < 21) { out.stage = 'sitting'; out.seated = ease(t - 20); out.z = lerp(24.7, 25.22, out.seated); return out; }
  if (t < 40) { out.stage = 'resting'; out.seated = 1; out.z = 25.22; return out; }
  if (t < 41) { out.stage = 'standing'; out.seated = 1 - ease(t - 40); out.z = lerp(24.7, 25.22, out.seated); return out; }
  if (t < 43) { out.z = lerp(24.7, 23.5, ease((t - 41) / 2)); out.walking = Math.sin(Math.PI * (t - 41) / 2); return out; }
  out.z = 23.5;
  if (t < 44) { out.yaw = lerp(Math.PI, towardWait < 0 ? towardWait + Math.PI * 2 : towardWait, ease(t - 43)); return out; }
  if (t < 47) { out.x = lerp(x, waitX, ease((t - 44) / 3)); out.yaw = towardWait; out.walking = Math.sin(Math.PI * (t - 44) / 3); return out; }
  out.x = waitX;
  if (t < 48) { out.yaw = lerp(towardWait < 0 ? towardWait + Math.PI * 2 : towardWait, Math.PI, ease(t - 47)); return out; }
  out.stage = 'waiting'; return out;
}

/** Only Neighborhood view expands; the restaurant/build camera keeps its existing fit. */
export function neighborhoodBounds(columns: number) {
  return { left: -8, right: columns * CELL + 7, back: -9, front: PARK.z + PARK.depth / 2 + 1 };
}
