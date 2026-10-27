import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { capacity, comfort, CATALOG, restaurantSchema, type FurnitureKind } from '@/management/types';
import { accessPoints, findPath, placementError } from '@/management/layout';
import { entrance } from '@/management/types';

function memoryStorage() {
  let value: string | null = null;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
}

describe('interior investments', () => {
  it.each(['table', 'plant', 'lamp', 'divider', 'prep', 'grill'] as FurnitureKind[])('buys, restores, moves and sells %s using the real register', kind => {
    const storage = memoryStorage(), e = new RestaurantEngine(storage), before = e.state.cash, seats = capacity(e.state), cozy = comfort(e.state);
    expect(e.place({ id: -1, kind, x: 0, z: 7, rotation: 0 })).toBeNull();
    expect(e.state.cash).toBe(before - CATALOG[kind].price);
    expect(capacity(e.state)).toBe(seats + (kind === 'table' ? 2 : 0));
    expect(comfort(e.state)).toBe(cozy + CATALOG[kind].comfort);
    const restored = new RestaurantEngine(storage), item = restored.state.furniture[restored.state.furniture.length - 1];
    expect(restored.state).toEqual(e.state); expect(restored.loadWarning).toBe('');
    for (const point of accessPoints(item)) expect(findPath(restored.state.furniture, 10, entrance, point)).not.toBeNull();
    expect(restored.place({ ...item, x: 2 })).toBeNull();
    expect(restored.state.cash).toBe(before - CATALOG[kind].price);
    expect(restored.sell(item.id)).toBeNull();
    expect(restored.state.cash).toBe(before - CATALOG[kind].price + Math.floor(CATALOG[kind].price * .7));
    const after = restored.state.cash; expect(restored.sell(item.id)).not.toBeNull(); expect(restored.state.cash).toBe(after);
    expect(restaurantSchema.safeParse(restored.state).success).toBe(true);
  });

  it('spends real service earnings and bonus without changing the archived daily result', () => {
    const e = new RestaurantEngine(memoryStorage()); e.open();
    for (let i = 0; i < 4000 && !e.state.history.length; i++) e.update(.1);
    expect(e.state.phase).toBe('service'); expect(e.state.history).toHaveLength(1);
    const receipt = JSON.stringify(e.state.history[0]);
    const earnedBalance = 1250 + e.state.history[0].profit + e.state.lifetimeChallengeBonus;
    expect(e.state.cash).toBe(earnedBalance); expect(e.state.history[0].served).toBeGreaterThan(0);
    expect(e.place({ id: -1, kind: 'table', x: 0, z: 7, rotation: 0 })).toBeNull();
    expect(e.place({ id: -1, kind: 'plant', x: 9, z: 8, rotation: 0 })).toBeNull();
    expect(e.state.cash).toBe(earnedBalance - 245); expect(JSON.stringify(e.state.history[0])).toBe(receipt);
    for (let i = 0; i < 600; i++) e.update(.1);
    expect(e.state.totals.served).toBeGreaterThan(0);
  });

  it('keeps failed or mid-service purchases atomic and preserves the saved balance', () => {
    const storage = memoryStorage(), e = new RestaurantEngine(storage); e.welcome();
    const saved = storage.getItem(), before = JSON.stringify(e.state);
    const invalid = { id: -1, kind: 'table' as const, x: 9, z: 9, rotation: 0 };
    expect(placementError(e.state, invalid)).not.toBeNull(); expect(e.place(invalid)).not.toBeNull();
    expect(JSON.stringify(e.state)).toBe(before); expect(storage.getItem()).toBe(saved);
    e.state.cash = 179;
    expect(e.place({ ...invalid, x: 0, z: 7 })).toContain('Not enough'); expect(e.state.cash).toBe(179);
    e.state.cash = 1250; e.open();
    for (let i = 0; i < 400 && !e.state.guests.some(g => g.stage === 'waiting' || g.stage === 'cooking'); i++) e.update(.1);
    const busy = e.state.guests.find(g => g.stage === 'waiting' || g.stage === 'cooking')!, table = e.state.furniture.find(f => f.id === busy.tableId)!, service = JSON.stringify(e.state);
    expect(e.sell(table.id)).toContain('Guests are at this table'); expect(e.place({ ...table, x: table.x, z: table.z, rotation: (table.rotation + 1) % 4 })).toContain('Guests are at this table');
    expect(JSON.stringify(e.state)).toBe(service);
  });
  it('builds and moves while open: guests and crew re-route and service carries on', () => {
    const e = new RestaurantEngine(); e.open();
    for (let i = 0; i < 300; i++) e.update(.1);
    const walking = e.state.guests.length + e.state.staff.filter(m => m.route.length).length; expect(walking).toBeGreaterThan(0);
    expect(e.place({ id: -1, kind: 'table', x: 0, z: 7, rotation: 0 })).toBeNull();
    const plant = e.state.furniture.find(f => f.kind === 'plant'); if (plant) expect(e.place({ ...plant, rotation: (plant.rotation + 1) % 4 })).toBeNull();
    const served = e.state.totals.served;
    for (let i = 0; i < 1500; i++) e.update(.1);
    expect(e.state.totals.served).toBeGreaterThan(served);
    for (const agent of [...e.state.guests, ...e.state.staff]) for (const p of agent.route.slice(0, -1)) expect(placementError(e.state, { id: -2, kind: 'plant', x: Math.round(p.x), z: Math.round(p.z), rotation: 0 }) === 'This space is already occupied.').toBe(false);
  });
});
