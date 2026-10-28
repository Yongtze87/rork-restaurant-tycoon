import { BUILDABLE, BUILDINGS, activeLevel } from './town';
import { DISHES, DISH_IDS, INGREDIENTS, INGREDIENT_IDS, type Collections, type DishId, type Report, type RestaurantState } from './types';
import { TIDES, TIDE_KINDS, type TideKind } from './tides';
import { ZONES, ZONE_IDS } from './zones';
import { BIOMES, VISITABLE_BIOMES, biomesClaimed } from './ocean';

/**
 * Collections: long-term achievements that pay out pearls (and a few Tide charms), claimed by hand.
 * Pure data and checks. The engine moves the counters in `Collections` at the moment each real event
 * happens (a dish served, a day closed, a furniture upgrade); everything else is read from the save.
 */
export type FamilyId = 'dish' | 'builder' | 'explorer' | 'ocean' | 'tide' | 'host' | 'craft';
export const FAMILIES: Record<FamilyId, { name: string; description: string }> = {
  dish: { name: 'Dish mastery', description: 'Serve every dish again and again.' },
  builder: { name: 'Builder', description: 'Grow your reef town.' },
  explorer: { name: 'Explorer', description: 'Reach every depth zone.' },
  ocean: { name: 'Ocean voyager', description: 'Claim regions across the Ocean, see every biome and grow your branches.' },
  tide: { name: 'Tides & seasons', description: 'Serve guests under every tide and in every season.' },
  host: { name: 'Host', description: 'Keep your guests happy.' },
  craft: { name: 'Craft', description: 'Upgrade your furniture.' },
};
export const FAMILY_IDS = Object.keys(FAMILIES) as FamilyId[];
export interface Reward { pearls: number; /** Tide charms (−1 hour of building). */ tideCharms: number; }
export interface Achievement {
  id: string; family: FamilyId; /** Achievements in one chain are tiers of the same goal, shown and claimed in order. */ chain: string; step: number; steps: number;
  title: string; text: string; target: number; reward: Reward; value: (s: RestaurantState) => number;
}

/** Balance for this system lives here. */
export const DISH_TIERS = [{ name: 'Bronze', target: 10, pearls: 3 }, { name: 'Silver', target: 50, pearls: 8 }, { name: 'Gold', target: 200, pearls: 20 }] as const;
export const PERFECT_DAY_MIN_SERVED = 15;
/** Shown as "5.0" on the receipt, which rounds to one decimal. */
export const FIVE_STAR_RATING = 4.95;

const finished = (s: RestaurantState) => s.town.plots.filter(p => p.building && activeLevel(p) > 0);
const bestBuilding = (s: RestaurantState) => Math.max(0, ...finished(s).map(activeLevel));
const bestFurniture = (s: RestaurantState) => Math.max(s.collections.bestFurniture, ...s.furniture.map(f => f.level));
const flag = (yes: boolean) => yes ? 1 : 0;
const bestBranch = (s: RestaurantState) => Math.max(0, ...s.town.plots.filter(p => p.building === 'branch').map(activeLevel));
const reward = (pearls: number, tideCharms = 0): Reward => ({ pearls, tideCharms });
const SEASON_GOAL = 40;
type Step = Omit<Achievement, 'family' | 'chain' | 'step' | 'steps'>;
const chain = (family: FamilyId, name: string, steps: Step[]): Achievement[] => steps.map((a, i) => ({ ...a, family, chain: name, step: i + 1, steps: steps.length }));
const single = (family: FamilyId, a: Step): Achievement[] => chain(family, a.id, [a]);

