import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from '@/game/engine';
import { MODELS } from '@/game/assets';
import { CHOP_CONTACT_HOLD, CHOP_CUTS, KNIFE_GRIP, completedCuts, cutPosition, isVegetable, knifeCutPosition, knifeLift, latestChop, type Vegetable } from '@/game/chopping';
import type { Station } from '@/game/types';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { CutVegetable, TomatoSlice } from './CutVegetable';
import { Food } from './Food';
import { Box } from './Primitives';
import { GeneratedProp } from './GeneratedModel';

/** Progressively clips the original model; an exposed cut face seals the remaining tomato. */
export function BoardVegetable({ station, kind, highlighted }: { station: Station; kind: Vegetable; highlighted: boolean }) {
  const root = useRef<THREE.Group>(null), remainder = useRef<THREE.Group>(null), cap = useRef<THREE.Group>(null);
  const plane = useMemo(() => new THREE.Plane(), []);
  const planes = useMemo(() => [plane], [plane]);
  const normal = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const raw = useMemo(() => ({ kind, state: 'raw' as const }), [kind]);
  useFrame(() => {
    if (!root.current || !remainder.current) return;
    const count = isVegetable(station.item) && station.item.state === 'chopped' ? CHOP_CUTS : completedCuts(station.progress);
    const x = cutPosition(count);
    remainder.current.visible = count < CHOP_CUTS;
    root.current.updateWorldMatrix(true, false);
    plane.set(normal, -(count ? x : -1)).applyMatrix4(root.current.matrixWorld);
    // Both generated meshes and their loading fallback own their materials.
    remainder.current.traverse(node => {
      if (node.name === 'ingredient-outline' || node.name === 'ingredient-glow') node.visible = count === 0;
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material.clippingPlanes === planes) continue;
        material.clippingPlanes = planes; material.clipShadows = true; material.needsUpdate = true;
      }
    });
    if (cap.current) {
      cap.current.visible = count > 0 && count < CHOP_CUTS;
      cap.current.position.set(x + .009, .24, 0);
      const radius = Math.sqrt(Math.max(.05, 1 - (x / .275) ** 2));
      cap.current.scale.set(radius, .2, radius);
    }
  }, -1);
  return <group ref={root} position={[0, 1.465, 0]} name={`board-vegetable-${station.id}`}>
    <group ref={remainder} name="uncut-remainder"><Food item={raw} highlighted={highlighted && completedCuts(station.progress) === 0} /></group>
    {kind === 'tomato' && <group ref={cap} rotation={[0, 0, Math.PI / 2]} visible={false} name="cut-face"><TomatoSlice /></group>}
    <CutVegetable kind={kind} highlighted={highlighted} station={station} />
  </group>;
}

function KnifeFallback() {
  return <><Box position={[0, .14, .06]} size={[.035, .28, .58]} color="#cbd3ca" roughness={.35} /><Box position={KNIFE_GRIP} size={[.09, .09, .29]} color="#594636" /></>;
}

/** One knife per board follows board progress, so shared work never draws two blades. */
export function ChoppingKnife({ station }: { station: Station }) {
  const root = useRef<THREE.Group>(null);
  const motion = useReducedMotionQuery();
  const transition = useMemo(() => ({ station, chefs: engine.state.chefs, engaged: false, startedAt: -1, from: new THREE.Vector3(.5, 1.43, -.06), rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)), target: new THREE.Vector3(), targetRotation: new THREE.Quaternion(), euler: new THREE.Euler() }), [station]);
  useFrame(() => {
    if (!root.current) return;
    const state = engine.state;
    const item = station.item;
    const vegetable = isVegetable(item);
    const owner = state.chefs.find(c => (c.id === 0 || state.mode === 'coop') && c.near === station.id && c.working && !c.held);
    const active = state.phase === 'playing' && vegetable && item.state === 'raw' && station.fire === 0 && Boolean(owner);
    const impact = latestChop(engine.actionEffects, station);
    const contact = impact && state.elapsed - impact.startedAt < CHOP_CONTACT_HOLD;
    const finisher = impact ? state.chefs[root.current.userData.ownerId ?? impact.chefId] : undefined;
    const finish = state.phase === 'playing' && vegetable && item.state === 'chopped' && impact && state.elapsed - impact.startedAt < .10 && finisher?.near === station.id && !finisher.held && !finisher.moving;
    const count = completedCuts(station.progress);
    const engaged = Boolean(active || finish), holder = active ? owner : finish ? finisher : undefined;
    if (transition.station !== station || transition.chefs !== state.chefs || state.phase !== 'playing') {
      transition.station = station; transition.chefs = state.chefs;
      transition.engaged = false; transition.startedAt = -1;
      root.current.position.set(.5, 1.43, -.06); root.current.rotation.set(0, 0, -Math.PI / 2);
    }
    if (transition.engaged !== engaged) {
      transition.engaged = engaged; transition.startedAt = state.elapsed;
      transition.from.copy(root.current.position); transition.rotation.copy(root.current.quaternion);
    }
    if (engaged) {
      const x = contact || finish ? cutPosition(impact?.cutIndex ?? count) : motion.matches ? cutPosition(Math.max(1, count)) : knifeCutPosition(station.progress);
      const lift = motion.matches || contact || finish ? 0 : knifeLift(station.progress);
      transition.target.set(x, 1.47 + lift, -.07);
      const facing = holder ? Math.atan2(station.x - holder.x, station.z - holder.z) : root.current.rotation.y;
      transition.euler.set(-lift * .25, facing, 0, 'YXZ');
    } else {
      transition.target.set(.5, 1.43, -.06); transition.euler.set(0, 0, -Math.PI / 2, 'YXZ');
    }
    transition.targetRotation.setFromEuler(transition.euler);
    const t = motion.matches || transition.startedAt < 0 ? 1 : Math.min(1, (state.elapsed - transition.startedAt) / (engaged ? .10 : .16));
    const ease = t * t * (3 - 2 * t);
    root.current.position.lerpVectors(transition.from, transition.target, ease);
    root.current.quaternion.slerpQuaternions(transition.rotation, transition.targetRotation, ease);
    if (engaged && holder && (root.current.userData.ownerId !== holder.id || !root.current.userData.active && !finish)) {
      const facing = Math.atan2(station.x - holder.x, station.z - holder.z);
      // Use the near-side hand rather than reaching across the face from the
      // opposite side of the board. Keep that hand for the whole cutting run.
      const localX = (station.x + cutPosition(1) - holder.x) * Math.cos(facing) - (station.z - holder.z) * Math.sin(facing);
      root.current.userData.handSide = localX > 0 ? 1 : -1;
    }
    root.current.userData.active = Boolean(active);
    root.current.userData.contact = Boolean(contact);
    root.current.userData.ownerId = engaged ? holder?.id : undefined;
  }, -.8);
  return <group ref={root} name={`chopping-knife-${station.id}`} position={[.5, 1.43, -.06]} rotation={[0, 0, -Math.PI / 2]}>
    <group name="knife-grip" position={KNIFE_GRIP} />
    <Suspense fallback={<KnifeFallback />}>
      {MODELS.knife ? <GeneratedProp asset={MODELS.knife} size={.9} dimension="width" /> : <KnifeFallback />}
    </Suspense>
  </group>;
}
