import { describe, expect, it } from 'vitest';
import { CITY_DISTRICTS, cityMapBounds, outerBuildings, outerRoads } from '@/management/city-map';
import { neighborhoodBounds, PARK } from '@/management/park-motion';
import { BULLETIN } from '@/management/bulletin';
import { cityLoop } from '@/management/city-motion';

describe('expanded city map', () => {
  it.each([10, 14])('adds distinct outer blocks without moving the original neighborhood at %s columns', columns => {
    const houses = outerBuildings(columns), bounds = cityMapBounds(columns, 'city'), old = neighborhoodBounds(columns), road = outerRoads(columns);
    expect(houses).toHaveLength(34); expect(new Set(houses.map(h => `${h.x},${h.z}`)).size).toBe(34);
    expect((bounds.right - bounds.left) * (bounds.front - bounds.back)).toBeGreaterThan((old.right - old.left) * (old.front - old.back) * 4);
    for (const h of houses) {
      expect(h.x - 2.4).toBeGreaterThan(bounds.left); expect(h.x + 2.4).toBeLessThan(bounds.right);
      expect(h.z - 2.4).toBeGreaterThan(bounds.back); expect(h.z + 2.4).toBeLessThan(bounds.front);
      for (const x of [road.left, road.right]) expect(Math.abs(h.x - x)).toBeGreaterThan(5.1);
      for (const z of [road.back, road.front]) expect(Math.abs(h.z - z)).toBeGreaterThan(5.1);
      expect(Math.hypot(h.x - PARK.x, h.z - PARK.z)).toBeGreaterThan(9);
      expect(Math.hypot(h.x - BULLETIN.x, h.z - BULLETIN.z)).toBeGreaterThan(5);
    }
    expect(cityLoop(columns).front).toBe(18.7);
  });
  it.each(CITY_DISTRICTS)('fits a finite nonempty destination for $label', ({ id }) => {
    const b = cityMapBounds(10, id); expect(b.right).toBeGreaterThan(b.left); expect(b.front).toBeGreaterThan(b.back); expect(b.height).toBeGreaterThan(0);
  });
});
