import { z } from 'zod';

// Zod validates required fields at runtime; preserve them in the legacy non-strict TS project too.
type Validated<T> = T extends (infer U)[] ? Validated<U>[] : T extends object ? { [K in keyof T]-?: Validated<T[K]> } : T;

export const furnitureKind = z.enum(['table', 'prep', 'grill', 'plant', 'divider', 'lamp']);
export type FurnitureKind = z.infer<typeof furnitureKind>;
export const pointSchema = z.object({ x: z.number().finite().min(-2).max(16), z: z.number().finite().min(-2).max(16) });
export type Point = Validated<z.infer<typeof pointSchema>>;
const furnitureSchema = z.object({ id: z.number().int().nonnegative(), kind: furnitureKind, x: z.number().int().min(0).max(13), z: z.number().int().min(0).max(9), rotation: z.number().int().min(0).max(3) });
export type Furniture = Validated<z.infer<typeof furnitureSchema>>;
const roleSchema = z.enum(['chef', 'server']);
export type Role = z.infer<typeof roleSchema>;
const agentSchema = pointSchema.extend({ yaw: z.number().finite(), route: z.array(pointSchema).max(200) });
const staffSchema = agentSchema.extend({ id: z.number().int(), name: z.string().max(30), role: roleSchema, level: z.number().int().min(1).max(3), task: z.enum(['idle', 'toKitchen', 'cooking', 'collect', 'deliver', 'clean']), guestId: z.number().int().nullable(), stationId: z.number().int().nullable(), timer: z.number().finite().nonnegative() });
export type Staff = Validated<z.infer<typeof staffSchema>>;
const guestSchema = agentSchema.extend({ id: z.number().int(), species: z.enum(['mouse', 'crocodile', 'rabbit', 'bear']), tableId: z.number().int(), seat: z.number().int().min(0).max(1), dish: z.enum(['salad', 'burger']), price: z.number().min(10).max(60), stage: z.enum(['arriving', 'waiting', 'cooking', 'ready', 'delivering', 'eating', 'leaving']), waiting: z.number().nonnegative(), timer: z.number().nonnegative(), happy: z.boolean(), stationId: z.number().int().nullable(), paid: z.boolean(), special: z.boolean().default(false) });
export type Guest = Validated<z.infer<typeof guestSchema>>;
export type Dish = Guest['dish'];
const totalsSchema = z.object({ revenue: z.number().nonnegative(), ingredients: z.number().nonnegative(), served: z.number().int().nonnegative(), missed: z.number().int().nonnegative(), tips: z.number().nonnegative() });
export type Totals = Validated<z.infer<typeof totalsSchema>>;
const challengeSchema = z.object({
  day: z.number().int().positive(), kind: z.enum(['special', 'salad', 'burger', 'served', 'quick', 'revenue', 'tips']),
  target: z.number().int().positive().max(1000), progress: z.number().int().nonnegative().max(1000), reward: z.number().int().positive().max(200), rewarded: z.boolean(),
}).refine(c => c.progress <= c.target && c.rewarded === (c.progress === c.target), 'Invalid challenge progress');
export type DailyChallenge = Validated<z.infer<typeof challengeSchema>>;
const challengesSchema = z.array(challengeSchema).max(3).default([]).refine(items => new Set(items.map(c => c.kind)).size === items.length, 'Duplicate challenges');
const reportSchema = totalsSchema.extend({ challenges: challengesSchema, day: z.number().int().positive(), wages: z.number().nonnegative(), rent: z.number().nonnegative(), debtPayment: z.number().nonnegative(), profit: z.number().finite(), rating: z.number().min(1).max(5) });
export type Report = Validated<z.infer<typeof reportSchema>>;
/** Validated versioned save. Arcade records live under a different key. */
export const restaurantSchema = z.object({
  version: z.literal(1), name: z.string().min(1).max(28), day: z.number().int().min(1), cash: z.number().finite(), reputation: z.number().min(1).max(5), debt: z.number().nonnegative(), expanded: z.boolean(),
  furniture: z.array(furnitureSchema).min(1).max(100), staff: z.array(staffSchema).min(2).max(6), guests: z.array(guestSchema).max(24), dirty: z.array(z.string().max(30)).max(40),
  menu: z.object({ salad: z.object({ enabled: z.boolean(), price: z.number().int().min(10).max(60) }), burger: z.object({ enabled: z.boolean(), price: z.number().int().min(10).max(60) }) }),
  phase: z.enum(['planning', 'service', 'report']), elapsed: z.number().finite().nonnegative(), nextArrival: z.number().finite().nonnegative(), clock: z.number().finite().nonnegative(), nextId: z.number().int().positive(), seed: z.number().finite(),
  lastActiveAt: z.number().finite().nonnegative().default(0), isPaused: z.boolean().default(false), renovation: z.boolean().default(false),
  dailyChallenges: challengesSchema, lifetimeChallengeBonus: z.number().int().nonnegative().default(0),
  totals: totalsSchema, history: z.array(reportSchema).max(20), lifetimeServed: z.number().int().nonnegative(), claimed: z.array(z.string()).max(10), music: z.boolean(), welcomed: z.boolean(),
});
export type RestaurantState = Validated<z.infer<typeof restaurantSchema>>;
export type CatalogItem = { name: string; description: string; price: number; size: number; category: 'Dining' | 'Kitchen' | 'Atmosphere'; comfort: number };
export const CATALOG: Record<FurnitureKind, CatalogItem> = {
  table: { name: 'Bistro table', description: 'Two seats. A little room for good company.', price: 180, size: 2, category: 'Dining', comfort: 0 },
  prep: { name: 'Prep counter', description: 'One chef can prepare garden salads here.', price: 240, size: 1, category: 'Kitchen', comfort: 0 },
  grill: { name: 'Charcoal grill', description: 'One chef can cook our signature burgers.', price: 360, size: 1, category: 'Kitchen', comfort: 0 },
  plant: { name: 'Olive planter', description: '+6 atmosphere. Happier guests leave better tips.', price: 65, size: 1, category: 'Atmosphere', comfort: 6 },
  divider: { name: 'Garden screen', description: '+4 atmosphere. Shape a cozy dining nook.', price: 80, size: 1, category: 'Atmosphere', comfort: 4 },
  lamp: { name: 'Warm lantern', description: '+8 atmosphere. A little golden-hour magic.', price: 110, size: 1, category: 'Atmosphere', comfort: 8 },
};
export const DISHES: Record<Dish, { name: string; cost: number; fair: number; seconds: number; station: FurnitureKind; description: string }> = {
  salad: { name: 'Garden salad', cost: 7, fair: 24, seconds: 6, station: 'prep', description: 'Crisp greens, ripe tomatoes, rooftop sunshine.' },
  burger: { name: 'Sunset burger', cost: 12, fair: 38, seconds: 10, station: 'grill', description: 'Charcoal-grilled, stacked high, made with love.' },
};
export const DAY_LENGTH = 150;
export const SAVE_KEY = 'kitchen-rush-restaurant-v1';
export const CELL = 1.4;
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
  return { version: 1, name: 'Little Rooftop', day: 1, cash: 1250, reputation: 3.5, debt: 0, expanded: false,
    furniture: [
      { id: 1, kind: 'prep', x: 1, z: 1, rotation: 0 }, { id: 2, kind: 'grill', x: 3, z: 1, rotation: 0 },
      { id: 3, kind: 'table', x: 1, z: 4, rotation: 0 }, { id: 4, kind: 'table', x: 5, z: 4, rotation: 0 }, { id: 5, kind: 'table', x: 7, z: 1, rotation: 0 },
      { id: 6, kind: 'plant', x: 0, z: 0, rotation: 0 }, { id: 7, kind: 'plant', x: 9, z: 7, rotation: 0 }, { id: 8, kind: 'lamp', x: 9, z: 0, rotation: 0 },
    ],
    staff: [
      { id: 10, name: 'Basil', role: 'chef', level: 1, x: 1, z: 2, yaw: Math.PI, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 },
      { id: 11, name: 'Pip', role: 'server', level: 1, x: 4, z: 7, yaw: 0, route: [], task: 'idle', guestId: null, stationId: null, timer: 0 },
    ], guests: [], dirty: [], menu: { salad: { enabled: true, price: 24 }, burger: { enabled: true, price: 38 } },
    lastActiveAt: 0, isPaused: false, renovation: false, dailyChallenges: [], lifetimeChallengeBonus: 0,
    phase: 'planning', elapsed: 0, nextArrival: 1, clock: 0, nextId: 20, seed: 91273, totals: freshTotals(), history: [], lifetimeServed: 0, claimed: [], music: false, welcomed: false,
  };
}
