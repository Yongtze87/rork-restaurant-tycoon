import { Suspense, useEffect, useMemo, useRef } from 'react';
import { createPortal, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createChefRig } from '@/scene/chef-model';
import { createDinerRig } from '@/scene/diner-model';
import { createChefArmPoser } from '@/scene/chef-arm';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { restaurant } from './engine';
import { CELL, type Guest, type Staff } from './types';
import { Meal } from './FurnitureView';
import { MODELS } from '@/game/assets';
import { guestMood, guestSatisfaction } from './satisfaction';
import { GeneratedProp } from '@/scene/GeneratedModel';

export function Employee({ member }: { member: Staff }) {
  const rig = useMemo(() => createChefRig(member.role === 'server' ? 1 : 0), [member.role]);
  const group = useRef<THREE.Group>(null), poseArm = useMemo(createChefArmPoser, []), reduced = useReducedMotionQuery();
  const visualTime = useRef<number>(restaurant.state.clock);
  const initial = useRef({ position: [member.x * CELL, .09, member.z * CELL] as [number, number, number], rotation: [0, member.yaw, 0] as [number, number, number] });
  useEffect(() => { rig.setOutfit({ hat: member.role === 'chef' ? 'cream' : 'teal', apron: member.role === 'chef' ? 'tomato' : 'teal' }); if (member.role === 'server') rig.hat.visible = false; return () => rig.dispose(); }, [rig, member.role]);
  useFrame((_, dt) => {
    if (!group.current) return;
    const active = !restaurant.paused && restaurant.state.phase === 'service';
    if (active) visualTime.current += (restaurant.state.clock - visualTime.current) * (1 - Math.exp(-dt * 22));
    const t = visualTime.current, moving = member.route.length > 0, working = member.task === 'cooking';
    if (active || restaurant.state.phase !== 'service') {
      const smooth = restaurant.state.phase === 'service' ? 1 - Math.exp(-dt * 22) : 1;
      group.current.position.x += (member.x * CELL - group.current.position.x) * smooth;
      group.current.position.z += (member.z * CELL - group.current.position.z) * smooth;
    }
    const delta = Math.atan2(Math.sin(member.yaw - group.current.rotation.y), Math.cos(member.yaw - group.current.rotation.y));
    if (!restaurant.paused) group.current.rotation.y += delta * (1 - Math.exp(-dt * 14));
    const gait = !reduced.matches && moving ? Math.sin(t * 10 + member.id) * .48 : 0;
    rig.legs[0].rotation.x = gait; rig.legs[1].rotation.x = -gait;
    rig.head.rotation.x = working ? .14 : 0; rig.hat.rotation.z = reduced.matches ? 0 : gait * .08;
    const carrying = member.task === 'deliver', chop = working && !reduced.matches ? Math.sin(t * 16) * .1 : 0;
    poseArm(rig.arms[0], -1, carrying ? [-.3, 1.02, .72] : working ? [-.32, 1.58 + chop, .85] : [-.47, .58, .1 + gait * .3]);
    poseArm(rig.arms[1], 1, carrying ? [.3, 1.02, .72] : working ? [.32, 1.28, .75] : [.47, .58, .1 - gait * .3]);
    rig.face.apply({ happy: carrying ? .7 : 0, disappointed: 0 }, 1);
    rig.food.visible = carrying;
  });
  const guest = restaurant.state.guests.find(g => g.id === member.guestId);
  return <group ref={group} scale={.72} position={initial.current.position} rotation={initial.current.rotation} name={`employee-${member.id}`}>
    <primitive object={rig.root} dispose={null} />
    {guest && member.task === 'deliver' && createPortal(<Meal dish={guest.dish} />, rig.food)}
    {guest?.dish === 'salad' && member.task === 'cooking' && createPortal(<group position={[0, -.195, .208]}><Suspense fallback={null}><GeneratedProp asset={MODELS.knife} size={.55} dimension="width" /></Suspense></group>, rig.arms[0].hand)}
  </group>;
}

export function Customer({ guest, patienceSeconds }: { guest: Guest; patienceSeconds: number }) {
  const rig = useMemo(() => createDinerRig(guest.species, guest.id), [guest.species, guest.id]);
  const group = useRef<THREE.Group>(null), poseArm = useMemo(createChefArmPoser, []), reduced = useReducedMotionQuery();
  const visualTime = useRef<number>(restaurant.state.clock);
  const initial = useRef({ position: [guest.x * CELL, .1, guest.z * CELL] as [number, number, number], rotation: [0, guest.yaw, 0] as [number, number, number] });
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame((_, dt) => {
    if (!group.current) return;
    const seated = !['arriving', 'leaving'].includes(guest.stage), eating = guest.stage === 'eating';
    const active = !restaurant.paused && restaurant.state.phase === 'service';
    if (active) visualTime.current += (restaurant.state.clock - visualTime.current) * (1 - Math.exp(-dt * 22));
    const t = visualTime.current, gait = !reduced.matches && guest.route.length > 0 ? Math.sin(t * 10 + guest.id) * .42 : 0;
    if (active) {
      const smooth = 1 - Math.exp(-dt * 22);
      group.current.position.x += (guest.x * CELL - group.current.position.x) * smooth;
      group.current.position.z += (guest.z * CELL - group.current.position.z) * smooth;
    }
    group.current.position.y = seated ? .075 : .1;
    const delta = Math.atan2(Math.sin(guest.yaw - group.current.rotation.y), Math.cos(guest.yaw - group.current.rotation.y));
    if (!restaurant.paused) group.current.rotation.y += delta * (1 - Math.exp(-dt * 15));
    rig.legs.forEach((leg, i) => { leg.hip.rotation.x = seated ? -Math.PI / 2 : gait * (i ? -1 : 1); leg.knee.rotation.x = seated ? Math.PI / 2 : 0; });
    const bite = eating && !reduced.matches ? (Math.sin(t * 3) + 1) / 2 : 0;
    poseArm(rig.arms[0], -1, seated ? [-.28, .95 + bite * .3, .44] : [-.43, .55, .08 + gait * .3]);
    poseArm(rig.arms[1], 1, seated ? [.32, .92, .4] : [.43, .55, .08 - gait * .3]);
    const mood = guestMood(guestSatisfaction(guest, patienceSeconds), guest.stage, guest.happy);
    rig.bite.visible = eating; rig.face.apply({ happy: mood === 'served' ? 1 : 0, disappointed: mood === 'unhappy' ? 1 : 0 }, 1);
    rig.head.rotation.x = bite * .08;
  });
  return <group ref={group} scale={.7} position={initial.current.position} rotation={initial.current.rotation} name={`customer-${guest.id}`}><primitive object={rig.root} dispose={null} /></group>;
}
