import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { guestMood, guestSatisfaction, satisfactionHeight } from '@/management/satisfaction';
import { createRestaurant, guestPatienceSeconds, type Guest } from '@/management/types';
import { createDinerRig } from '@/scene/diner-model';
import { Box3 } from 'three';

const waiting = { stage: 'waiting' as const, waiting: 0, happy: false };
const tick = (engine: RestaurantEngine, seconds: number): void => { for (let i = 0; i < Math.round(seconds * 10); i++) engine.update(.1); };

describe('management customer satisfaction', () => {
  it.each(['waiting', 'cooking', 'ready', 'delivering'] as const)('declines through %s without resetting between service stages', stage => {
    expect(guestSatisfaction({ ...waiting, stage, waiting: 15 }, 60)).toBe(75);
    expect(guestSatisfaction({ ...waiting, stage, waiting: 36 }, 60)).toBe(40);
    expect(guestSatisfaction({ ...waiting, stage, waiting: 57 }, 60)).toBe(5);
  });
  it('starts full, clamps at zero, and does not change data', () => {
    const guest = { ...waiting, waiting: 100 };
    expect(guestSatisfaction(guest, 60)).toBe(0); expect(guest).toEqual({ ...waiting, waiting: 100 });
    expect(guestSatisfaction({ ...waiting, stage: 'arriving' }, 60)).toBe(100);
  });
  it.each([100, 51, 50, 21, 20, 0])('uses visible percentage %i for consistent face and warning thresholds', value => {
    expect(guestMood(value, 'waiting', false)).toBe(value > 50 ? 'content' : value > 20 ? 'uneasy' : 'unhappy');
  });
  it('restores happiness only on delivery, retaining the result through departure', () => {
    const guest = { ...waiting, waiting: 59 };
    expect(guestSatisfaction({ ...guest, stage: 'delivering' }, 60)).toBe(2);
    for (const stage of ['eating', 'leaving'] as const) {
      expect(guestSatisfaction({ ...guest, stage, happy: true }, 60)).toBe(100);
      expect(guestMood(100, stage, true)).toBe('served');
    }
    expect(guestSatisfaction({ ...guest, stage: 'leaving' }, 60)).toBe(0);
    expect(guestMood(0, 'leaving', false)).toBe('unhappy');
  });
  it('uses the unchanged atmosphere bonus from the actual departure deadline', () => {
    const state = createRestaurant(); expect(guestPatienceSeconds(state)).toBe(55.2);
    const before = guestSatisfaction({ ...waiting, waiting: 40 }, guestPatienceSeconds(state));
    state.furniture.push({ id: 99, kind: 'lamp', x: 8, z: 8, rotation: 0 });
    expect(guestPatienceSeconds(state)).toBe(56.64);
    expect(guestSatisfaction({ ...waiting, waiting: 40 }, guestPatienceSeconds(state))).toBeGreaterThan(before);
  });
  it('follows real waiting, pause, speed, timeout and cleanup without changing costs', () => {
    const engine = new RestaurantEngine(); engine.open(); engine.state.cash = 0;
    tick(engine, 8); const guest = engine.state.guests[0], patience = guestPatienceSeconds(engine.state);
    const value = guestSatisfaction(guest, patience); expect(value).toBeLessThan(100);
    engine.pause(true); tick(engine, 10); expect(guestSatisfaction(guest, patience)).toBe(value);
    const before = guest.waiting; engine.setSpeed(3); tick(engine, 1); expect(guest.waiting - before).toBeCloseTo(3);
    engine.setSpeed(1); let previous = guestSatisfaction(guest, patience);
    for (let i = 0; i < 700 && guest.stage !== 'leaving'; i++) {
      engine.update(.1); const current = guestSatisfaction(guest, patience); expect(current).toBeLessThanOrEqual(previous); previous = current;
    }
    expect(guest.stage).toBe('leaving'); expect(guest.waiting).toBeGreaterThan(patience);
    expect(guestSatisfaction(guest, patience)).toBe(0); expect(engine.state.totals.revenue).toBe(0); expect(engine.state.totals.ingredients).toBe(0);
    tick(engine, 15); expect(engine.state.guests.some(g => g.id === guest.id)).toBe(false);
    engine.reset(); expect(engine.state.guests).toEqual([]);
  });
  it('uses real delivery to recover and preserves the meter across paused save/reload', () => {
    let raw: string | null = null;
    const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
    const engine = new RestaurantEngine(storage); engine.open();
    let guest: Guest | undefined;
    for (let i = 0; i < 500 && !guest; i++) { engine.update(.1); guest = engine.state.guests.find(g => g.stage === 'eating'); }
    expect(guest).toBeDefined(); const original = guest!;
    expect(original.waiting).toBeGreaterThan(0); expect(guestSatisfaction(original, guestPatienceSeconds(engine.state))).toBe(100);
    engine.pause(true); engine.save(); const reloaded = new RestaurantEngine(storage), restored = reloaded.state.guests.find(g => g.id === original.id)!;
    expect(reloaded.paused).toBe(true); expect(guestSatisfaction(restored, guestPatienceSeconds(reloaded.state))).toBe(100);
    expect(reloaded.state).toEqual(engine.state);
  });
  it.each(['mouse', 'rabbit', 'bear', 'crocodile'] as const)('anchors above the %s head including ears', species => {
    const rig = createDinerRig(species, 20);
    expect(satisfactionHeight(species) - new Box3().setFromObject(rig.head).max.y).toBeGreaterThan(.5);
    rig.dispose();
  });
});
