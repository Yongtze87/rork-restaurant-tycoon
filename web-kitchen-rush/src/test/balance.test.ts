import { describe, expect, it } from 'vitest';
import { averageProfit, simulate } from '@/management/sim/simulator';

// Short-horizon pacing guards built on the balance simulator (docs/BALANCE.md). Each run drives the
// real engine at 1× with an automated owner, so these catch tuning that breaks the early game.
describe('balance pacing (simulator)', () => {
  const balanced = simulate({ strategy: 'balanced', days: 10, maxServiceDays: 30, seed: 91273 });
  const builder = simulate({ strategy: 'builder', days: 10, maxServiceDays: 24, seed: 5 });

  it('runs the requested service days deterministically', () => {
    expect(balanced.serviceDays).toBe(30);
    const again = simulate({ strategy: 'balanced', days: 10, maxServiceDays: 30, seed: 91273 });
    expect(again.finalCash).toBe(balanced.finalCash); expect(again.unlocked).toEqual(balanced.unlocked);
  });
  it('keeps a balanced owner solvent: never below zero, never stuck, no loan needed', () => {
    expect(balanced.minCash).toBeGreaterThanOrEqual(0);
    expect(balanced.bankruptDays).toBe(0); expect(balanced.loans).toBe(0);
    expect(balanced.rows.every(r => r.profit + r.bonus > 0)).toBe(true);
  });
  it('keeps even an aggressive builder out of bankruptcy', () => {
    expect(builder.bankruptDays).toBe(0); expect(builder.minCash).toBeGreaterThanOrEqual(0);
  });
  it('reaches the Coral Reef in the first few real days, but not in the first hour', () => {
    const reef = balanced.unlocked.reef;
    expect(reef).toBeDefined();
    expect(reef!.day).toBeGreaterThanOrEqual(8); expect(reef!.day).toBeLessThanOrEqual(30);
    expect(reef!.realDay).toBeLessThanOrEqual(4);
    expect(builder.unlocked.reef).toBeDefined();
    expect(balanced.unlocked.twilight).toBeUndefined();
  });
  it('grows profit per day as the owner reinvests', () => {
    expect(averageProfit(balanced, 21, 30)).toBeGreaterThan(averageProfit(balanced, 1, 5) * 1.2);
    expect(builder.buildings.length).toBeGreaterThanOrEqual(5);
  });
});
