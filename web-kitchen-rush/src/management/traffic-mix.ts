import { CELL } from './types';
import { CITY_CARS, type StreetPose } from './city-motion';

/** Reused per-car targets. Attenuation is anchored at the terrace, not the elevated camera. */
export interface TrafficVoice { gain: number; pan: number; rate: number; distance: number; }
export interface TrafficActor { pose: StreetPose; }
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const HORN_COOLDOWN = 14;

/** Pure fixed-budget spatial mix. Horns only trigger on a new close pass, never on resume. */
export class TrafficMix {
  readonly voices: TrafficVoice[] = Array.from({ length: CITY_CARS }, () => ({ gain: 0, pan: 0, rate: 1, distance: 100 }));
  private armed = Array<boolean>(CITY_CARS).fill(false);
  private primed = false;
  private cooldown = 3;
  reset(): void { this.primed = false; this.cooldown = 3; this.armed.fill(false); this.voices.forEach(voice => { voice.gain = 0; }); }
  step(cars: readonly TrafficActor[], columns: number, rightX: number, rightZ: number, dt: number, building: boolean): number {
    this.cooldown = Math.max(0, this.cooldown - (Number.isFinite(dt) ? clamp(dt, 0, .1) : 0));
    let horn = -1, total = 0;
    const center = (columns - 1) * CELL / 2;
    for (let id = 0; id < CITY_CARS; id++) {
      const voice = this.voices[id], pose = cars[id]?.pose;
      if (!pose) { voice.gain = 0; continue; }
      const dx = pose.x - center, dz = pose.z - 13.65, distance = Math.hypot(dx, dz, 1.5);
      const proximity = clamp(1 - distance / 22, 0, 1);
      voice.distance = distance;
      voice.gain = .16 * proximity * proximity * (building ? .45 : 1);
      voice.pan = clamp((dx * rightX + dz * rightZ) / 12, -.85, .85);
      const approach = -(Math.sin(pose.yaw) * dx + Math.cos(pose.yaw) * dz) / Math.max(1, distance);
      voice.rate = .96 + id * .015 + approach * .035;
      total += voice.gain;
      if (!this.primed || distance > 12) this.armed[id] = distance > 12;
      if (distance < 9.5 && this.armed[id]) {
        this.armed[id] = false;
        if (this.primed && !building && this.cooldown === 0 && horn === -1) { horn = id; this.cooldown = HORN_COOLDOWN; }
      }
    }
    // Even six cars together remain background ambience, below foreground cues/music.
    if (total > .22) for (const voice of this.voices) voice.gain *= .22 / total;
    this.primed = true;
    return horn;
  }
}
