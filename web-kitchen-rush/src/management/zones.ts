import { z } from 'zod';
import type { Town } from './town';

/**
 * Depth zones are the long-term chapters: Shallows → Coral Reef → Twilight → Abyss.
 * Each zone opens a ring of town plots (the Abyss has no ring: it is the drop-off around the town)
 * and two new dishes. Pure data and checks; the engine charges and records unlocks.
 */
export const ZONE_IDS = ['shallows', 'reef', 'twilight', 'abyss'] as const;
export const zoneId = z.enum(ZONE_IDS);
export type ZoneId = z.infer<typeof zoneId>;

export interface ZoneInfo {
  name: string; /** The name inside a sentence: "Reach the Coral Reef first." */ place: string; description: string;
  /** Unlock requirements: reputation, finished buildings (not counting the restaurant), best building level, price. */
  reputation: number; buildings: number; topLevel: number; price: number;
}
export const ZONES: Record<ZoneId, ZoneInfo> = {
  shallows: { name: 'Sunlit Shallows', place: 'the Sunlit Shallows', description: 'Warm sand and kelp. Where every reef story begins.', reputation: 0, buildings: 0, topLevel: 0, price: 0 },
  reef: { name: 'Coral Reef', place: 'the Coral Reef', description: 'Bright coral gardens with lobster and sea grapes. A new ring of plots.', reputation: 3.8, buildings: 4, topLevel: 0, price: 5000 },
  twilight: { name: 'Twilight Zone', place: 'the Twilight Zone', description: 'Deep blue water lit by moon jellies and glow squid. The outer ring of plots.', reputation: 4.2, buildings: 8, topLevel: 8, price: 20000 },
  abyss: { name: 'Abyss', place: 'the Abyss', description: 'The dark drop-off around your town. Rare vent pearls and ink for the finest dishes.', reputation: 4.6, buildings: 12, topLevel: 13, price: 120000 },
};
/** Each zone past the Shallows draws guests this much more often. */
export const ZONE_ARRIVAL_BONUS = .05;
/** Town rings by Chebyshev distance from the restaurant: 0–2 Shallows, 3 Coral Reef, 4 Twilight. */
export const zoneForRing = (ring: number): ZoneId => ring <= 2 ? 'shallows' : ring === 3 ? 'reef' : 'twilight';

export const previousZone = (id: ZoneId): ZoneId | null => ZONE_IDS[ZONE_IDS.indexOf(id) - 1] ?? null;
export const hasZone = (town: Pick<Town, 'zones'>, id: ZoneId): boolean => town.zones.includes(id);
export const zoneArrivalBonus = (town: Pick<Town, 'zones'>): number => ZONE_IDS.filter(id => id !== 'shallows' && hasZone(town, id)).length * ZONE_ARRIVAL_BONUS;

export interface ZoneRequirement { label: string; met: boolean; error: string; }
interface ZoneProgress { reputation: number; cash: number; town: Town; }
const finished = (town: Town) => town.plots.filter(p => p.building && p.job?.kind !== 'build');
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Every requirement for a zone with the player's current progress. Empty for the starting zone. `price` is the colony's price (region build costs applied). */
export function zoneRequirements(state: ZoneProgress, id: ZoneId, price = ZONES[id].price): ZoneRequirement[] {
  const info = ZONES[id], prev = previousZone(id), list: ZoneRequirement[] = [];
  if (!prev) return list;
  const built = finished(state.town).filter(p => p.building !== 'restaurant').length, best = Math.max(0, ...finished(state.town).map(p => p.level));
  if (prev !== 'shallows') list.push({ label: `Reach ${ZONES[prev].place}`, met: hasZone(state.town, prev), error: `Reach ${ZONES[prev].place} first.` });
  list.push({ label: `Reputation ${info.reputation.toFixed(1)} · now ${state.reputation.toFixed(1)}`, met: state.reputation >= info.reputation, error: `Reach a ${info.reputation.toFixed(1)} reputation first.` });
  list.push({ label: `${info.buildings} buildings in town · ${Math.min(built, info.buildings)}/${info.buildings}`, met: built >= info.buildings, error: `Build ${info.buildings} buildings in town first.` });
  if (info.topLevel) list.push({ label: `A building at level ${info.topLevel} · best Lv ${best}`, met: best >= info.topLevel, error: `Upgrade a building to level ${info.topLevel} first.` });
  list.push({ label: `${usd(price)} · you have ${usd(Math.max(0, Math.floor(state.cash)))}`, met: state.cash >= price, error: `Reaching ${info.place} costs ${usd(price)}.` });
  return list;
}
/** The first unmet requirement's error, or null when the zone can be unlocked now. */
export function zoneError(state: ZoneProgress, id: ZoneId, price = ZONES[id].price): string | null {
  if (hasZone(state.town, id)) return `You already reached ${ZONES[id].place}.`;
  return zoneRequirements(state, id, price).find(r => !r.met)?.error ?? null;
}
