import { describe, expect, it } from 'vitest';
import { alignmentSegments, footprintBounds, gridSegments } from '@/management/build-grid';
import { accessPoints, occupied, placementError } from '@/management/layout';
import { CATALOG, CELL, HEIGHT, createRestaurant, type Furniture, type FurnitureKind } from '@/management/types';

const table: Furniture = { id: -1, kind: 'table', x: 0, z: 7, rotation: 0 };
describe('furniture alignment grid', () => {
  it.each([10, 14])('covers all %s columns with one boundary per cell and no diagonals', columns => {
    const lines = gridSegments(columns);
    expect(lines.length).toBe((columns + HEIGHT + 2) * 2);
    for (let i = 0; i < lines.length; i += 2) {
      const [a, b] = [lines[i], lines[i + 1]];
      expect(a[0] === b[0] || a[2] === b[2]).toBe(true);
      expect(a[1]).toBeGreaterThan(.055);
      for (const point of [a, b]) {
        expect(point[0]).toBeGreaterThanOrEqual(-CELL / 2);
        expect(point[0]).toBeLessThanOrEqual((columns - .5) * CELL + .00001);
        expect(point[2]).toBeGreaterThanOrEqual(-CELL / 2);
        expect(point[2]).toBeLessThanOrEqual((HEIGHT - .5) * CELL + .00001);
      }
    }
    for (let x = 0; x <= columns; x++) expect(lines[x * 2][0]).toBeCloseTo((x - .5) * CELL);
  });
  it.each(Object.keys(CATALOG) as FurnitureKind[])('matches %s collision cells, including chairs', kind => {
    const item = { ...table, kind }, bounds = footprintBounds(item);
    expect((bounds.right - bounds.left) / CELL).toBeCloseTo(CATALOG[kind].size);
    expect((bounds.front - bounds.back) / CELL).toBeCloseTo(CATALOG[kind].size);
    const cells = occupied([item]); expect(cells.size).toBe(bounds.size ** 2);
    for (const key of cells) {
      const [x, z] = key.split(',').map(Number);
      expect(x * CELL).toBeGreaterThan(bounds.left); expect(x * CELL).toBeLessThan(bounds.right);
      expect(z * CELL).toBeGreaterThan(bounds.back); expect(z * CELL).toBeLessThan(bounds.front);
    }
  });
  it('keeps the square footprint snapped while rotating approach sockets', () => {
    for (let rotation = 0; rotation < 4; rotation++) {
      expect(footprintBounds({ ...table, rotation })).toEqual(footprintBounds(table));
      expect(accessPoints({ ...table, rotation })).toHaveLength(2);
    }
    expect(accessPoints({ ...table, rotation: 1 })).not.toEqual(accessPoints(table));
  });
  it('guides follow the draft cell edges and expand with the terrace', () => {
    const item = { ...table, x: 10 }, bounds = footprintBounds(item);
    const guides = alignmentSegments(item, 14);
    expect(guides[0][0]).toBe(bounds.left); expect(guides[1][0]).toBe(bounds.left);
    expect(guides[2][2]).toBe(bounds.back); expect(guides[3][2]).toBe(bounds.back);
    expect(guides[3][0]).toBe((14 - .5) * CELL);
  });
  it('uses existing collision/aisle rules and does not mutate state while previewing', () => {
    const state = createRestaurant(), before = structuredClone(state);
    expect(placementError(state, table)).toBeNull();
    expect(placementError(state, { ...table, x: 5, z: 4 })).toContain('occupied');
    expect(placementError(state, { ...table, kind: 'plant', x: 4, z: 9 })).toContain('entrance');
    expect(placementError(state, { ...table, x: 9, z: 5 })).toContain('inside');
    expect(placementError(state, { ...table, kind: 'plant', x: 1, z: 6 })).toContain('clear path');
    expect(placementError(state, state.furniture[2])).toBeNull();
    gridSegments(10); footprintBounds(table); alignmentSegments(table, 10);
    expect(state).toEqual(before);
  });
});
