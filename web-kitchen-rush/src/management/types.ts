import { z } from 'zod';
import { createTown, townSchema, type Validated } from './town';
import type { ZoneId } from './zones';

export const furnitureKind = z.enum(['table', 'prep', 'grill', 'plant', 'divider', 'lamp']);
export type FurnitureKind = z.infer<typeof furnitureKind>;
export const pointSchema = z.object({ x: z.number().finite().min(-2).max(16), z: z.number().finite().min(-2).max(16) });
export type Point = Validated<z.infer<typeof pointSchema>>;
const furnitureSchema = z.object({ id: z.number().int().nonnegative(), kind: furnitureKind, x: z.number().int().min(0).max(13), z: z.number().int().min(0).max(9), rotation: z.number().int().min(0).max(3) });
export type Furniture = Validated<z.infer<typeof furnitureSchema>>;
/** Dish ids in menu order. `salad` and `burger` keep their original ids so older saves stay valid. */
export const DISH_IDS = ['salad', 'burger', 'sushi', 'lobster', 'jellySalad', 'squidSkewers', 'pearlDumplings', 'inkNoodles'] as const;
export const dishId = z.enum(DISH_IDS);
export type DishId = z.infer<typeof dishId>;
export type Dish = DishId;
export const MIN_PRICE = 10, MAX_PRICE = 120;
const priceSchema = z.number().int().min(MIN_PRICE).max(MAX_PRICE);
export interface DishInfo { name: string; /** For "Sell 5 …" objectives. */ plural: string; cost: number; fair: number; seconds: number; station: 'prep' | 'grill'; ingredient: 'kelp' | 'fish'; zone: ZoneId; description: string; }
/** The whole menu. Deeper dishes cost more, take longer and earn more per guest. */
export const DISHES: Record<DishId, DishInfo> = {
  salad: { name: 'Kelp salad', plural: 'kelp salads', cost: 7, fair: 24, seconds: 6, station: 'prep', ingredient: 'kelp', zone: 'shallows', description: 'Crisp ribbon kelp, sea grapes and a squeeze of brine-lime.' },
  burger: { name: 'Vent-seared fish cake', plural: 'vent-seared fish cakes', cost: 12, fair: 38, seconds: 10, station: 'grill', ingredient: 'fish', zone: 'shallows', description: 'Seared over a warm sea vent, golden outside, tender inside.' },
  sushi: { name: 'Sea-grape sushi', plural: 'plates of sea-grape sushi', cost: 14, fair: 44, seconds: 8, station: 'prep', ingredient: 'fish', zone: 'reef', description: 'Reef fish over pressed rice, crowned with popping sea grapes.' },
  lobster: { name: 'Grilled reef lobster', plural: 'grilled reef lobsters', cost: 20, fair: 58, seconds: 12, station: 'grill', ingredient: 'fish', zone: 'reef', description: 'Split, buttered and charred over the vent. A coral-red treat.' },
  jellySalad: { name: 'Moon-jelly salad', plural: 'moon-jelly salads', cost: 18, fair: 56, seconds: 10, station: 'prep', ingredient: 'kelp', zone: 'twilight', description: 'Cool ribbons of moon jelly on twilight kelp. It glows a little.' },
  squidSkewers: { name: 'Glow-squid skewers', plural: 'glow-squid skewers', cost: 26, fair: 72, seconds: 14, station: 'grill', ingredient: 'fish', zone: 'twilight', description: 'Tender glow squid, seared on coral skewers with deep-sea pepper.' },
  pearlDumplings: { name: 'Vent pearl dumplings', plural: 'vent pearl dumplings', cost: 28, fair: 84, seconds: 13, station: 'prep', ingredient: 'kelp', zone: 'abyss', description: 'Silky kelp dough folded around warm vent pearls. Rare and soft.' },
  inkNoodles: { name: 'Abyssal ink noodles', plural: 'bowls of abyssal ink noodles', cost: 36, fair: 100, seconds: 17, station: 'grill', ingredient: 'fish', zone: 'abyss', description: 'Midnight-black noodles tossed with fish from the deepest vents.' },
};
const roleSchema = z.enum(['chef', 'server']);
export type Role = z.infer<typeof roleSchema>;
const agentSchema = pointSchema.extend({ yaw: z.number().finite(), route: z.array(pointSchema).max(200) });
const staffSchema = agentSchema.extend({ id: z.number().int(), name: z.string().max(30), role: roleSchema, level: z.number().int().min(1).max(3), task: z.enum(['idle', 'toKitchen', 'cooking', 'collect', 'deliver', 'clean']), guestId: z.number().int().nullable(), stationId: z.number().int().nullable(), timer: z.number().finite().nonnegative() });
export type Staff = Validated<z.infer<typeof staffSchema>>;
const guestSchema = agentSchema.extend({ id: z.number().int(), look: z.enum(['coral', 'pearl', 'lagoon', 'dusk']), tableId: z.number().int(), seat: z.number().int().min(0).max(1), dish: dishId, price: z.number().min(MIN_PRICE).max(MAX_PRICE), stage: z.enum(['arriving', 'waiting', 'cooking', 'ready', 'delivering', 'eating', 'leaving']), waiting: z.number().nonnegative(), timer: z.number().nonnegative(), happy: z.boolean(), stationId: z.number().int().nullable(), paid: z.boolean(), special: z.boolean().default(false) });
export type Guest = Validated<z.infer<typeof guestSchema>>;
const totalsSchema = z.object({ revenue: z.number().nonnegative(), ingredients: z.number().nonnegative(), served: z.number().int().nonnegative(), missed: z.number().int().nonnegative(), tips: z.number().nonnegative() });
export type Totals = Validated<z.infer<typeof totalsSchema>>;
/** Older boards had one kind per dish ('salad' / 'burger'); they load as a 'dish' challenge naming that dish. */
const legacyChallenge = (raw: unknown): unknown => {
  const kind = (raw as { kind?: unknown } | null)?.kind;
  return kind === 'salad' || kind === 'burger' ? { ...(raw as object), kind: 'dish', dish: kind } : raw;
};
const challengeSchema = z.preprocess(legacyChallenge, z.object({
  day: z.number().int().positive(), kind: z.enum(['special', 'dish', 'served', 'quick', 'revenue', 'tips']), dish: dishId.nullable().default(null),
  target: z.number().int().positive().max(1000), progress: z.number().int().nonnegative().max(1000), reward: z.number().int().positive().max(200), rewarded: z.boolean(),
}).refine(c => c.progress <= c.target && c.rewarded === (c.progress === c.target), 'Invalid challenge progress').refine(c => (c.kind === 'dish') === (c.dish !== null), 'A dish challenge names one dish'));
export type DailyChallenge = Validated<z.infer<typeof challengeSchema>>;
const challengesSchema = z.array(challengeSchema).max(3).default([]).refine(items => new Set(items.map(c => `${c.kind}:${c.dish}`)).size === items.length, 'Duplicate challenges');
const reportSchema = totalsSchema.extend({ challenges: challengesSchema, day: z.number().int().positive(), wages: z.number().nonnegative(), rent: z.number().nonnegative(), debtPayment: z.number().nonnegative(), profit: z.number().finite(), rating: z.number().min(1).max(5) });
export type Report = Validated<z.infer<typeof reportSchema>>;
const menuItem = (dish: DishId) => z.object({ enabled: z.boolean(), price: priceSchema }).default({ enabled: false, price: DISHES[dish].fair });
/** One entry per dish; dishes added after a save was made start off the menu at their suggested price. */
const menuSchema = z.object(Object.fromEntries(DISH_IDS.map(dish => [dish, menuItem(dish)])) as { [K in DishId]: ReturnType<typeof menuItem> });
export type Menu = Validated<z.infer<typeof menuSchema>>;
/** Validated versioned save. Arcade records live under a different key. */
export const restaurantSchema = z.object({
  version: z.literal(1), name: z.string().min(1).max(28), day: z.number().int().min(1), cash: z.number().finite(), reputation: z.number().min(1).max(5), debt: z.number().nonnegative(), expanded: z.boolean(),
  furniture: z.array(furnitureSchema).min(1).max(100), staff: z.array(staffSchema).min(2).max(12), guests: z.array(guestSchema).max(24), dirty: z.array(z.string().max(30)).max(40),
  menu: menuSchema,
  phase: z.enum(['planning', 'service', 'report']), elapsed: z.number().finite().nonnegative(), nextArrival: z.number().finite().nonnegative(), clock: z.number().finite().nonnegative(), nextId: z.number().int().positive(), seed: z.number().finite(),
  lastActiveAt: z.number().finite().nonnegative().default(0), isPaused: z.boolean().default(false), renovation: z.boolean().default(false),
  dailyChallenges: challengesSchema, lifetimeChallengeBonus: z.number().int().nonnegative().default(0),
  totals: totalsSchema, history: z.array(reportSchema).max(20), lifetimeServed: z.number().int().nonnegative(), claimed: z.array(z.string()).max(10), music: z.boolean(), welcomed: z.boolean(),
  town: townSchema.default(createTown),
});
export type RestaurantState = Validated<z.infer<typeof restaurantSchema>>;
export type CatalogItem = { name: string; description: string; price: number; size: number; category: 'Dining' | 'Kitchen' | 'Atmosphere'; comfort: number };
export const CATALOG: Record<FurnitureKind, CatalogItem> = {
  table: { name: 'Coral table', description: 'Two shell seats. A little room for good company.', price: 180, size: 2, category: 'Dining', comfort: 0 },
  prep: { name: 'Kelp counter', description: 'One chef can prepare kelp salads here.', price: 240, size: 1, category: 'Kitchen', comfort: 0 },
  grill: { name: 'Vent grill', description: 'One chef sears our signature fish cakes over a warm sea vent.', price: 360, size: 1, category: 'Kitchen', comfort: 0 },
  plant: { name: 'Sea anemone', description: '+6 atmosphere. Happier guests leave better tips.', price: 65, size: 1, category: 'Atmosphere', comfort: 6 },
  divider: { name: 'Kelp screen', description: '+4 atmosphere. Shape a cozy dining nook.', price: 80, size: 1, category: 'Atmosphere', comfort: 4 },
  lamp: { name: 'Glow-jelly lantern', description: '+8 atmosphere. A soft light from the deep.', price: 110, size: 1, category: 'Atmosphere', comfort: 8 },
};
export const DAY_LENGTH = 150;
export const createMenu = (): Menu => Object.fromEntries(DISH_IDS.map(dish => [dish, { enabled: DISHES[dish].zone === 'shallows', price: DISHES[dish].fair }])) as Menu;
export const SAVE_KEY = 'vast-ocean-restaurant-v1';
export const HEIGHT = 10;
export const width = (state: Pick<RestaurantState, 'expanded'>): number => state.expanded ? 14 : 10;
export const entrance: Point = { x: 4, z: 9 };
export const freshTotals = (): Totals => ({ revenue: 0, ingredients: 0, served: 0, missed: 0, tips: 0 });
export const staffWage = (staff: Staff): number => (staff.role === 'chef' ? 34 : 26) + (staff.level - 1) * 12;
export const comfort = (state: RestaurantState): number => Math.min(100, state.furniture.reduce((total, item) => total + CATALOG[item.kind].comfort, 20));
/** Shared service deadline, including the restaurant's existing atmosphere bonus. */
export const guestPatienceSeconds = (state: RestaurantState): number => 48 + comfort(state) * .18;
export const capacity = (state: RestaurantState): number => state.furniture.filter(item => item.kind === 'table').length * 2;
/** A playable starter business, with no fabricated revenue or customers served. */
export function createRestaurant(): RestaurantState {
  return { version: 1, name: 'Little Reef', day: 1, cash: 1250, reputation: 3.5, debt: 0, expanded: false,
    furniture: [
      { id: 1, kind: 'prep', x: 1, z: 1, rotation: 0 }, { id: 2, kind: 'grill', x: 3, z: 1, rotation: 0 },
      { id: 3, kind: 'table', x: 1, z: 4, rotation: 0 }, { id: 4, kind: 'table', x: 5, z: 4, rotation: 0 }, { id: 5, kind: 'table', x: 7, z: 1, rotation: 0 },
      { id: 6, kind: 'plant', x: 0, z: 0, rotation: 0 }, { id: 7, kind: 'plant', x: 9, z: 7, rotation: 0 }, { id: 8, kind: 'lamp', x: 9, z: 0, rotation: 0 },
    ],
    staff: [
      { id: 10, name: 'Marlo', role: 'chef', level: 1, x: 1, z: 2, yaw: Math.PI, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 },
      { id: 11, name: 'Pearl', role: 'server', level: 1, x: 4, z: 7, yaw: 0, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 },
    ], guests: [], dirty: [], menu: createMenu(),
    lastActiveAt: 0, isPaused: false, renovation: false, dailyChallenges: [], lifetimeChallengeBonus: 0,
    phase: 'planning', elapsed: 0, nextArrival: 1, clock: 0, nextId: 20, seed: 91273, totals: freshTotals(), history: [], lifetimeServed: 0, claimed: [], music: false, welcomed: false, town: createTown(),
  };
}
