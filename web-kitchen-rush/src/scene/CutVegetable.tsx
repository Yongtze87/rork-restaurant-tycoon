import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from '@/game/engine';
import { CHOP_CUTS, completedCuts, cutPosition, isVegetable, latestChop, sliceSettle, type Vegetable } from '@/game/chopping';
import type { Station } from '@/game/types';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { IngredientOutline } from './IngredientOutline';

const CUTS = Array.from({ length: CHOP_CUTS }, (_, i) => i);
const disc = new THREE.CylinderGeometry(.235, .235, .047, 28);

/** A closed, slightly curled ribbon with real thickness, not a flat leaf billboard. */
function lettuceRibbon(): THREE.BufferGeometry {
  const vertices: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 10; row++) {
    const t = row / 10;
    const bend = Math.sin(t * Math.PI * 1.7) * .025;
    const width = .033 + Math.sin(t * Math.PI) * .012 + Math.sin(t * 45) * .004;
    for (const [side, top] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) {
      vertices.push(side * width + Math.sin(t * 7) * .012, bend + top * .018, (t - .5) * .37);
    }
    if (row === 10) continue;
    const a = row * 4, b = a + 4;
    indices.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3, a, a + 1, b, a + 1, b + 1, b,
      a, b, a + 2, a + 2, b, b + 2, a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
  }
  indices.push(0, 2, 1, 1, 2, 3, 40, 41, 42, 41, 43, 42);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
const ribbon = lettuceRibbon();

/** Seed chambers and a pale core remain readable on actual thick, separate slices. */
function tomatoTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#DC533C'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#f58b68'; ctx.beginPath(); ctx.arc(128, 128, 115, 0, Math.PI * 2); ctx.fill();
  for (let chamber = 0; chamber < 5; chamber++) {
    const angle = chamber * Math.PI * 2 / 5;
    ctx.save(); ctx.translate(128, 128); ctx.rotate(angle);
    ctx.fillStyle = '#ce4233'; ctx.beginPath(); ctx.ellipse(0, -65, 34, 36, 0, 0, Math.PI * 2); ctx.fill();
    for (const [x, y] of [[-14, -69], [11, -82], [9, -52]]) {
      ctx.fillStyle = '#FFF2D7'; ctx.beginPath(); ctx.ellipse(x, y, 5, 9, -.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.fillStyle = '#ffba8f'; ctx.beginPath(); ctx.arc(128, 128, 24, 0, Math.PI * 2); ctx.fill();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Reused face for separated slices and the exposed end of an uncut tomato. */
export const TomatoSlice = memo(function TomatoSlice({ highlighted = false }: { highlighted?: boolean }) {
  const texture = useMemo(tomatoTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh geometry={disc} castShadow receiveShadow name="tomato-slice-mesh">
    <meshStandardMaterial attach="material-0" color="#DC533C" roughness={.48} />
    <meshStandardMaterial attach="material-1" map={texture} roughness={.54} />
    <meshStandardMaterial attach="material-2" map={texture} roughness={.54} />
    {highlighted && <IngredientOutline />}
  </mesh>;
});

/** Station-aware cuts update every simulation frame, independently of throttled HUD renders. */
export function CutVegetable({ kind, highlighted = false, station }: { kind: Vegetable; highlighted?: boolean; station?: Station }) {
  const root = useRef<THREE.Group>(null);
  const motion = useReducedMotionQuery();
  useFrame(() => {
    if (!root.current) return;
    const count = station ? isVegetable(station.item) && station.item.state === 'chopped' ? CHOP_CUTS : completedCuts(station.progress) : CHOP_CUTS;
    const impact = station ? latestChop(engine.actionEffects, station) : undefined;
    root.current.children.forEach((piece, i) => {
      piece.visible = i < count;
      const age = impact?.cutIndex === i + 1 ? engine.state.elapsed - impact.startedAt : 1;
      const { travel, hop } = sliceSettle(age, motion.matches);
      const x = -.285 + i * .11;
      const z = kind === 'tomato' ? (i % 2 ? .07 : -.065) : Math.sin(i * 2.4) * .085;
      piece.position.set(THREE.MathUtils.lerp(cutPosition(i + 1), x, travel),
        THREE.MathUtils.lerp(.23, .025 + i * .009, travel) + hop, z * travel);
      piece.rotation.set(0, (kind === 'lettuce' ? Math.sin(i * 2.4) * .36 : i % 2 ? .12 : -.12) * travel, (1 - travel) * Math.PI / 2 + (i % 2 ? .055 : -.055) * travel);
    });
  });
  return <group ref={root} name={`cut-${kind}`}>
    {CUTS.map(i => <group key={i} name={`cut-piece-${i + 1}`} visible={!station}>
      {kind === 'tomato' ? <group scale={i === 0 || i === CHOP_CUTS - 1 ? .8 : 1}><TomatoSlice highlighted={highlighted} /></group> :
        [-1, 1].map(side => <mesh key={side} name="lettuce-strip-mesh" geometry={ribbon} scale={[1, 1, .8 + (i % 3) * .1]} position={[side * .033, side > 0 ? .025 : 0, side * .07]} rotation={[0, side * .28, side * .08]} castShadow receiveShadow>
          <meshStandardMaterial color={(i + side) % 2 ? '#76a63e' : '#a6c95b'} roughness={.8} />
          {highlighted && <IngredientOutline />}
        </mesh>)}
    </group>)}
  </group>;
}
