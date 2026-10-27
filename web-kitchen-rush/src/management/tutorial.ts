import { z } from 'zod';
import type { RestaurantState } from './types';
import type { Town, Validated } from './town';

/**
 * The guided first ten minutes. Each step finishes when the simulation shows the player did it,
 * so steps done early (or out of order) are skipped. Pure: the engine stores progress, the UI reads it.
 */
export const TUTORIAL_STEPS = ['welcome', 'table', 'menu', 'open', 'plot', 'build', 'charm', 'wrap'] as const;
export type TutorialStep = typeof TUTORIAL_STEPS[number];
export const LAST_TUTORIAL_STEP = TUTORIAL_STEPS.length - 1;
export const tutorialSchema = z.object({ step: z.number().int().min(0).max(LAST_TUTORIAL_STEP), done: z.boolean() });
export type Tutorial = Validated<z.infer<typeof tutorialSchema>>;
export const newTutorial = (): Tutorial => ({ step: 0, done: false });

/** Saves from before the tutorial: an owner who dismissed the old welcome card has already started. */
export function migrateTutorial(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || 'tutorial' in raw) return raw;
  return { ...raw, tutorial: { step: 0, done: (raw as { welcomed?: unknown }).welcomed === true } };
}

/** Furniture ids below this belong to the starter layout; anything placed by the owner gets a higher id. */
const FIRST_OWNER_ID = 20;
const hasOpened = (s: RestaurantState): boolean => s.phase !== 'planning' || s.lifetimeServed > 0 || s.history.length > 0;
const townBuildings = (town: Town) => town.plots.filter(p => p.building && p.building !== 'restaurant');

/** Whether the simulation already shows this step as done. UI-only steps (welcome, wrap) never finish on their own. */
export function stepDone(step: TutorialStep, s: RestaurantState): boolean {
  switch (step) {
    case 'table': return hasOpened(s) || s.furniture.some(f => f.kind === 'table' && f.id >= FIRST_OWNER_ID);
    case 'menu': return hasOpened(s);
    case 'open': return s.lifetimeServed >= 1;
    case 'plot': return s.town.plots.filter(p => p.owned).length > 1;
    case 'build': return townBuildings(s.town).length > 0;
    case 'charm': return townBuildings(s.town).some(p => p.job?.kind !== 'build');
    default: return false;
  }
}

/** The step to show now (skipping steps the player already did), or null once the tutorial is over. */
export function currentStep(s: RestaurantState): number | null {
  if (s.tutorial.done) return null;
  let step = s.tutorial.step;
  while (step < LAST_TUTORIAL_STEP && stepDone(TUTORIAL_STEPS[step], s)) step++;
  return step;
}
