import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { SAVE_KEY, createRestaurant, restaurantSchema } from '@/management/types';
import { LAST_TUTORIAL_STEP, currentStep, migrateTutorial } from '@/management/tutorial';
import { plotAt } from '@/management/town';

function storageWith(save: unknown) {
  let raw = JSON.stringify(save);
  return { getItem: (key: string) => key === SAVE_KEY ? raw : null, setItem: (_key: string, value: string) => { raw = value; }, read: () => JSON.parse(raw) };
}
const legacy = (welcomed: boolean) => { const save = JSON.parse(JSON.stringify(createRestaurant())); delete save.tutorial; save.welcomed = welcomed; return save; };

describe('tutorial save migration', () => {
  it('starts new games at the first step', () => {
    expect(createRestaurant().tutorial).toEqual({ step: 0, done: false });
    expect(currentStep(new RestaurantEngine().state)).toBe(0);
  });
  it('treats an older save that dismissed the welcome card as done, and one that did not as a fresh start', () => {
    expect(restaurantSchema.parse(legacy(true)).tutorial).toEqual({ step: 0, done: true });
    expect(restaurantSchema.parse(legacy(false)).tutorial).toEqual({ step: 0, done: false });
    const old = new RestaurantEngine(storageWith(legacy(true)));
    expect(old.loadWarning).toBe(''); expect(currentStep(old.state)).toBeNull();
    expect(migrateTutorial(null)).toBeNull();
  });
  it('keeps saved progress and rejects impossible steps', () => {
    const s = createRestaurant(); s.tutorial = { step: 3, done: false };
    expect(restaurantSchema.parse(s).tutorial).toEqual({ step: 3, done: false });
    expect(restaurantSchema.safeParse({ ...s, tutorial: { step: LAST_TUTORIAL_STEP + 1, done: false } }).success).toBe(false);
  });
  it('saves progress, only moves forward, and welcome() skips the rest', () => {
    const h = storageWith(createRestaurant()), e = new RestaurantEngine(h);
    e.tutorialTo(2); expect(h.read().tutorial).toEqual({ step: 2, done: false });
    e.tutorialTo(1); expect(e.state.tutorial.step).toBe(2);
    expect(new RestaurantEngine(h).state.tutorial).toEqual({ step: 2, done: false });
    e.welcome(); expect(h.read().tutorial.done).toBe(true); expect(h.read().welcomed).toBe(true);
    e.reset(); expect(e.state.tutorial).toEqual({ step: 0, done: false });
    e.tutorialTo(LAST_TUTORIAL_STEP + 1); expect(e.state.tutorial.done).toBe(true);
  });
  it('skips steps the simulation shows are already done', () => {
    const e = new RestaurantEngine(); e.tutorialTo(1);
    expect(currentStep(e.state)).toBe(1);
    expect(e.place({ id: -1, kind: 'table', x: 0, z: 7, rotation: 0 })).toBeNull();
    expect(currentStep(e.state)).toBe(2); // the menu step waits for the owner to look
    expect(e.open()).toBeNull(); expect(currentStep(e.state)).toBe(3);
    for (let i = 0; i < 3000 && e.state.lifetimeServed < 1; i++) e.update(.1);
    expect(currentStep(e.state)).toBe(4);
    const c = e.state.town.plots.find(p => p.building === 'restaurant')!;
    expect(e.unlockPlot(c.x + 1, c.z)).toBeNull(); expect(currentStep(e.state)).toBe(5);
    expect(e.build(c.x + 1, c.z, 'garden')).toBeNull(); expect(currentStep(e.state)).toBe(6);
    expect(e.useCharm(c.x + 1, c.z, 'current')).toBeNull(); expect(plotAt(e.state.town, c.x + 1, c.z)!.job).toBeNull();
    expect(currentStep(e.state)).toBe(LAST_TUTORIAL_STEP); // the wrap-up waits for the owner
  });
});
