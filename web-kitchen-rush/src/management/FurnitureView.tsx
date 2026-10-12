import { memo, Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { Batch, Box, Cylinder, Sphere, type InstanceSpec } from '@/scene/Primitives';
import { GeneratedProp } from '@/scene/GeneratedModel';
import { MODELS } from '@/game/assets';
import { Food } from '@/scene/Food';
import { CATALOG, CELL, type Dish, type Furniture } from './types';

export function Meal({ dish }: { dish: Dish }) { return <Suspense fallback={<Cylinder radius={.25} height={.04} />}><GeneratedProp asset={MODELS[dish]} size={.55} dimension="width" /></Suspense>; }

export const FurnitureBody = memo(function FurnitureBody({ kind }: { kind: Furniture['kind'] }) {
  const cloth = useMemo<InstanceSpec[]>(() => Array.from({ length: 24 }, (_, i) => ({ position: [(i % 6) * .28 - .7, 1.025, Math.floor(i / 6) * .28 - .42], scale: [.28, .02, .28], color: (i + Math.floor(i / 6)) % 2 ? '#FFF2D7' : '#DC533C' })), []);
  if (kind === 'table') return <group>
    <group position={[0, 0, -.3]}><Box position={[0, .94, 0]} size={[1.78, .14, 1.24]} color="#e3c998" /><Batch items={cloth} />{[-.64, .64].flatMap(x => [-.4, .4].map(z => <Box key={`${x}${z}`} position={[x, .46, z]} size={[.1, .9, .1]} color="#694c37" />))}<Cylinder position={[0, 1.15, 0]} radius={.09} height={.26} color="#F2B743" /><Sphere position={[0, 1.32, 0]} scale={[.04, .07, .04]} color="#fff8d4" /></group>
    {[-.59, .59].map(x => <group key={x} position={[x, 0, .77]}><Box position={[0, .43, 0]} size={[.62, .14, .6]} color="#224F4A" /><Box position={[0, .79, .3]} size={[.65, .67, .12]} color="#275A55" />{[-.22, .22].flatMap(dx => [-.22, .22].map(z => <Box key={`${dx}${z}`} position={[dx, .2, z]} size={[.07, .4, .07]} color="#73513d" />))}</group>)}
  </group>;
  if (kind === 'grill') return <Suspense fallback={<Box position={[0, .5, 0]} size={[1.2, 1, 1.2]} color="#233D3B" />}><GeneratedProp asset={MODELS.grill} size={1.06} /></Suspense>;
  if (kind === 'prep') return <><Box position={[0, .47, 0]} size={[1.26, .94, 1.22]} color="#275A55" /><Box position={[0, .97, 0]} size={[1.35, .12, 1.3]} color="#F6E7CA" /><Box position={[0, 1.055, .06]} size={[.8, .055, .65]} color="#b88854" /><Box position={[0, .63, .625]} size={[.35, .04, .03]} color="#F2B743" /><group position={[-.18, 1.09, 0]} scale={.6}><Food item={{ kind: 'tomato', state: 'raw' }} /></group><group position={[.35, 1.05, -.35]} scale={.6}><Food item={{ kind: 'lettuce', state: 'raw' }} /></group></>;
  if (kind === 'plant') return <><Cylinder position={[0, .28, 0]} radius={.32} bottom={.23} height={.56} color="#B76544" /><Cylinder position={[0, .56, 0]} radius={.35} height={.1} color="#F0AB70" /><Cylinder position={[0, 1, 0]} radius={.055} height={1.1} color="#765739" />{Array.from({ length: 9 }, (_, i) => <Sphere key={i} position={[Math.sin(i * 2.4) * .25, 1.2 + i % 3 * .17, Math.cos(i * 2.4) * .25]} scale={[.3, .4, .26]} color={['#557647', '#789753', '#9ba665'][i % 3]} />)}</>;
  if (kind === 'divider') return <><Box position={[0, .27, 0]} size={[1.25, .54, .43]} color="#224F4A" />{[-.4, 0, .4].map(x => <group key={x}><Box position={[x, 1, 0]} size={[.045, 1.4, .045]} color="#A8794C" /><Sphere position={[x, 1, 0]} scale={[.29, .6, .19]} color="#678347" /></group>)}</>;
  return <><Cylinder position={[0, .07, 0]} radius={.32} height={.14} color="#224F4A" /><Cylinder position={[0, 1.1, 0]} radius={.045} height={2.1} color="#224F4A" /><Cylinder position={[0, 2.02, 0]} radius={.33} bottom={.43} height={.46} color="#F2B743" /><Sphere position={[0, 1.78, 0]} scale={[.13, .13, .13]} color="#fff0ba" /></>;
});

export function FurnitureView({ item, selected, onSelect }: { item: Furniture; selected: boolean; onSelect: (id: number) => void }) {
  const n = CATALOG[item.kind].size, size = n * CELL;
  return <group position={[(item.x + (n - 1) / 2) * CELL, .07, (item.z + (n - 1) / 2) * CELL]} rotation={[0, -item.rotation * Math.PI / 2, 0]} onClick={e => { e.stopPropagation(); onSelect(item.id); }}>
    <FurnitureBody kind={item.kind} />
    {selected && <Line points={[[-size / 2, .04, -size / 2], [size / 2, .04, -size / 2], [size / 2, .04, size / 2], [-size / 2, .04, size / 2], [-size / 2, .04, -size / 2]]} color="#F2B743" lineWidth={3} />}
  </group>;
}

export function RestaurantSign({ name }: { name: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#224F4A'; ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = '#F2B743'; ctx.lineWidth = 4; ctx.strokeRect(15, 15, 994, 226); ctx.fillStyle = '#FFF2D7'; ctx.textAlign = 'center';
    ctx.font = `600 ${name.length > 20 ? 49 : 64}px Fredoka, sans-serif`; ctx.fillText(name.toUpperCase(), 512, 116);
    ctx.font = '600 24px Nunito, sans-serif'; ctx.fillStyle = '#F2B743'; ctx.fillText('GOOD FOOD. GREAT COMPANY.', 512, 181);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
  }, [name]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh><planeGeometry args={[4.6, 1.15]} /><meshStandardMaterial map={texture} roughness={.8} /></mesh>;
}
