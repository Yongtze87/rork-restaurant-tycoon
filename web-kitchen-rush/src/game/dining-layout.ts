/** Shared world-space furniture and routes, entirely outside chef collision bounds. */
export const DINING_TABLES = [
  { id: 1, x: -5.8, z: -6.6 },
  { id: 2, x: -.5, z: -6.6 },
  { id: 3, x: 4.8, z: -6.6 },
] as const;
export const DINING_SEATS = DINING_TABLES.flatMap(table => [-1, 1].map(side => ({
  id: `${table.id}-${side}`, table: table.id, side, x: table.x + side * 1.3, z: table.z,
  yaw: -side * Math.PI / 2, mealX: table.x + side * .5, mealZ: table.z,
})));
export const GUEST_ENTRY = { x: 9.15, z: -6.25 };
export const ARRIVAL_LANE = -5.22;
export const EXIT_LANE = -4.62;
export const GUEST_SPEED = 2.1;
export const MAX_VISIBLE_GUESTS = 16;
export type DiningSeat = typeof DINING_SEATS[number];
export type GuestPoint = { x: number; z: number };
