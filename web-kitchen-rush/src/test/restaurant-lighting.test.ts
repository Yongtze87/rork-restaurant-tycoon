import { describe, expect, it } from 'vitest';
import { cityFixtures, cityLightLevel, neonPieces, neonShimmer, NEON_COLORS } from '@/management/city-lighting';
import { WeatherAnimation } from '@/management/weather';
import { cityDelta } from '@/management/city-motion';
import { CELL } from '@/management/types';

describe('automatic neighborhood lighting', () => {
  it('switches off in sunshine and illuminates dusk and dark rain', () => {
    expect(cityLightLevel(1, 0)).toBe(0);
    expect(cityLightLevel(0, 0)).toBeGreaterThan(.98);
    expect(cityLightLevel(0, 1)).toBe(1);
  });
  it('fades continuously through the photocell threshold', () => {
    let before = cityLightLevel(1, 0);
    for (let i = 1; i <= 100; i++) {
      const level = cityLightLevel(1 - i / 100, i / 100);
      expect(level).toBeGreaterThanOrEqual(before); expect(level - before).toBeLessThan(.04);
      expect(level).toBeGreaterThanOrEqual(0); expect(level).toBeLessThanOrEqual(1); before = level;
    }
  });
  it('follows the existing auto cycle instead of a competing day clock', () => {
    const weather = new WeatherAnimation();
    const levelAt = (seconds: number) => { for (let i = 0; i < seconds * 10; i++) weather.update(.1, 'auto', false); return cityLightLevel(weather.sun, weather.rain); };
    expect(levelAt(34)).toBe(0); expect(levelAt(38)).toBe(1); expect(levelAt(34)).toBeGreaterThan(.98);
  });
  it('bounds slow shimmer, staggers colors, and stays steady with reduced motion', () => {
    for (let t = 0; t < 60; t += .1) for (let channel = 0; channel < 3; channel++) {
      const value = neonShimmer(t, channel, false);
      expect(value).toBeGreaterThanOrEqual(.88); expect(value).toBeLessThanOrEqual(1);
      expect(Math.abs(value - neonShimmer(t + .1, channel, false))).toBeLessThan(.006);
      expect(neonShimmer(t, channel, true)).toBe(1);
    }
    expect(neonShimmer(0, 0, false)).not.toBe(neonShimmer(0, 1, false));
  });
  it.each(['paused', 'hidden', 'report', 'reduced'] as const)('shares the frozen weather state during %s', reason => {
    const weather = new WeatherAnimation(); weather.update(5, 'rain', false);
    const before = neonShimmer(weather.time, 0, reason === 'reduced');
    weather.update(cityDelta(.1, reason === 'report' ? 'report' : 'service', reason === 'paused', 3, reason === 'hidden', reason === 'reduced'), 'rain', reason === 'reduced');
    expect(neonShimmer(weather.time, 0, reason === 'reduced')).toBe(before);
    expect(cityLightLevel(weather.sun, weather.rain)).toBe(1);
  });
  it('manual preview works while paused and a fresh weather state clears old lighting time', () => {
    const weather = new WeatherAnimation(); weather.update(0, 'sun', false);
    expect(cityLightLevel(weather.sun, weather.rain)).toBe(0);
    weather.update(0, 'rain', false); expect(cityLightLevel(weather.sun, weather.rain)).toBe(1);
    expect(new WeatherAnimation().time).toBe(0);
  });
  it.each([10, 14])('keeps a fixed budget outside the %i-column restaurant with attached neon', columns => {
    const fixtures = cityFixtures(columns);
    expect(fixtures).toEqual(cityFixtures(columns)); expect(fixtures.lamps).toHaveLength(9); expect(fixtures.buildings).toHaveLength(12);
    for (const l of fixtures.lamps) expect(l.x < -2 || l.x > columns * CELL + 1 || l.z > 16).toBe(true);
    for (let channel = 0; channel < 3; channel++) {
      const pieces = neonPieces(fixtures.buildings, channel); expect(pieces).toHaveLength(56);
      for (const p of pieces) {
        expect(p.color).toBe(NEON_COLORS[channel]);
        expect(p.position[0] < -3 || p.position[0] > columns * CELL + 3 || p.position[2] < -8).toBe(true);
        expect(fixtures.buildings.some(b => Math.abs(p.position[0] - b.x) < 3 && Math.abs(p.position[2] - b.z) < 3)).toBe(true);
      }
    }
  });
});
