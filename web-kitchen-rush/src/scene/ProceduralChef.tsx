import { useEffect, useMemo, useRef } from 'react';
import { createPortal, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from '@/game/engine';
import { latestChefAction } from '@/game/action-feedback';
import { sampleChefEmotion } from '@/game/chef-emotion';
import { blendChefWork, createChefWorkBlend, type ChefWorkBlend } from '@/game/chef-work';
import { sampleChefPose, type ChefPoseInput, type JointPoint } from '@/game/chef-animation';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import type { Item } from '@/game/types';
import type { ChefLocomotion } from '@/game/chef-locomotion';
import { createChefRig } from './chef-model';
import { createChefArmPoser } from './chef-arm';
import { Food } from './Food';

/** Runtime-authored animal rig: gait, facial motion and independent two-bone arms. */
export function ProceduralChef({ id, held, motion }: { id: number; held: Item | null; motion: Readonly<ChefLocomotion> }) {
  const rig = useMemo(() => createChefRig(id), [id]);
  const reduced = useReducedMotionQuery();
  const scratch = useMemo(() => ({ target: new THREE.Vector3(), gripRotation: new THREE.Quaternion(), inverseRig: new THREE.Quaternion(), wrist: new THREE.Quaternion().setFromEuler(new THREE.Euler(-.15, 0, .12)) }), []);
  const work = useRef<{ chef: typeof engine.state.chefs[number]; phase: typeof engine.state.phase; blend: ChefWorkBlend } | null>(null);
  const poseArm = useMemo(() => createChefArmPoser(), []);
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame(({ clock, scene }) => {
    const state = engine.state, chef = state.chefs[id], inShift = state.phase === 'playing';
    rig.setOutfit(state.outfits[id]);
    const station = inShift ? state.stations.find(st => st.id === chef.near) : undefined;
    const working = inShift && chef.working && station;
    const knife = station?.kind === 'board' ? scene.getObjectByName(`chopping-knife-${station.id}`) : undefined;
    const grip = knife?.getObjectByName('knife-grip');
    const gripping = inShift && !chef.held && knife?.userData.ownerId === id && !!grip;
    const knifeHand = knife?.userData.handSide === 1 ? 1 : 0;
    const action: ChefPoseInput['action'] = state.phase === 'results' && (state.results?.stars ?? 0) > 0 ? 'celebrate'
      : working && station.fire > 0 && chef.held?.kind === 'extinguisher' ? 'extinguish'
      : (gripping || working && station.kind === 'board' && !chef.held) ? 'chop'
      : working && station.kind === 'sink' && !chef.held ? 'wash' : 'idle';
    const time = inShift ? state.elapsed : clock.elapsedTime;
    const pose = sampleChefPose({ id, time, motion, held: inShift ? chef.held : null, action, reduced: reduced.matches });
    rig.root.userData.action = action;
    rig.head.rotation.set(pose.headX, pose.headY, pose.headZ);
    rig.hat.rotation.z = pose.hatZ;
    const emotion = inShift ? engine.chefEmotions.get(id) : undefined;
    const face = action === 'celebrate' ? { happy: 1, disappointed: 0 } : sampleChefEmotion(emotion, state.elapsed, reduced.matches);
    rig.face.apply(face, pose.blink);
    rig.root.userData.emotion = action === 'celebrate' ? 'happy' : emotion?.kind ?? 'neutral';
    rig.ears.forEach((ear, i) => { ear.rotation.z = pose.earZ * (i === 0 ? 1 : -1); });
    rig.scarf.rotation.x = pose.scarfX;
    rig.tail.rotation.y = pose.tailY;
    rig.legs[0].rotation.x = pose.legLeft; rig.legs[1].rotation.x = pose.legRight;
    rig.food.visible = inShift && chef.held !== null;
    rig.root.updateWorldMatrix(true, true);
    const hands: JointPoint[] = [pose.right, pose.left];
    const toLocal = (x: number, y: number, z: number): JointPoint => rig.root.worldToLocal(scratch.target.set(x, y, z)).toArray();
    if (station && (action === 'chop' || action === 'wash')) {
      const dx = chef.x - station.x, dz = chef.z - station.z, distance = Math.hypot(dx, dz) || 1;
      const nearX = station.x + dx / distance * .38, nearZ = station.z + dz / distance * .38;
      const sidewaysX = dz / distance * .22, sidewaysZ = -dx / distance * .22;
      const scrub = action === 'wash' && !reduced.matches ? Math.sin(time * 18) * .10 : 0;
      hands[0] = toLocal(nearX + sidewaysX + scrub, 1.57, nearZ + sidewaysZ);
      hands[1] = toLocal(nearX - sidewaysX - scrub, 1.54, nearZ - sidewaysZ);
      if (action === 'chop' && grip && gripping) {
        grip.getWorldPosition(scratch.target); hands[knifeHand] = rig.root.worldToLocal(scratch.target).toArray();
      }
    }
    if (action === 'extinguish') hands[1] = [.12, 1.24, .8];
    const place = inShift ? latestChefAction(engine.actionEffects, id) : undefined;
    if (place?.kind === 'place' && !chef.held && action === 'idle' && state.elapsed - place.startedAt < .25 && !reduced.matches) {
      const reach = 1 - (state.elapsed - place.startedAt) / .25;
      hands[0] = [-.35, .75 + reach * .38, .05 + reach * .5];
      hands[1] = [.35, .75 + reach * .38, .05 + reach * .5];
    }
    if (work.current?.chef !== chef || work.current.phase !== state.phase) {
      work.current = { chef, phase: state.phase, blend: createChefWorkBlend([pose.right, pose.left], time) };
    }
    const key = action === 'chop' ? `chop:${station?.id}` : '';
    // Carry/other actions are immediate; only chopping enters and settles smoothly.
    const blended = blendChefWork(work.current.blend, hands, key, time, reduced.matches || !!chef.held || action === 'celebrate' || action === 'wash' || action === 'extinguish');
    rig.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      poseArm(arm, side, blended[i], chef.held ? -.15 : action === 'chop' ? -.15 : 0);
    });
    if (gripping && grip) {
      rig.root.getWorldQuaternion(scratch.inverseRig).invert();
      grip.getWorldQuaternion(scratch.gripRotation);
      scratch.gripRotation.premultiply(scratch.inverseRig).multiply(scratch.wrist);
      rig.arms[knifeHand].hand.quaternion.copy(scratch.gripRotation);
    }
  }, -.5);
  return <><primitive object={rig.root} dispose={null} />{held && createPortal(<Food item={held} />, rig.food)}</>;
}
