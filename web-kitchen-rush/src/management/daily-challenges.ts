import { DISHES, comfort, type DailyChallenge, type Guest, type RestaurantState } from './types';

/** Integer mixing keeps challenge rolls separate from the customer/order random stream. */
function mix(value: number): number {
  let n = value >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

/** A real arriving guest can be a star guest; designation never spawns extra customers. */
export const isSpecialGuest = (day: number, id: number): boolean => mix(Math.imul(day, 7919) ^ id) % 3 !== 0;

/** Roll once at opening, against the actual menu and equipment. Reloads retain the saved board. */
export function createDailyChallenges(state: RestaurantState): DailyChallenge[] {
  let seed = mix(state.seed ^ Math.imul(state.day, 104729));
  const roll = (count: number): number => { seed = mix(seed + 0x9e3779b9); return seed % count; };
  const tier = Math.min(2, Math.floor((state.day - 1) / 3));
  const make = (kind: DailyChallenge['kind'], target: number, reward: number): DailyChallenge => ({ day: state.day, kind, target, reward, progress: 0, rewarded: false });
  const available = (['salad', 'burger'] as const).filter(dish => state.menu[dish].enabled && state.furniture.some(f => f.kind === DISHES[dish].station));
  const challenges = [make('special', 6 + tier + roll(3), 65 + tier * 10)];
  const dish = available[roll(Math.max(1, available.length))];
  challenges.push(dish ? make(dish, 5 + tier + roll(3), 50 + tier * 10) : make('served', 10 + tier + roll(3), 50 + tier * 10));
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
      : challenge.kind === 'salad' || challenge.kind === 'burger' ? Number(guest.dish === challenge.kind)
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

export const challengeTitles: Record<DailyChallenge['kind'], string> = {
  special: 'Star treatment', salad: 'Garden favorites', burger: 'Off the grill', served: 'A full house', quick: 'Hot off the pass', revenue: 'Ring it up', tips: 'A little extra love',
};

/** Human-readable objective shared by the board, receipt and accessibility labels. */
export function challengeObjective(challenge: DailyChallenge): string {
  const n = challenge.target;
  switch (challenge.kind) {
    case 'special': return `Serve ${n} star guests`;
    case 'salad': return `Sell ${n} garden salads`;
    case 'burger': return `Sell ${n} sunset burgers`;
    case 'served': return `Serve ${n} guests`;
    case 'quick': return `Serve ${n} meals within 25s of seating`;
    case 'revenue': return `Earn $${n} in sales + tips`;
    case 'tips': return `Earn $${n} in tips`;
  }
}
