import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Batch, type InstanceSpec } from '@/scene/Primitives';
import { CELL } from './types';
import { outerRoads } from './city-map';

const noRaycast = (): void => {};
/** Outer boulevards, market paving and garden promenades, rendered in two instanced batches. */
export const CityDistricts = memo(function CityDistricts({ columns }: { columns: number }) {
  const root = useRef<THREE.Group>(null);
  const parts = useMemo(() => {
    const blocks: InstanceSpec[] = [], leaves: InstanceSpec[] = [];
    const r = outerRoads(columns), center = (r.left + r.right) / 2, span = r.right - r.left;
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) => blocks.push({ position: [x, y, z], scale: [sx, sy, sz], color });
    // Four continuous avenues with pale sidewalks. The center is left untouched for existing scenery.
    for (const z of [r.back, r.front]) {
      box(center, -1.09, z, span + 11, .06, 9, '#F6E7CA');
      box(center, -1.025, z, span + 5.4, .05, 5.4, '#52616A');
      for (let x = r.left + 4; x < r.right - 3; x += 3) box(x, -.99, z, 1.25, .025, .09, '#FFF2D7');
    }
    for (const x of [r.left, r.right]) {
      box(x, -1.09, 4, 9, .06, 71, '#F6E7CA');
      box(x, -1.022, 4, 5.4, .05, 67.4, '#52616A');
      for (let z = r.back + 5; z < r.front - 4; z += 3) box(x, -.987, z, .09, .025, 1.25, '#FFF2D7');
      for (const z of [r.back + 4, r.front - 4]) for (let i = -3; i <= 3; i++) box(x + i * .65, -.98, z, .35, .025, 1.4, '#FFF2D7');
    }
    // Broad pedestrian connections to the old neighborhood; no intersections on moving traffic lanes.
    box(center, -1.04, -17.1, columns * CELL + 37, .1, 2, '#F6E7CA');
    box(center, -1.04, 29.7, span - 5.4, .1, 2.4, '#F6E7CA');
    box(5.6, -1.04, 28.2, 2.2, .1, 3, '#F6E7CA');
    // Two green squares make the foreground a garden district instead of an occluding wall of towers.
    for (const x of [-12, columns * CELL + 12]) {
      box(x, -1.065, 30.2, 11, .07, 5.7, '#82935E');
      box(x, -1.015, 30.2, 11, .04, 1.2, '#F6E7CA');
      for (const dx of [-4, 0, 4]) for (const z of [28.5, 32]) {
        box(x + dx, -.15, z, .18, 1.8, .18, '#73513D');
        leaves.push({ position: [x + dx, 1.1, z], scale: [.85, 1.25, .85], color: dx === 0 ? '#8C9D70' : '#667D52' });
      }
    }
    for (const x of [r.left + 3.8, r.right - 3.8]) for (let z = -21; z < 25; z += 7) {
      box(x, -.95, z, 1.6, .22, 1.6, '#B76544'); box(x, .1, z, .19, 2, .19, '#73513D');
      leaves.push({ position: [x, 1.5, z], scale: [1.05, 1.3, 1.05], color: '#82935E' });
    }
    // A sunken water garden in the distant foreground, framed by two low paths.
    box(center, -1.07, 40, 18, .09, 4.5, '#224F4A'); box(center, -1.01, 40, 17.6, .035, 4.1, '#B7E5EF');
    for (const z of [37.3, 42.7]) box(center, -1.035, z, 20, .1, .85, '#F6E7CA');
    box(center, -.85, 40, 1.5, .28, 6.5, '#B76544');
    return { blocks, leaves };
  }, [columns]);
  useLayoutEffect(() => { root.current?.traverse(node => { if (node instanceof THREE.Mesh) node.raycast = noRaycast; }); }, [parts]);
  return <group name="outer-city-districts" ref={root}><Batch items={parts.blocks} /><Batch items={parts.leaves} shape="sphere" /></group>;
});
