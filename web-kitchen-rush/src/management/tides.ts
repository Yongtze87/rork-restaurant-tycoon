import { z } from 'zod';

/**
 * Daily tides: one ocean event per service day, rolled from a pure hash of the saved seed and day
 * (never from the engine's RNG, so the guest stream is unchanged). Balance numbers live here.
 */
export const tideKind = z.enum(['calm', 'feast', 'current', 'whale', 'plankton', 'shoal', 'murky']);
export type TideKind = z.infer<typeof tideKind>;
/** Multipliers, 1 = neutral. `arrival` > 1 means guests arrive more often; costs < 1 are cheaper. */
export interface TideEffects { arrival: number; crewSpeed: number; tips: number; kelpCost: number; fishCost: number; patience: number; }
export interface TideInfo { name: string; description: string; weight: number; effects: TideEffects; }

const NEUTRAL: TideEffects = { arrival: 1, crewSpeed: 1, tips: 1, kelpCost: 1, fishCost: 1, patience: 1 };
const tide = (name: string, description: string, weight: number, effects: Partial<TideEffects>): TideInfo => ({ name, description, weight, effects: { ...NEUTRAL, ...effects } });
/** Plankton bloom and Shoal run (weight 0) no longer roll: kelp and fish now have seasons instead. They stay readable on old receipts. */
export const TIDES: Record<TideKind, TideInfo> = {
  calm: tide('Calm waters', 'A quiet, ordinary day on the reef.', 40, {}),
  feast: tide('Feast tide', 'The whole reef is hungry today.', 12, { arrival: 1.25 }),
  current: tide('Strong current', 'Crew fight the current, and grateful guests tip more.', 10, { crewSpeed: .9, tips: 1.1 }),
  whale: tide('Whale passing', 'Tourists follow a passing whale to your door.', 10, { arrival: 1.15, tips: 1.15 }),
  plankton: tide('Plankton bloom', 'Kelp grows thick in the bloom.', 0, { kelpCost: .7 }),
  shoal: tide('Shoal run', 'A big shoal swims through. Fish are plentiful.', 0, { fishCost: .7 }),
  murky: tide('Murky water', 'Cloudy water makes guests a little restless.', 8, { patience: .9 }),
};
export const TIDE_KINDS = tideKind.options;

function mix(value: number): number {
  let n = value >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}
/** Today's tide. Day 1 is always calm, so a brand-new reef starts gently. */
export function rollTide(seed: number, day: number): TideKind {
  if (day <= 1) return 'calm';
  const total = TIDE_KINDS.reduce((sum, kind) => sum + TIDES[kind].weight, 0);
  let pick = mix(mix(seed ^ Math.imul(day, 0x2c1b3c6d)) + 0x7f4a7c15) % total;
  for (const kind of TIDE_KINDS) { pick -= TIDES[kind].weight; if (pick < 0) return kind; }
  return 'calm';
}

const pct = (n: number) => `${Math.round(Math.abs(n - 1) * 100)}%`;
/** What a tide does, in the player's terms, derived from the same multipliers the engine uses. */
export function tideEffectText(kind: TideKind): string {
  const e = TIDES[kind].effects, parts: string[] = [];
  if (e.arrival !== 1) parts.push(`Guests arrive ${pct(e.arrival)} ${e.arrival > 1 ? 'more' : 'less'} often`);
  if (e.crewSpeed !== 1) parts.push(`crew ${pct(e.crewSpeed)} ${e.crewSpeed > 1 ? 'faster' : 'slower'}`);
  if (e.tips !== 1) parts.push(`tips ${e.tips > 1 ? '+' : '−'}${pct(e.tips)}`);
  if (e.kelpCost !== 1) parts.push(`Kelp ${pct(e.kelpCost)} ${e.kelpCost < 1 ? 'cheaper' : 'dearer'}`);
  if (e.fishCost !== 1) parts.push(`Fish ${pct(e.fishCost)} ${e.fishCost < 1 ? 'cheaper' : 'dearer'}`);
  if (e.patience !== 1) parts.push(`Guests ${pct(e.patience)} ${e.patience < 1 ? 'less' : 'more'} patient`);
  if (!parts.length) return 'No change today';
  const text = parts.join(' · ');
  return text[0].toUpperCase() + text.slice(1);
}
