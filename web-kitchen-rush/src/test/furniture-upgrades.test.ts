import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { CATALOG, DISHES, FURNITURE_MAX_LEVEL, SAVE_KEY, comfort, createRestaurant, furnitureComfort, furnitureKind, furnitureUpgradeCost, guestPatienceSeconds, restaurantSchema, stationSpeedup, tableTipBonus, upgradeEffectText, type FurnitureKind } from '@/management/types';
import { furnitureSprite, SPRITES } from '@/management/iso/sprites';

const KINDS = furnitureKind.options as FurnitureKind[];
function memoryStorage(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
}
const rich = (): RestaurantEngine => { const e = new RestaurantEngine(); e.state.cash = 1_000_000; return e; };
/** Upgrade every piece of these kinds to `level` through the real engine method, then reset cash so both runs start equal. */
function upgraded(kinds: FurnitureKind[], level: number): RestaurantEngine {
  const e = rich();
  for (const item of e.state.furniture.filter(f => kinds.includes(f.kind))) while (item.level < level) expect(e.upgradeFurniture(item.id)).toBeNull();
  e.state.cash = 1250; return e;
}
function serve(e: RestaurantEngine, seconds: number): RestaurantEngine { expect(e.open()).toBeNull(); for (let i = 0; i < seconds * 10 && e.state.day === 1; i++) e.update(.1); return e; }

