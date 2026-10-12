import { describe, expect, it } from 'vitest';
import { TrafficMix } from '@/management/traffic-mix';
import { cityLoop, sampleStreet, CITY_CARS } from '@/management/city-motion';
const cars = (x = 6.3, z = 19) => Array.from({ length: CITY_CARS }, () => ({ pose: { x, z, yaw: 0 } }));

describe('quiet spatial traffic mix', () => {
  it('fades with terrace distance, silences distant cars and bounds the combined level', () => {
    const mix = new TrafficMix(); mix.step(cars(), 10, 1, 0, .1, false);
    const near = mix.voices[0].gain;
    expect(near).toBeGreaterThan(0); expect(mix.voices.reduce((sum, v) => sum + v.gain, 0)).toBeLessThanOrEqual(.220001);
    mix.step(cars(6.3, 30), 10, 1, 0, .1, false); expect(mix.voices[0].gain).toBeLessThan(near);
    mix.step(cars(6.3, 40), 10, 1, 0, .1, false); expect(mix.voices.every(v => v.gain === 0)).toBe(true);
  });
  it('pans with the actual camera right vector including rotated views', () => {
    const mix = new TrafficMix(); mix.step(cars(14, 19), 10, 1, 0, .1, false); const right = mix.voices[0].pan;
    mix.step(cars(14, 19), 10, -1, 0, .1, false); expect(mix.voices[0].pan).toBe(-right);
    mix.step(cars(14, 19), 10, 0, 1, .1, false); expect(mix.voices[0].pan).toBeGreaterThan(0);
    expect(mix.voices.every(v => Math.abs(v.pan) <= .85 && v.rate > .9 && v.rate < 1.1)).toBe(true);
  });
  it('moves the listening position when the terrace expands', () => {
    const mix = new TrafficMix(); mix.step(cars(9.1, 19), 14, 1, 0, .1, false); expect(mix.voices[0].pan).toBeCloseTo(0);
  });
  it('does not honk initially, repeatedly inside the near zone, or on reset/resume', () => {
    const mix = new TrafficMix();
    for (let i = 0; i < 200; i++) expect(mix.step(cars(), 10, 1, 0, .1, false)).toBe(-1);
    mix.step(cars(6.3, 30), 10, 1, 0, .1, false);
    expect(mix.step(cars(), 10, 1, 0, .1, false)).toBe(0);
    mix.reset(); expect(mix.step(cars(), 10, 1, 0, .1, false)).toBe(-1);
  });
  it('allows only one fresh pass per cooldown, regardless of simultaneous cars', () => {
    const mix = new TrafficMix();
    for (let i = 0; i < 35; i++) mix.step(cars(6.3, 30), 10, 1, 0, .1, false);
    expect(mix.step(cars(), 10, 1, 0, .1, false)).toBe(0);
    mix.step(cars(6.3, 30), 10, 1, 0, .1, false); expect(mix.step(cars(), 10, 1, 0, .1, false)).toBe(-1);
    for (let i = 0; i < 150; i++) mix.step(cars(6.3, 30), 10, 1, 0, .1, false);
    expect(mix.step(cars(), 10, 1, 0, .1, false)).toBe(0);
  });
  it('subdues engines and suppresses horns while building', () => {
    const mix = new TrafficMix(), actors = cars(6.3, 24);
    mix.step(actors, 10, 1, 0, .1, false); const normal = mix.voices[0].gain;
    mix.step(actors, 10, 1, 0, .1, true); expect(mix.voices[0].gain).toBeCloseTo(normal * .45);
    for (let i = 0; i < 200; i++) mix.step(cars(6.3, 30), 10, 1, 0, .1, true);
    expect(mix.step(cars(), 10, 1, 0, .1, true)).toBe(-1);
  });
  it.each([10, 14])('honks occasionally on actual %s-column lanes without speed-induced spam', columns => {
    for (const speed of [1, 3]) {
      const mix = new TrafficMix(), actors = cars(), events: number[] = [];
      for (let frame = 0; frame < 1200; frame++) {
        actors.forEach((actor, id) => { const direction = id % 2 ? -1 : 1, loop = cityLoop(columns, direction * 1.15); sampleStreet(loop, (Math.floor(id / 2) / 3 + (id % 2 ? .14 : .04)) * loop.length + frame * .1 * speed * 2.8 * direction, direction, actor.pose); });
        if (mix.step(actors, columns, .866, -.5, .1, false) >= 0) events.push(frame * .1);
      }
      expect(events.length).toBeGreaterThan(1); expect(events.length).toBeLessThan(10);
      events.slice(1).forEach((time, i) => expect(time - events[i]).toBeGreaterThanOrEqual(14));
    }
  });
});
