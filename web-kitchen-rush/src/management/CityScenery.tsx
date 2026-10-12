import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Batch, Box, type InstanceSpec } from '@/scene/Primitives';
import { CELL } from './types';
import { cityLoop, sampleStreet } from './city-motion';
import { cityFixtures } from './city-lighting';
import { outerBuildings } from './city-map';
import { CityDistricts } from './CityDistricts';

function PavedIsland({ columns, offset, y, color }: { columns: number; offset: number; y: number; color: string }) {
  const geometry = useMemo(() => {
    const loop = cityLoop(columns, offset), p = { x: 0, z: 0, yaw: 0 };
    const points = Array.from({ length: 256 }, (_, i) => { sampleStreet(loop, i / 256 * loop.length, 1, p); return new THREE.Vector2(p.x, -p.z); });
    return new THREE.ShapeGeometry(new THREE.Shape(points));
  }, [columns, offset]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><meshStandardMaterial color={color} roughness={1} /></mesh>;
}

/** Environment details are instanced; none enter the build grid or pointer hit targets. */
export const CityScenery = memo(function CityScenery({ columns }: { columns: number }) {
  const root = useRef<THREE.Group>(null);
  const parts = useMemo(() => {
    const blocks: InstanceSpec[] = [], leaves: InstanceSpec[] = [];
    const fixtures = cityFixtures(columns);
    const box = (position: [number, number, number], scale: [number, number, number], color: string, rotation?: [number, number, number]) => blocks.push({ position, scale, color, rotation });
    const right = columns * CELL + 4.1, center = (columns - 1) * CELL / 2;
    const loop = cityLoop(columns), p = { x: 0, z: 0, yaw: 0 };
    for (let i = 0; i < Math.floor(loop.length / 2.3); i++) {
      sampleStreet(loop, i * 2.3, 1, p);
      box([p.x, -1.006, p.z], [.09, .025, .85], '#F6E7CA', [0, p.yaw, 0]);
    }
    // Raised pavement seams and curb edging, leaving the main guest entrance clear.
    const curb = cityLoop(columns, -2.48);
    for (let i = 0; i < Math.floor(curb.length / .85); i++) {
      sampleStreet(curb, i * .85, 1, p);
      box([p.x, -.94, p.z], [.12, .15, .73], i % 6 === 0 ? '#F2B743' : '#FFF2D7', [0, p.yaw, 0]);
    }
    // A quiet zebra crossing marks the side street; ambient walkers stay on the pavement.
    for (let i = 0; i < 7; i++) box([-7.4 + i * .64, -.998, 6.3], [.34, .025, 1.8], '#FFF2D7');
    const tree = (x: number, z: number, size = 1) => {
      box([x, -.77, z], [1.45, .25, 1.45], '#B76544');
      box([x, -.62, z], [1.3, .09, 1.3], '#66766B');
      box([x, .35, z], [.2, 2.1, .2], '#73513D');
      leaves.push({ position: [x, 1.65, z], scale: [.85 * size, 1.12 * size, .83 * size], color: '#667D52' });
      leaves.push({ position: [x - .35, 1.38, z + .1], scale: [.65 * size, .73 * size, .62 * size], color: '#82935E' });
    };
    const lamp = (x: number, z: number) => {
      box([x, .55, z], [.095, 2.95, .095], '#224F4A');
      box([x, -.72, z], [.34, .38, .34], '#224F4A');
      box([x, 1.91, z], [.44, .14, .44], '#224F4A');
      box([x, 1.43, z], [.34, .08, .34], '#224F4A');
    };
    for (const x of [-9.3, right + 3.8]) for (const z of [-3, 5, 14.4]) tree(x, z, .9);
    tree(right - 2, 24.2, 1.05);
    fixtures.lamps.forEach(({ x, z }) => lamp(x, z));
    const building = (x: number, z: number, height: number, color: string, facing: number, index: number) => {
      const width = 4.2, depth = 3.8, base = -1.03;
      const local = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, c: string) => box([x + dx * Math.cos(facing) + dz * Math.sin(facing), base + y, z - dx * Math.sin(facing) + dz * Math.cos(facing)], [sx, sy, sz], c, [0, facing, 0]);
      local(0, height / 2, 0, width, height, depth, color);
      local(0, .17, 0, width + .3, .34, depth + .3, '#F6E7CA');
      local(0, height, 0, width + .32, .24, depth + .32, '#FFF2D7');
      local(0, height + .13, 0, width - .35, .08, depth - .35, '#66766B');
      local(.9, height + .43, -.5, .8, .55, .8, '#F0AB70');
      for (let row = 0; row < Math.floor((height - 1.5) / 1.4); row++) for (const dx of [-1.25, 0, 1.25]) {
        local(dx, 2.4 + row * 1.35, 1.93, .86, 1.03, .12, '#FFF2D7');
        local(dx, 2.4 + row * 1.35, 2.01, .63, .81, .05, (row + index) % 3 === 0 ? '#F2B743' : '#526579');
        local(dx, 2.4 + row * 1.35, 2.05, .06, .81, .04, '#FFF2D7');
        local(dx, 1.87 + row * 1.35, 2.03, .98, .09, .26, '#F6E7CA');
      }
      for (let row = 0; row < Math.floor(height / 1.5); row++) {
        for (const side of [-1, 1]) for (const dz of [-.95, .95]) {
          local(side * 2.13, .9 + row * 1.4, dz, .1, .98, .88, '#FFF2D7');
          local(side * 2.2, .9 + row * 1.4, dz, .04, .75, .64, '#526579');
          local(side * 2.23, .9 + row * 1.4, dz, .04, .75, .06, '#FFF2D7');
        }
        for (const dx of [-1.2, 1.2]) {
          local(dx, .9 + row * 1.4, -1.95, .88, .98, .1, '#FFF2D7');
          local(dx, .9 + row * 1.4, -2.02, .64, .75, .04, '#526579');
        }
      }
      for (const dx of [-1.22, 1.22]) { local(dx, .95, 1.94, 1.15, 1.3, .13, '#FFF2D7'); local(dx, .95, 2.02, .96, 1.12, .08, '#224F4A'); }
      local(0, .77, 1.96, .65, 1.5, .14, '#224F4A');
      local(.18, .73, 2.05, .07, .12, .06, '#F2B743');
      for (let i = 0; i < 10; i++) local(-1.94 + i * .43, 1.75, 2.17, .43, .17, .85, i % 2 ? '#FFF2D7' : index % 2 ? '#DC533C' : '#224F4A');
      local(0, 2.05, 2.01, 2.4, .33, .08, '#FFF2D7');
      // Small shop-sign stripes read as lettering at neighborhood scale without floating labels.
      for (let i = 0; i < 6; i++) local(-.72 + i * .29, 2.05, 2.07, .17, .11, .03, '#224F4A');
    };
    [...fixtures.buildings, ...outerBuildings(columns)].forEach(b => building(b.x, b.z, b.height, b.color, b.facing, b.index));
    // An inhabited distant silhouette, not an empty ground plane.
    for (let i = 0; i < 20; i++) {
      const h = 4 + (i * 7 % 9);
      box([center - 35 + i * 3.7, h / 2 - 1.1, -48 - i % 3 * 3], [2.8, h, 3.5], ['#978B95', '#89909C', '#A58E95'][i % 3]);
    }
    // Steps join the existing raised restaurant entrance to the public promenade.
    for (let i = 0; i < 4; i++) box([5.6, -.18 - i * .19, 13.85 + i * .32], [1.65, .2, .36], '#F6E7CA');
    return { blocks, leaves };
  }, [columns]);
  useLayoutEffect(() => { root.current?.traverse(node => { if (node instanceof THREE.Mesh) node.raycast = () => {}; }); }, [parts]);
  return <group name="city-scenery" ref={root}>
    <CityDistricts columns={columns} />
    <mesh position={[(columns - 1) * CELL / 2, -1.12, 3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[180, 180]} /><meshStandardMaterial color="#B8AF93" /></mesh>
    <PavedIsland columns={columns} offset={3.7} y={-1.075} color="#E1CFAD" />
    <PavedIsland columns={columns} offset={2.4} y={-1.025} color="#52616A" />
    <PavedIsland columns={columns} offset={-2.4} y={-.91} color="#F6E7CA" />
    <PavedIsland columns={columns} offset={-3.95} y={-.9} color="#C8B699" />
    <Batch items={parts.blocks} /><Batch items={parts.leaves} shape="sphere" />
    <Box position={[5.6, -.05, 13.5]} size={[1.55, .14, .68]} color="#F6E7CA" />
  </group>;
});
