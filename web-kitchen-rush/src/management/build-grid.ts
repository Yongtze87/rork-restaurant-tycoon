import { CATALOG, CELL, HEIGHT, type Furniture } from './types';

/** Floor-space endpoints, in pairs for screen-width-stable grid lines. */
export type GridVertex = [number, number, number];

/** Lines sit just above the floor and match the simulation's cell boundaries exactly. */
export function gridSegments(columns: number): GridVertex[] {
  const points: GridVertex[] = [];
  const left = -CELL / 2, right = (columns - .5) * CELL, back = -CELL / 2, front = (HEIGHT - .5) * CELL;
  for (let x = 0; x <= columns; x++) points.push([left + x * CELL, .09, back], [left + x * CELL, .09, front]);
  for (let z = 0; z <= HEIGHT; z++) points.push([left, .09, back + z * CELL], [right, .09, back + z * CELL]);
  return points;
}

/** The catalog's full footprint includes both the table and its chairs. */
export function footprintBounds(item: Furniture) {
  const size = CATALOG[item.kind].size;
  return { left: (item.x - .5) * CELL, right: (item.x + size - .5) * CELL, back: (item.z - .5) * CELL, front: (item.z + size - .5) * CELL, size };
}

/** Dotted guides extend the leading cell edges across the editable terrace. */
export function alignmentSegments(item: Furniture, columns: number): GridVertex[] {
  const { left, back } = footprintBounds(item);
  return [[left, .1, -CELL / 2], [left, .1, (HEIGHT - .5) * CELL], [-CELL / 2, .1, back], [(columns - .5) * CELL, .1, back]];
}
