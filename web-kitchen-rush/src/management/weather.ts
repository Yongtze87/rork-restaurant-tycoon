import { cityLoop, sampleStreet } from './city-motion';

/** Session-only scenery; never stored in the restaurant save or used by its economy. */
export type WeatherKind = 'sunset' | 'sun' | 'rain';
export type WeatherMode = 'auto' | WeatherKind;
export const WEATHER_LABELS: Record<WeatherMode, string> = { auto: 'Auto cycle', sunset: 'Golden hour', sun: 'Bright sun', rain: 'Light rain' };
export const WEATHER_CYCLE = 108;
export const WEATHER_FADE = 5;
export const RAIN_COUNT = 480;
export const PUDDLE_COUNT = 32;

/** A quiet start, warm sunshine, a passing shower, then back to sunset. */
export function weatherAt(time: number): WeatherKind {
  const t = Math.max(0, Number.isFinite(time) ? time : 0) % WEATHER_CYCLE;
  return t < 28 || t >= 100 ? 'sunset' : t < 64 ? 'sun' : 'rain';
}

/** Reusable blend state. Call with cityDelta so pause/visibility/speed remain consistent. */
export class WeatherAnimation {
  time = 0;
  cycleTime = 0;
  sun = 0;
  rain = 0;
  kind: WeatherKind = 'sunset';
  private mode: WeatherMode = 'auto';
  private progress = 1;
  private fromSun = 0;
  private fromRain = 0;

  update(delta: number, mode: WeatherMode, reduced: boolean): void {
    const dt = reduced || !Number.isFinite(delta) ? 0 : Math.max(0, delta);
    const changed = mode !== this.mode;
    if (changed) { this.mode = mode; this.cycleTime = 0; }
    this.time += dt;
    if (mode === 'auto') this.cycleTime += dt;
    const target = mode === 'auto' ? weatherAt(this.cycleTime) : mode;
    if (target !== this.kind) {
      this.fromSun = this.sun; this.fromRain = this.rain;
      this.kind = target; this.progress = 0;
    }
    // Manual choices remain previewable while service is paused. Reduced motion has no fades.
    this.progress = reduced || changed && dt === 0 ? 1 : Math.min(1, this.progress + dt / WEATHER_FADE);
    const blend = this.progress * this.progress * (3 - 2 * this.progress);
    this.sun = this.fromSun + ((target === 'sun' ? 1 : 0) - this.fromSun) * blend;
    this.rain = this.fromRain + ((target === 'rain' ? 1 : 0) - this.fromRain) * blend;
  }
}

export interface RainSeed { x: number; z: number; floor: number; phase: number; speed: number; }
const fraction = (value: number): number => value - Math.floor(value);
/** Distribute rain on roads/promenades, not through furniture, roofs, or the build grid. */
export function createRainSeeds(columns: number): RainSeed[] {
  return Array.from({ length: RAIN_COUNT }, (_, i) => {
    const offset = -3.4 + fraction(i * .754877666) * 6.4;
    const loop = cityLoop(columns, offset);
    const p = sampleStreet(loop, fraction(i * .618033989) * loop.length, 1, { x: 0, z: 0, yaw: 0 });
    return { x: p.x, z: p.z, floor: offset < -2.4 ? -.89 : offset > 2.4 ? -1.06 : -1.01, phase: fraction(i * .381966011), speed: 4.8 + fraction(i * .414213562) * 1.5 };
  });
}
/** Write into one fixed vertex buffer; no per-frame geometry or particle allocations. */
export function writeRainPositions(seeds: readonly RainSeed[], time: number, positions: Float32Array): void {
  seeds.forEach((seed, i) => {
    const height = (1 - fraction(seed.phase + time * seed.speed / 9)) * 9;
    const x = seed.x - height * .045, z = seed.z - height * .025, y = seed.floor + height;
    const index = i * 6;
    positions[index] = x; positions[index + 1] = y; positions[index + 2] = z;
    positions[index + 3] = x - .016; positions[index + 4] = y + .36; positions[index + 5] = z - .009;
  });
}
