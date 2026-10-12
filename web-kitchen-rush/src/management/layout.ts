import { CATALOG, HEIGHT, entrance, width, type Furniture, type Point, type RestaurantState } from './types';

export const cellKey = (p: Point): string => `${p.x},${p.z}`;
export const sameCell = (a: Point, b: Point): boolean => a.x === b.x && a.z === b.z;
/** Rotate local grid/socket coordinates around a furniture footprint center. */
export function localPoint(item: Furniture, x: number, z: number): Point {
  const center = (CATALOG[item.kind].size - 1) / 2;
  let dx = x - center, dz = z - center;
  for (let i = 0; i < item.rotation; i++) { const previous = dx; dx = -dz; dz = previous; }
  return { x: item.x + center + dx, z: item.z + center + dz };
}
export function accessPoints(item: Furniture): Point[] {
  if (item.kind === 'table') return [localPoint(item, 0, 2), localPoint(item, 1, 2)];
  if (item.kind === 'prep' || item.kind === 'grill') return [localPoint(item, 0, 1)];
  return [];
}
export const seatPoint = (item: Furniture, seat: number): Point => localPoint(item, seat === 0 ? .08 : .92, 1.05);
export function occupied(items: Furniture[]): Set<string> {
  const blocked = new Set<string>();
  for (const item of items) for (let x = 0; x < CATALOG[item.kind].size; x++) for (let z = 0; z < CATALOG[item.kind].size; z++) blocked.add(cellKey({ x: item.x + x, z: item.z + z }));
  return blocked;
}
export function inBounds(p: Point, columns: number): boolean { return p.x >= 0 && p.x < columns && p.z >= 0 && p.z < HEIGHT; }
/** Four-way BFS: paths use actual empty tiles, never diagonal shortcuts through tables. */
export function findPath(items: Furniture[], columns: number, start: Point, end: Point): Point[] | null {
  const from = { x: Math.round(start.x), z: Math.round(start.z) }, to = { x: Math.round(end.x), z: Math.round(end.z) };
  const blocked = occupied(items);
  if (!inBounds(from, columns) || !inBounds(to, columns) || blocked.has(cellKey(to))) return null;
  const queue: Point[] = [from], parents = new Map<string, Point | null>([[cellKey(from), null]]);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (sameCell(cell, to)) {
      const result: Point[] = []; let cursor: Point | null = cell;
      while (cursor && !sameCell(cursor, from)) { result.unshift(cursor); cursor = parents.get(cellKey(cursor)) ?? null; }
      return result;
    }
    for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const next = { x: cell.x + dx, z: cell.z + dz }, key = cellKey(next);
      if (!inBounds(next, columns) || blocked.has(key) || parents.has(key)) continue;
      parents.set(key, cell); queue.push(next);
    }
  }
  return null;
}
/** Validate both collision and all customer/staff approach cells before charging. */
export function layoutError(items: Furniture[], columns: number): string | null {
  const cells = new Set<string>();
  for (const item of items) {
    for (let x = 0; x < CATALOG[item.kind].size; x++) for (let z = 0; z < CATALOG[item.kind].size; z++) {
      const p = { x: item.x + x, z: item.z + z }, key = cellKey(p);
      if (!inBounds(p, columns)) return 'Keep every tile inside your terrace.';
      if (sameCell(p, entrance)) return 'Keep the entrance clear.';
      if (cells.has(key)) return 'This space is already occupied.';
      cells.add(key);
    }
  }
  for (const item of items) for (const point of accessPoints(item)) if (findPath(items, columns, entrance, point) === null) return `Leave a clear path to every ${item.kind === 'table' ? 'chair' : 'workstation'}. Rotate it or leave an aisle.`;
  return null;
}
export function placementError(state: RestaurantState, candidate: Furniture): string | null {
  return layoutError([...state.furniture.filter(f => f.id !== candidate.id), candidate], width(state));
}
