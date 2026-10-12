import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from '@/game/engine';
import { latestChefAction, sampleChefAction } from '@/game/action-feedback';
import { knifeLift, KNIFE_LIFT_HEIGHT } from '@/game/chopping';
import { sampleChefHop } from '@/game/chef-hop';
import { advanceChefLocomotion, createChefLocomotion } from '@/game/chef-locomotion';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { ProceduralChef } from './ProceduralChef';

function NumberBadge({ id }: { id: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = id === 0 ? '#dc533c' : '#3b9c98'; ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff2d7'; ctx.lineWidth = 6; ctx.stroke(); ctx.fillStyle = '#fff2d7';
    ctx.font = 'bold 72px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(id + 1), 64, 67);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
  }, [id]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={[0, .3, .65]} scale={[.45, .45, .45]} renderOrder={10}><spriteMaterial map={texture} depthTest={false} /></sprite>;
}

/** Physics location and feedback stay separate from the editable character joints. */
export function ChefView({ id, playing }: { id: number; playing: boolean }) {
  const root = useRef<THREE.Group>(null), runtime = useRef<THREE.Group>(null), feedback = useRef<THREE.Group>(null);
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const chef = engine.state.chefs[id];
  const motion = useMemo(() => createChefLocomotion(), [id]);
  const lifecycle = useRef<{ chef: typeof chef; phase: typeof engine.state.phase } | null>(null);
  const motionPreference = useReducedMotionQuery();
  useFrame(({ clock }) => {
    if (!root.current || !runtime.current || !feedback.current) return;
    const reduced = motionPreference.matches, state = engine.state, c = state.chefs[id];
    const inShift = state.phase === 'playing', menu = state.phase === 'menu' || state.phase === 'briefing', results = state.phase === 'results';
    root.current.position.set(menu ? (id === 0 ? -1.7 : 3.2) : results ? (id === 0 ? -4 : 4) : c.x, .1, menu ? (id === 0 ? 1.6 : 0) : results ? 1.5 : c.z);
    const workStation = inShift && c.working ? state.stations.find(st => st.id === c.near) : undefined;
    const time = inShift ? state.elapsed : clock.elapsedTime;
    const target = menu || results ? (id === 0 ? .4 : -.4) : workStation ? Math.atan2(workStation.x - c.x, workStation.z - c.z) : c.facing;
    if (lifecycle.current?.chef !== c || lifecycle.current.phase !== state.phase) {
      Object.assign(motion, createChefLocomotion(root.current.position.x, root.current.position.z, target, time));
      lifecycle.current = { chef: c, phase: state.phase };
    }
    advanceChefLocomotion(motion, { x: root.current.position.x, z: root.current.position.z, yaw: target, time, moving: inShift && c.moving, dashing: inShift && c.dash > 0, working: !!workStation, paused: state.paused });
    root.current.rotation.y = motion.yaw;
    root.current.userData.locomotion = motion;
    const action = inShift ? latestChefAction(engine.actionEffects, id) : undefined;
    const pose = sampleChefAction(action, state.elapsed, reduced);
    const hop = sampleChefHop(inShift ? engine.chefHops.get(id) : undefined, state.elapsed, reduced);
    feedback.current.scale.set(pose.width, pose.height, pose.width);
    // Share one lift with the washing rebound; keep food attached and the player ring grounded.
    feedback.current.position.y = Math.max(pose.lift, hop);
    const dashing = inShift && c.dash > 0;
    if (ringMaterial.current) ringMaterial.current.color.set(dashing || action?.kind === 'place' ? '#F2B743' : action?.kind === 'wash' ? '#B7E5EF' : id === 0 ? '#ed774e' : '#50c6b1');
    // Entire pose is sampled from simulation time: pausing never advances a joint.
    const celebrate = results && (state.results?.stars ?? 0) > 0;
    runtime.current.position.y = reduced ? 0 : celebrate ? Math.abs(Math.sin(time * 6)) * .075 : Math.abs(motion.gait) * .05 + Math.sin(time * 2.4 + id) * .015 * (1 - motion.stride);
    runtime.current.rotation.x = reduced ? 0 : workStation?.kind === 'board' ? .025 + (1 - knifeLift(workStation.progress) / KNIFE_LIFT_HEIGHT) * .04 : workStation?.kind === 'sink' ? .06 : motion.dashBlend * .18;
    runtime.current.rotation.z = reduced ? 0 : motion.gait * .025 + motion.lean;
  }, -1.5);
  return <group ref={root} name={`chef-${id}`}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .025, 0]}><ringGeometry args={[.49, .61, 36]} /><meshBasicMaterial ref={ringMaterial} color={id === 0 ? '#ed774e' : '#50c6b1'} transparent opacity={.95} /></mesh>
    <group ref={runtime} name="chef-motion"><group ref={feedback} name={`chef-action-pose-${id}`}>
      <ProceduralChef id={id} held={playing ? chef.held : null} motion={motion} />
    </group></group>
    <NumberBadge id={id} />
  </group>;
}
