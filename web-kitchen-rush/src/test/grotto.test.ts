import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { accessPoints, findPath, placementError } from '@/management/layout';
import { BOOTH, CATALOG, GROTTO_X, capacity, entrance, furnitureUpgradeCost, restaurantSchema, upgradeEffectText, width, type FurnitureKind } from '@/management/types';

const grotto = (): RestaurantEngine => { const e = new RestaurantEngine(); e.state.expanded = true; e.state.cash = 10_000; return e; };
/** Only a kitchen and one seating piece in the grotto; the menu is kelp salad alone. */
function serveAt(kind: FurnitureKind): RestaurantEngine {
  const e = grotto();
  e.state.furniture = e.state.furniture.filter(f => f.kind === 'prep' || f.kind === 'grill');
  expect(e.place({ id: -1, kind, x: 11, z: 4, rotation: 0 })).toBeNull();
  expect(e.setDish('burger', false, e.state.menu.burger.price)).toBeNull();
  expect(e.open()).toBeNull();
  for (let i = 0; i < 4000 && e.state.day === 1; i++) e.update(.1);
  return e;
}

describe('east grotto booths', () => {
  it('can only stand with their whole footprint in the grotto', () => {
    const e = grotto(), booth = { id: -1, kind: 'booth' as const, x: GROTTO_X, z: 4, rotation: 0 };
    expect(placementError(e.state, booth)).toBeNull();
    expect(placementError(e.state, { ...booth, x: GROTTO_X - 1 })).toBe('Grotto booths go in the east grotto.');
    expect(placementError(e.state, { ...booth, x: 3, z: 6 })).toBe('Grotto booths go in the east grotto.');
    expect(e.place({ ...booth, x: 2, z: 6 })).toBe('Grotto booths go in the east grotto.');
    expect(placementError(new RestaurantEngine().state, booth)).not.toBeNull(); // grotto not bought yet
    const cash = e.state.cash; expect(e.place(booth)).toBeNull(); expect(e.state.cash).toBe(cash - CATALOG.booth.price);
    const placed = e.state.furniture[e.state.furniture.length - 1];
    for (const point of accessPoints(placed)) expect(findPath(e.state.furniture, width(e.state), entrance, point)).not.toBeNull();
    expect(e.place({ ...placed, x: 6 })).toBe('Grotto booths go in the east grotto.');
    expect(e.place({ ...placed, x: 12, z: 7 })).toBeNull();
    expect(restaurantSchema.safeParse(e.state).success).toBe(true);
  });

  it('counts as two seats, upgrades like a table and sells for 70%', () => {
    const e = grotto(), seats = capacity(e.state);
    expect(e.place({ id: -1, kind: 'booth', x: 11, z: 2, rotation: 1 })).toBeNull();
    expect(capacity(e.state)).toBe(seats + 2);
    const booth = e.state.furniture[e.state.furniture.length - 1];
    expect(upgradeEffectText(booth)).toContain('Tips +');
    expect(e.upgradeFurniture(booth.id)).toBeNull(); expect(booth.level).toBe(2);
    expect(furnitureUpgradeCost('booth', 2)).toBeGreaterThan(furnitureUpgradeCost('table', 2));
    const cash = e.state.cash; expect(e.sell(booth.id)).toBeNull(); expect(e.state.cash).toBe(cash + Math.floor(CATALOG.booth.price * .7));
    expect(capacity(e.state)).toBe(seats);
  });

  it('booth guests pay the menu price × 1.3 and tip more', () => {
    const price = 24, booth = serveAt('booth'), table = serveAt('table');
    for (const e of [booth, table]) expect(e.state.history[0].served).toBeGreaterThan(2);
    const b = booth.state.history[0], t = table.state.history[0];
    expect(b.revenue).toBe(b.served * Math.round(price * BOOTH.price));
    expect(t.revenue).toBe(t.served * price);
    expect(b.tips / b.served).toBeGreaterThan(t.tips / t.served);
  });
});
