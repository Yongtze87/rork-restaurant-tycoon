import { DISHES, DISH_IDS, comfort, type DailyChallenge, type DishId, type Guest, type RestaurantState } from './types';

/** Integer mixing keeps challenge rolls separate from the customer/order random stream. */
function mix(value: number): number {
  let n = value >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

/** A real arriving guest can be a star guest; designation never spawns extra customers. */
export const isSpecialGuest = (day: number, id: number): boolean => mix(Math.imul(day, 7919) ^ id) % 3 !== 0;

/** Goals are sized for a real day of play (about four work shifts), and so are the rewards. */
const DAY_GOAL = 4, DAY_REWARD = 4;
/** Roll once per real day, against the actual menu and equipment. Reloads retain the saved board. */
export function createDailyChallenges(state: RestaurantState): DailyChallenge[] {
  const day = state.calendar.index;
  let seed = mix(state.seed ^ Math.imul(day, 104729));
  const roll = (count: number): number => { seed = mix(seed + 0x9e3779b9); return seed % count; };
  const tier = Math.min(2, Math.floor((day - 1) / 3));
  const make = (kind: DailyChallenge['kind'], target: number, reward: number, dish: DishId | null = null): DailyChallenge => ({ day, kind, dish, target: Math.min(kind === 'revenue' || kind === 'tips' ? 100_000 : 1000, target * DAY_GOAL), reward: reward * DAY_REWARD, progress: 0, rewarded: false });
  const available = DISH_IDS.filter(dish => state.menu[dish].enabled && state.furniture.some(f => f.kind === DISHES[dish].station));
  const challenges = [make('special', 6 + tier + roll(3), 65 + tier * 10)];
  const dish = available[roll(Math.max(1, available.length))];
  challenges.push(dish ? make('dish', 5 + tier + roll(3), 50 + tier * 10, dish) : make('served', 10 + tier + roll(3), 50 + tier * 10));
  const averagePrice = available.reduce((sum, item) => sum + state.menu[item].price, 0) / Math.max(1, available.length);
  const typicalTip = Math.round(averagePrice * (.04 + comfort(state) * .001) * .55);
  const kinds: DailyChallenge['kind'][] = ['quick', 'revenue', ...(typicalTip > 0 ? ['tips'] as const : []), ...(dish ? ['served'] as const : [])];
  const kind = kinds[roll(kinds.length)];
  const target = kind === 'quick' ? 5 + tier + roll(3) : kind === 'revenue' ? Math.max(10, Math.round(averagePrice * (10 + tier + roll(3)))) : kind === 'tips' ? typicalTip * (9 + tier + roll(3)) : 12 + tier + roll(3);
  challenges.push(make(kind, target, 55 + tier * 10));
  return challenges;
}

/** Called once inside the unpaid → paid transaction. Returns only newly completed rewards. */
export function advanceDailyChallenges(challenges: DailyChallenge[], guest: Pick<Guest, 'dish' | 'special' | 'waiting' | 'price'>, tip: number): DailyChallenge[] {
  const completed: DailyChallenge[] = [];
  for (const challenge of challenges) {
    if (challenge.rewarded) continue;
    const increment = challenge.kind === 'special' ? Number(guest.special)
      : challenge.kind === 'dish' ? Number(guest.dish === challenge.dish)
      : challenge.kind === 'quick' ? Number(guest.waiting <= 25)
      : challenge.kind === 'revenue' ? guest.price + tip
      : challenge.kind === 'tips' ? tip : 1;
    challenge.progress = Math.min(challenge.target, challenge.progress + increment);
    if (challenge.progress === challenge.target) { challenge.rewarded = true; completed.push(challenge); }
  }
  return completed;
}

/** Bonuses are separate from service profit, both in current-day UI and immutable receipts. */
export const challengeBonus = (challenges: readonly DailyChallenge[]): number => challenges.reduce((sum, c) => sum + (c.rewarded ? c.reward : 0), 0);

/** Titles by kind; a dish challenge's own title comes from `challengeTitle`. */
export const challengeTitles: Record<DailyChallenge['kind'], string> = {
  special: 'Star treatment', dish: 'Chef’s choice', served: 'A full house', quick: 'Hot off the pass', revenue: 'Ring it up', tips: 'A little extra love',
};
const dishTitles: Partial<Record<DishId, string>> = { salad: 'Kelp lovers', burger: 'Off the vent' };
export function challengeTitle(challenge: Pick<DailyChallenge, 'kind' | 'dish'>): string {
  if (challenge.kind !== 'dish' || !challenge.dish) return challengeTitles[challenge.kind];
  return dishTitles[challenge.dish] ?? `${DISHES[challenge.dish].name} fans`;
}

/** Human-readable objective shared by the board, receipt and accessibility labels. */
export function challengeObjective(challenge: DailyChallenge): string {
  const n = challenge.target;
  switch (challenge.kind) {
    case 'special': return `Serve ${n} star guests`;
    case 'dish': return `Sell ${n} ${challenge.dish ? DISHES[challenge.dish].plural : 'dishes'}`;
    case 'served': return `Serve ${n} guests`;
    case 'quick': return `Serve ${n} meals within 25s of seating`;
    case 'revenue': return `Earn $${n} in sales + tips`;
    case 'tips': return `Earn $${n} in tips`;
  }
}
