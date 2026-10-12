import { describe, expect, it } from 'vitest';
import { cityDelta } from '@/management/city-motion';
import { createRainSeeds, RAIN_COUNT, WeatherAnimation, weatherAt, WEATHER_CYCLE, writeRainPositions } from '@/management/weather';
import { CELL } from '@/management/types';

const advance = (weather: WeatherAnimation, seconds: number) => { for (let i = 0; i < Math.round(seconds * 10); i++) weather.update(.1, 'auto', false); };
describe('cosmetic weather', () => {
  it('cycles through all three scenes and wraps deterministically', () => {
    expect([0, 28, 64, 100, WEATHER_CYCLE].map(weatherAt)).toEqual(['sunset', 'sun', 'rain', 'sunset', 'sunset']);
    expect(weatherAt(-10)).toBe('sunset'); expect(weatherAt(NaN)).toBe('sunset');
  });
  it('blends automatically rather than abruptly changing the scene', () => {
    const weather = new WeatherAnimation(); advance(weather, 30);
    expect(weather.kind).toBe('sun'); expect(weather.sun).toBeGreaterThan(0); expect(weather.sun).toBeLessThan(1);
    advance(weather, 10); expect(weather.sun).toBe(1);
    advance(weather, 32); expect(weather.kind).toBe('rain'); expect(weather.rain).toBe(1); expect(weather.sun).toBe(0);
    advance(weather, 36); expect(weather.kind).toBe('sunset'); expect(weather.rain).toBe(0);
  });
  it('retargets a partially blended choice without jumps or excessive total weight', () => {
    const weather = new WeatherAnimation(); weather.update(2, 'sun', false);
    const before = weather.sun; weather.update(.001, 'rain', false);
    expect(weather.sun).toBeCloseTo(before, 5);
    for (let i = 0; i < 100; i++) { weather.update(.1, 'rain', false); expect(weather.sun + weather.rain).toBeLessThanOrEqual(1.00001); }
    expect(weather.rain).toBe(1); expect(weather.sun).toBe(0);
  });
  it('keeps manual selections fixed and restarts auto in golden hour', () => {
    const weather = new WeatherAnimation(); weather.update(120, 'rain', false);
    expect(weather.kind).toBe('rain'); expect(weather.rain).toBe(1);
    weather.update(0, 'auto', false); expect(weather.kind).toBe('sunset'); expect(weather.rain).toBe(0);
  });
  it.each(['paused', 'hidden', 'report', 'reduced'] as const)('freezes automatic time and fades when %s', reason => {
    const weather = new WeatherAnimation(); advance(weather, 66);
    const before = { ...weather };
    for (let i = 0; i < 10; i++) weather.update(cityDelta(.1, reason === 'report' ? 'report' : 'service', reason === 'paused', 3, reason === 'hidden', reason === 'reduced'), 'auto', reason === 'reduced');
    expect(weather.time).toBe(before.time); expect(weather.cycleTime).toBe(before.cycleTime);
    if (reason !== 'reduced') { expect(weather.sun).toBe(before.sun); expect(weather.rain).toBe(before.rain); }
    else expect(weather.rain).toBe(1);
  });
  it('previews manual settings while paused and with reduced motion', () => {
    const weather = new WeatherAnimation(); weather.update(0, 'rain', false);
    expect(weather.rain).toBe(1); expect(weather.time).toBe(0);
    weather.update(5, 'sun', true); expect(weather.sun).toBe(1); expect(weather.rain).toBe(0); expect(weather.time).toBe(0);
  });
  it('uses planning speed 1 and the real service multiplier', () => {
    const weather = new WeatherAnimation(); weather.update(cityDelta(.1, 'planning', false, 3, false, false), 'auto', false); expect(weather.time).toBe(.1);
    weather.update(cityDelta(.1, 'service', false, 3, false, false), 'auto', false); expect(weather.time).toBe(.4);
  });
  it.each([10, 14])('bounds deterministic rain around the %i-column grid', columns => {
    const seeds = createRainSeeds(columns), positions = new Float32Array(RAIN_COUNT * 6);
    expect(seeds).toHaveLength(RAIN_COUNT); expect(seeds).toEqual(createRainSeeds(columns));
    for (const time of [0, 1, 10000]) {
      writeRainPositions(seeds, time, positions);
      for (let i = 0; i < seeds.length; i++) {
        const [x, y, z] = positions.slice(i * 6, i * 6 + 3);
        expect(x < -1 || x > columns * CELL - .5 || z < -1 || z > 14).toBe(true);
        expect(y).toBeGreaterThanOrEqual(seeds[i].floor - .001); expect(y).toBeLessThan(seeds[i].floor + 9.001);
      }
    }
  });
  it('moves rain downward within its loop and reuses its buffer', () => {
    const seed = [{ x: -4, z: 0, floor: -1, phase: .2, speed: 5 }], positions = new Float32Array(6);
    writeRainPositions(seed, 0, positions); const y = positions[1];
    writeRainPositions(seed, .1, positions); expect(positions[1]).toBeCloseTo(y - .5, 5);
  });
});
