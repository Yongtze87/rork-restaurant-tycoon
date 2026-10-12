import { memo, useMemo } from 'react';
import { Line } from '@react-three/drei';
import { CELL, HEIGHT, entrance, type Furniture, type Point } from './types';
import { alignmentSegments, footprintBounds, gridSegments, type GridVertex } from './build-grid';

const ignoreRaycast = () => undefined;

/** A planning-only, floor-anchored grid. Decorative lines never steal tile taps. */
export const BuildGrid = memo(function BuildGrid({ columns, draft, onTile }: { columns: number; draft: Furniture | null; onTile: (point: Point) => void }) {
  const lines = useMemo(() => gridSegments(columns), [columns]);
  const guides = useMemo(() => draft ? alignmentSegments(draft, columns) : null, [draft, columns]);
  return <group name="build-grid" userData={{ columns, rows: HEIGHT }}>
    {Array.from({ length: columns * HEIGHT }, (_, i) => {
      const x = i % columns, z = Math.floor(i / columns);
      return <mesh key={i} name={`build-cell-${x}-${z}`} position={[x * CELL, .081, z * CELL]} rotation={[-Math.PI / 2, 0, 0]} onClick={event => { event.stopPropagation(); onTile({ x, z }); }}>
        <planeGeometry args={[CELL, CELL]} /><meshBasicMaterial color="#FFF2D7" transparent opacity={(x + z) % 2 ? .08 : .16} depthWrite={false} toneMapped={false} />
      </mesh>;
    })}
    <Line points={lines} segments color="#233D3B" lineWidth={3} transparent opacity={.4} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />
    <Line points={lines} segments color="#FFF2D7" lineWidth={1.2} transparent opacity={.85} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />
    {guides && <Line name="build-alignment" points={guides} segments color="#F2B743" lineWidth={2.5} transparent renderOrder={2} dashed dashSize={.22} gapSize={.12} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />}
    <Line points={[[entrance.x * CELL - .35, .105, entrance.z * CELL + .24], [entrance.x * CELL, .105, entrance.z * CELL - .2], [entrance.x * CELL + .35, .105, entrance.z * CELL + .24]]} color="#F2B743" lineWidth={3} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />
  </group>;
});

/** Per-cell tint and a strong edge communicate the complete snapped placement, not just the model. */
export function PlacementFootprint({ item, valid }: { item: Furniture; valid: boolean }) {
  const { left, right, back, front, size } = footprintBounds(item);
  const color = valid ? '#3B9C98' : '#DC533C';
  const border: GridVertex[] = [[left, .145, back], [right, .145, back], [right, .145, front], [left, .145, front], [left, .145, back]];
  return <group name="placement-footprint" userData={{ x: item.x, z: item.z, size, valid }}>
    {Array.from({ length: size * size }, (_, i) => <mesh key={i} position={[(item.x + i % size) * CELL, .125, (item.z + Math.floor(i / size)) * CELL]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
      <planeGeometry args={[CELL - .08, CELL - .08]} /><meshBasicMaterial color={color} transparent opacity={.45} depthWrite={false} toneMapped={false} />
    </mesh>)}
    <Line points={border} color="#FFF2D7" lineWidth={5} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />
    <Line points={border} color={color} lineWidth={3} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />
    {!valid && <Line points={[[left, .15, back], [right, .15, front], [left, .15, front], [right, .15, back]]} segments color="#DC533C" lineWidth={3} depthWrite={false} toneMapped={false} raycast={ignoreRaycast} />}
  </group>;
}