export const ACHIEVEMENTS: Achievement[] = [
  ...DISH_IDS.flatMap(dish => chain('dish', `dish-${dish}`, DISH_TIERS.map(tier => ({
    id: `dish-${dish}-${tier.name.toLowerCase()}`, title: `${DISHES[dish].name} · ${tier.name}`, text: `Serve ${tier.target} ${DISHES[dish].plural}`,
    target: tier.target, reward: reward(tier.pearls), value: (s: RestaurantState) => s.collections.served[dish as DishId],
  })))),
  ...BUILDABLE.flatMap(kind => single('builder', { id: `own-${kind}`, title: BUILDINGS[kind].name, text: `Finish building a ${BUILDINGS[kind].name.toLowerCase()}`, target: 1, reward: reward(5), value: s => flag(finished(s).some(p => p.building === kind)) })),
  ...chain('builder', 'building-level', [
    { id: 'building-level-6', title: 'Master builder', text: 'Get any building to level 6', target: 6, reward: reward(10, 1), value: bestBuilding },
    { id: 'building-level-11', title: 'Grand architect', text: 'Get any building to level 11', target: 11, reward: reward(25, 1), value: bestBuilding },
  ]),
  ...chain('builder', 'building-count', [5, 10, 20].map((n, i) => ({ id: `buildings-${n}`, title: ['Little village', 'Busy town', 'Reef city'][i], text: `Have ${n} finished buildings in town`, target: n, reward: reward([5, 10, 20][i]), value: (s: RestaurantState) => finished(s).filter(p => p.building !== 'restaurant').length }))),
  ...chain('explorer', 'zones', ZONE_IDS.filter(id => id !== 'shallows').map((id, i) => ({ id: `zone-${id}`, title: ZONES[id].name, text: `Reach ${ZONES[id].place}`, target: 1, reward: reward([15, 25, 40][i], 1), value: (s: RestaurantState) => flag(s.town.zones.includes(id)) }))),
  // Colony-build achievement ids (colonies-*, biome-*) may stay in old saves' claimed lists; they are simply not shown.
  ...chain('ocean', 'regions', [1, 3, 10].map((n, i) => ({ id: `regions-${n}`, title: ['New horizons', 'Island hopper', 'Ocean empire'][i], text: `Claim ${n} ocean ${n === 1 ? 'region' : 'regions'}`, target: n, reward: reward([20, 40, 80][i], [1, 1, 2][i]), value: (s: RestaurantState) => s.ocean.regions.length }))),
  ...VISITABLE_BIOMES.map(biome => single('ocean', { id: `claim-${biome}`, title: BIOMES[biome].name, text: `Claim a ${BIOMES[biome].name.toLowerCase()} region`, target: 1, reward: reward(10), value: s => flag(biomesClaimed(s.ocean).includes(biome)) })).flat(),
  ...chain('ocean', 'branch-level', [
    { id: 'branch-level-6', title: 'Second kitchen', text: 'Get a branch restaurant to level 6', target: 6, reward: reward(15, 1), value: bestBranch },
    { id: 'branch-level-11', title: 'Restaurant chain', text: 'Get a branch restaurant to level 11', target: 11, reward: reward(30, 1), value: bestBranch },
  ]),
  ...TIDE_KINDS.filter(kind => TIDES[kind].weight > 0).map(kind => single('tide', { id: `tide-${kind}`, title: TIDES[kind].name, text: `Finish a shift during a ${TIDES[kind].name.toLowerCase()}`, target: 1, reward: reward(3), value: s => flag(s.collections.tides.includes(kind)) })).flat(),
  ...INGREDIENT_IDS.map(group => single('tide', { id: `season-${group}`, title: INGREDIENTS[group].season, text: `Sell ${SEASON_GOAL} dishes during ${INGREDIENTS[group].season.toLowerCase()}`, target: SEASON_GOAL, reward: reward(3), value: s => s.collections.seasonSold[group] ?? 0 })).flat(),
  ...chain('host', 'served', [100, 500, 2000].map((n, i) => ({ id: `served-${n}`, title: ['Friendly face', 'Reef regular', 'Legend of the reef'][i], text: `Serve ${n.toLocaleString('en-US')} guests in total`, target: n, reward: reward([5, 10, 25][i]), value: (s: RestaurantState) => s.lifetimeServed }))),
  ...single('host', { id: 'perfect-day', title: 'Perfect day', text: `Finish a shift with no missed guests and at least ${PERFECT_DAY_MIN_SERVED} served`, target: 1, reward: reward(10), value: s => flag(s.collections.perfectDays > 0) }),
  ...single('host', { id: 'five-star-day', title: 'Five stars', text: 'Finish a shift with a 5.0 rating', target: 1, reward: reward(15), value: s => flag(s.collections.fiveStarDays > 0) }),
  ...chain('craft', 'furniture-level', [
    { id: 'furniture-level-6', title: 'Handy owner', text: 'Upgrade any furniture to level 6', target: 6, reward: reward(10), value: bestFurniture },
    { id: 'furniture-level-11', title: 'Master crafter', text: 'Upgrade any furniture to level 11', target: 11, reward: reward(20, 1), value: bestFurniture },
  ]),
];
export const achievement = (id: string): Achievement | undefined => ACHIEVEMENTS.find(a => a.id === id);
export const progress = (s: RestaurantState, a: Achievement): number => Math.min(a.target, a.value(s));
export const isClaimed = (s: RestaurantState, a: Achievement): boolean => s.collections.claimed.includes(a.id);
/** Tiers are claimed in order, so a chain only offers its first unclaimed step. */
export const isClaimable = (s: RestaurantState, a: Achievement): boolean => !isClaimed(s, a) && progress(s, a) >= a.target && ACHIEVEMENTS.every(b => b.chain !== a.chain || b.step >= a.step || isClaimed(s, b));
export const claimableAchievements = (s: RestaurantState): Achievement[] => ACHIEVEMENTS.filter(a => isClaimable(s, a));
/** The step of each chain to show: the first unclaimed one, or the last when every step is claimed. */
export function visibleSteps(s: RestaurantState, family: FamilyId): Achievement[] {
  const chains = new Map<string, Achievement[]>();
  for (const a of ACHIEVEMENTS) if (a.family === family) chains.set(a.chain, [...(chains.get(a.chain) ?? []), a]);
  return [...chains.values()].map(steps => steps.find(a => !isClaimed(s, a)) ?? steps[steps.length - 1]);
}
export const rewardText = (r: Reward): string => [`${r.pearls} pearls`, r.tideCharms ? `${r.tideCharms === 1 ? 'a' : r.tideCharms} Tide charm${r.tideCharms === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');

/** Called once per dish actually paid for. */
export function recordServed(c: Collections, dish: DishId): void { c.served[dish]++; }
/** Called once per closed day, with that day's final receipt. */
export function recordDay(c: Collections, day: Pick<Report, 'served' | 'missed' | 'rating' | 'tide'>): void {
  if (day.served > 0 && !c.tides.includes(day.tide)) c.tides.push(day.tide as TideKind);
  if (day.missed === 0 && day.served >= PERFECT_DAY_MIN_SERVED) c.perfectDays++;
  if (day.rating >= FIVE_STAR_RATING) c.fiveStarDays++;
}
/** Saves from before collections: rebuild what the save still knows (the last receipts, furniture levels). Dish counts start at 0. */
export function seedCollections(s: RestaurantState): void {
  for (const report of s.history) recordDay(s.collections, report);
  s.collections.bestFurniture = Math.max(s.collections.bestFurniture, ...s.furniture.map(f => f.level));
}