describe('furniture upgrade tiers', () => {
  it('costs grow with every level for every kind, using the shared formula', () => {
    expect(furnitureUpgradeCost('table', 2)).toBe(Math.round(180 * .4 * 2 ** 1.3 / 5) * 5);
    expect(furnitureUpgradeCost('table', 2)).toBe(175);
    for (const kind of KINDS) for (let level = 3; level <= FURNITURE_MAX_LEVEL; level++) {
      expect(furnitureUpgradeCost(kind, level)).toBeGreaterThan(furnitureUpgradeCost(kind, level - 1));
      expect(furnitureUpgradeCost(kind, level) % 5).toBe(0);
    }
  });

  it('upgrades instantly for the exact cost, only while planning', () => {
    const e = new RestaurantEngine(), table = e.state.furniture.find(f => f.kind === 'table')!, cost = furnitureUpgradeCost('table', 2);
    expect(table.level).toBe(1);
    expect(e.upgradeFurniture(table.id)).toBeNull();
    expect(table.level).toBe(2); expect(e.state.cash).toBe(1250 - cost);
    expect(e.upgradeFurniture(999)).toContain('Select');
    e.open(); const during = JSON.stringify(e.state);
    expect(e.upgradeFurniture(table.id)).toBe('Upgrade furniture between service days.');
    expect(JSON.stringify(e.state)).toBe(during);
  });

  it('checks cash without spending and stops at the highest level', () => {
    const e = new RestaurantEngine(), lamp = e.state.furniture.find(f => f.kind === 'lamp')!, cost = furnitureUpgradeCost('lamp', 2);
    e.state.cash = cost - 1;
    expect(e.upgradeFurniture(lamp.id)).toBe(`This upgrade costs $${cost}.`);
    expect(lamp.level).toBe(1); expect(e.state.cash).toBe(cost - 1);
    e.state.cash = cost; expect(e.upgradeFurniture(lamp.id)).toBeNull(); expect(e.state.cash).toBe(0);
    lamp.level = FURNITURE_MAX_LEVEL - 1; e.state.cash = 1_000_000;
    expect(e.upgradeFurniture(lamp.id)).toBeNull(); expect(lamp.level).toBe(FURNITURE_MAX_LEVEL);
    const cash = e.state.cash;
    expect(e.upgradeFurniture(lamp.id)).toBe('Already at the highest level.'); expect(e.state.cash).toBe(cash);
    expect(upgradeEffectText(lamp)).toBeNull();
    expect(restaurantSchema.safeParse(e.state).success).toBe(true);
    expect(restaurantSchema.safeParse({ ...e.state, furniture: [{ ...lamp, level: 16 }] }).success).toBe(false);
  });

  it('switches looks at levels 6 and 11 and has a sprite slot for every kind and look', () => {
    for (const kind of KINDS) {
      for (const level of [1, 5]) expect(furnitureSprite(kind, level)).toBe(`furniture.${kind}`);
      for (const level of [6, 10]) expect(furnitureSprite(kind, level)).toBe(`furniture.${kind}.2`);
      for (const level of [11, 15]) expect(furnitureSprite(kind, level)).toBe(`furniture.${kind}.3`);
      for (const look of [1, 6, 11]) expect(SPRITES[furnitureSprite(kind, look)]).toBeDefined();
    }
    expect(SPRITES['furniture.table.3'].src).toBe('/art/furniture/table-3.webp');
    expect(SPRITES['furniture.lamp.3'].src).toBeUndefined();
  });

  it('loads old saves without a level as level 1, and saves the level', () => {
    const old = createRestaurant() as unknown as { furniture: Record<string, unknown>[] };
    old.furniture.forEach(item => { delete item.level; });
    const e = new RestaurantEngine(memoryStorage(JSON.stringify(old)));
    expect(e.loadWarning).toBe('');
    expect(e.state.furniture.every(f => f.level === 1)).toBe(true);
    expect(comfort(e.state)).toBe(comfort(createRestaurant()));
    const storage = memoryStorage(), saved = new RestaurantEngine(storage), table = saved.state.furniture.find(f => f.kind === 'table')!;
    saved.upgradeFurniture(table.id);
    expect(JSON.parse(storage.getItem()!).furniture.find((f: { id: number }) => f.id === table.id).level).toBe(2);
    expect(new RestaurantEngine(storage).state.furniture.find(f => f.id === table.id)!.level).toBe(2);
    expect(SAVE_KEY).toBe('vast-ocean-restaurant-v1');
  });

  it('keeps the level when moving or rotating, and new purchases start at level 1', () => {
    const e = rich(), plant = e.state.furniture.find(f => f.kind === 'plant')!;
    for (let i = 0; i < 6; i++) e.upgradeFurniture(plant.id);
    expect(plant.level).toBe(7);
    expect(e.place({ ...plant, x: 2, z: 7, level: 1 })).toBeNull();
    expect(e.state.furniture.find(f => f.id === plant.id)).toMatchObject({ x: 2, z: 7, level: 7 });
    expect(e.place({ ...plant, x: 2, z: 7, rotation: 1 })).toBeNull();
    expect(e.state.furniture.find(f => f.id === plant.id)!.level).toBe(7);
    expect(e.place({ id: -1, kind: 'lamp', x: 9, z: 8, rotation: 0, level: 12 })).toBeNull();
    expect(e.state.furniture[e.state.furniture.length - 1].level).toBe(1);
    const cash = e.state.cash; expect(e.sell(plant.id)).toBeNull();
    expect(e.state.cash).toBe(cash + Math.floor(CATALOG.plant.price * .7));
  });

  it('table upgrades raise real tips and atmosphere', () => {
    expect(tableTipBonus(1)).toBe(0); expect(tableTipBonus(3)).toBeCloseTo(.06);
    expect(furnitureComfort({ kind: 'table', level: 4 })).toBe(3);
    const base = serve(new RestaurantEngine(), 140), better = upgraded(['table'], 6);
    expect(comfort(better.state)).toBe(comfort(base.state) + 3 * 5);
    serve(better, 140);
    expect(base.state.totals.served).toBeGreaterThan(3);
    expect(better.state.totals.tips).toBeGreaterThan(base.state.totals.tips);
    expect(upgradeEffectText({ kind: 'table', level: 1 })).toBe('Tips +3% · +1 atmosphere');
    expect(upgradeEffectText({ kind: 'table', level: 2 })).toBe('Tips +3% → +6% · +1 atmosphere');
  });

  it('kitchen upgrades shorten real cooking at that station, capped at 40%', () => {
    expect(stationSpeedup(2)).toBeCloseTo(.03); expect(stationSpeedup(14)).toBeCloseTo(.39); expect(stationSpeedup(15)).toBe(.4);
    const firstCook = (e: RestaurantEngine) => {
      e.open();
      for (let i = 0; i < 2000; i++) { e.update(.1); const chef = e.state.staff.find(s => s.task === 'cooking'); if (chef) return { timer: chef.timer, dish: e.state.guests.find(g => g.id === chef.guestId)!.dish }; }
      throw new Error('No chef started cooking');
    };
    const base = firstCook(new RestaurantEngine()), fast = firstCook(upgraded(['prep', 'grill'], 15));
    expect(base.dish).toBe(fast.dish);
    expect(base.timer).toBeCloseTo(DISHES[base.dish].seconds);
    expect(fast.timer).toBeCloseTo(DISHES[base.dish].seconds * .6);
    const slow = serve(new RestaurantEngine(), 140), quick = serve(upgraded(['prep', 'grill'], 15), 140);
    expect(quick.state.totals.served).toBeGreaterThanOrEqual(slow.state.totals.served);
    expect(comfort(upgraded(['prep', 'grill'], 15).state)).toBe(comfort(createRestaurant()));
    expect(upgradeEffectText({ kind: 'grill', level: 1 })).toBe('Cooks 3% faster');
    expect(upgradeEffectText({ kind: 'prep', level: 3 })).toBe('Cooks 6% → 9% faster');
  });

  it('decor upgrades add atmosphere, which lengthens patience and raises tips, capped at 100', () => {
    const base = new RestaurantEngine(), cozy = upgraded(['plant', 'lamp'], 15);
    expect(comfort(cozy.state)).toBe(comfort(base.state) + 3 * 14);
    expect(guestPatienceSeconds(cozy.state)).toBeGreaterThan(guestPatienceSeconds(base.state));
    serve(base, 140); serve(cozy, 140);
    expect(cozy.state.totals.tips).toBeGreaterThan(base.state.totals.tips);
    expect(upgradeEffectText({ kind: 'divider', level: 4 })).toBe('+1 atmosphere');
    const full = upgraded(['plant', 'lamp', 'table'], 15);
    expect(comfort(full.state)).toBe(100);
  });
});
