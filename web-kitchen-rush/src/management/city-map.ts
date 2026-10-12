import { CELL } from './types';
import { neighborhoodBounds } from './park-motion';
import type { CityBuilding } from './city-lighting';

export type CityDistrict = 'city' | 'rooftop' | 'market' | 'gardens';
export const CITY_DISTRICTS: { id: CityDistrict; label: string }[] = [{ id: 'city', label: 'Whole city' }, { id: 'rooftop', label: 'Rooftop' }, { id: 'market', label: 'Market' }, { id: 'gardens', label: 'Gardens' }];
/** Outer streets never change the original traffic circuit or restaurant coordinates. */
export function outerRoads(columns: number) { return { left: -24, right: columns * CELL + 24, back: -27, front: 35 }; }
/** Actual bounds for each camera destination, including the tallest roof. */
export function cityMapBounds(columns: number, district: CityDistrict) {
  const r = outerRoads(columns);
  if (district === 'rooftop') return { ...neighborhoodBounds(columns), height: 4.3 };
  if (district === 'market') return { left: -19, right: columns * CELL + 17, back: -38, front: -16, height: 8 };
  if (district === 'gardens') return { left: -19, right: columns * CELL + 17, back: 21, front: 43, height: 3.5 };
  return { left: r.left - 11, right: r.right + 11, back: -40, front: 44, height: 9 };
}
/** 34 additional low-poly buildings arranged on walkable blocks, not scattered across roads. */
export function outerBuildings(columns: number): CityBuilding[] {
  const r = outerRoads(columns), center = (columns - 1) * CELL / 2;
  const colors = ['#F0AB70', '#8DA69A', '#B76544', '#E4C782', '#8999A3'];
  const buildings: CityBuilding[] = [];
  const add = (x: number, z: number, height: number, facing: number) => { const index = buildings.length; buildings.push({ x, z, height, facing, color: colors[index % colors.length], index }); };
  for (let i = 0; i < 9; i++) {
    add(center - 25 + i * 6.2, -34, 4.8 + i % 3 * 1.2, 0);
    add(center - 25 + i * 6.2, -20, 3.6 + i % 2 * .9, Math.PI);
  }
  for (const x of [r.left - 7, r.right + 7]) for (let i = 0; i < 6; i++) add(x, -18 + i * 8.5, 3.4 + (5 - i) * .5, x < 0 ? Math.PI / 2 : -Math.PI / 2);
  for (const x of [-16, columns * CELL + 16]) for (const z of [25, 41]) add(x, z, 2.7, z < 30 ? 0 : Math.PI);
  return buildings;
}
