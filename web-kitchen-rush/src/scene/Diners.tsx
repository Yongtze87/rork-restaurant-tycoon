import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { DinerEmotionBadge } from '@/components/DinerEmotionBadge';
import { sampleDinerEmotion } from '@/game/diner-emotion';
import * as THREE from 'three';
import { engine } from '@/game/engine';
import { DiningRoom, sampleDinerPose, type Diner } from '@/game/diners';
import { DINING_SEATS, MAX_VISIBLE_GUESTS } from '@/game/dining-layout';
import { RECIPES } from '@/game/config';
import type { GameState } from '@/game/types';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { createDinerRig } from './diner-model';
import { createChefArmPoser } from './chef-arm';
import { Food } from './Food';

function dishBubble(recipe: Diner['recipe']): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 160;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#FFF2D7'; c.strokeStyle = '#224F4A'; c.lineWidth = 5;
  c.beginPath(); c.roundRect(8, 8, 176, 132, 30); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(80, 138); c.lineTo(88, 156); c.lineTo(108, 138); c.fill();
  c.fillStyle = '#D3DAD0'; c.beginPath(); c.ellipse(96, 107, 60, 15, 0, 0, Math.PI * 2); c.fill();
  if (recipe === 'burger') {
    for (const [y, h, color] of [[92, 14, '#F2B743'], [78, 17, '#634B38'], [68, 12, '#78A64B'], [58, 12, '#DC533C']] as const) { c.fillStyle = color; c.beginPath(); c.roundRect(43, y, 106, h, 7); c.fill(); }
    c.fillStyle = '#F2B743'; c.beginPath(); c.ellipse(96, 58, 55, 29, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#FFF2D7'; for (const x of [65, 88, 113, 126]) { c.beginPath(); c.ellipse(x, 45 + x % 7, 4, 2, -.4, 0, Math.PI * 2); c.fill(); }
  } else {
    for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? '#78A64B' : '#98A949'; c.beginPath(); c.ellipse(53 + i * 17 % 85, 62 + i * 13 % 38, 20, 16, i, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#DC533C'; for (const [x, y] of [[62, 70], [110, 85], [119, 57]]) { c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.fill(); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

const DinerView = memo(function DinerView({ guest, ambient = false, bubbleMaps }: { guest: Diner; ambient?: boolean; bubbleMaps: Record<Diner['recipe'], THREE.Texture> }) {
  const rig = useMemo(() => createDinerRig(guest.species, guest.id), [guest.species, guest.id]);
  const root = useRef<THREE.Group>(null), meal = useRef<THREE.Group>(null), portion = useRef<THREE.Group>(null), bubble = useRef<THREE.Sprite>(null);
  const emotionAnchor = useRef<THREE.Group>(null), emotionBadge = useRef<HTMLDivElement>(null);
  const poseArm = useMemo(() => createChefArmPoser(), []), reduced = useReducedMotionQuery();
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame(({ clock }) => {
    if (!root.current) return;
    const time = ambient ? clock.elapsedTime : engine.state.elapsed;
    const active = ambient || (engine.state.phase === 'playing' && engine.dining.guests.includes(guest));
    const p = sampleDinerPose(guest, time, reduced.matches);
    const emotion = sampleDinerEmotion(guest, time, reduced.matches);
    root.current.visible = active && guest.stage !== 'gone';
    root.current.position.set(guest.x, .13 - .03 * p.sit, guest.z);
    root.current.rotation.y = guest.yaw;
    Object.assign(root.current.userData, { id: guest.id, stage: guest.stage, outcome: guest.outcome, seat: guest.seat, species: guest.species, meal: p.meal, ambient });
    rig.root.position.y = p.bob;
    rig.head.rotation.set(p.headX, p.headY, 0);
    rig.face.apply({ happy: p.happy, disappointed: p.sad }, 1);
    rig.tail.rotation.y = reduced.matches ? 0 : p.gait * .2;
    rig.ears.forEach((ear, i) => { ear.rotation.z = reduced.matches ? 0 : p.gait * .08 * (i ? -1 : 1); });
    rig.legs.forEach((leg, i) => { leg.hip.rotation.x = -p.sit * Math.PI / 2 + p.gait * (i ? -1 : 1) * (1 - p.sit); leg.knee.rotation.x = p.sit * Math.PI / 2; });
    const handY = .57 + p.sit * .55, handZ = .10 + p.sit * .58;
    poseArm(rig.arms[0], -1, [-.47 + p.sit * .24 + p.bite * .13, handY + p.bite * .20, handZ + p.bite * (guest.species === 'crocodile' ? .08 : -.19)], -.15);
    poseArm(rig.arms[1], 1, [.47 - p.sit * .17, handY + p.wave, handZ - p.gait * .16], 0);
    rig.bite.visible = p.meal && !reduced.matches && p.bite > .25;
    const seat = guest.seat === null ? null : DINING_SEATS[guest.seat];
    if (meal.current) { meal.current.visible = active && p.meal && !!seat; if (seat) meal.current.position.set(seat.mealX, 1.11, seat.mealZ); }
    if (portion.current) portion.current.scale.setScalar(.8 * p.portion);
    if (bubble.current) { bubble.current.visible = active && p.bubble && !ambient && !emotion.kind; bubble.current.position.set(guest.x, guest.species === 'rabbit' ? 2.5 : 2.25, guest.z); }
    emotionAnchor.current?.position.set(guest.x, (guest.species === 'rabbit' ? 2.22 : 2) - .03 * p.sit + p.bob, guest.z);
    const badge = emotionBadge.current;
    if (badge) {
      const kind = active && !ambient ? emotion.kind : null;
      badge.hidden = kind === null;
      if (badge.dataset.emotion !== (kind ?? 'none')) badge.dataset.emotion = kind ?? 'none';
      const label = kind === 'happy' ? `Happy guest — ${RECIPES[guest.recipe].name} served` : guest.outcome === 'missed' ? 'Angry guest — left after waiting too long' : 'Angry guest — waiting too long';
      if (badge.getAttribute('aria-label') !== label) badge.setAttribute('aria-label', label);
      badge.style.opacity = String(emotion.opacity);
      badge.style.transform = `translateY(calc(-50% - ${emotion.lift}px)) scale(${emotion.scale})`;
    }
  }, -.4);
  return <>
    <group ref={root} name={`${ambient ? 'ambient' : 'customer'}-${guest.id}`}><group scale={.9}><primitive object={rig.root} dispose={null}/></group></group>
    <group ref={meal} visible={false} name={`customer-meal-${guest.id}`}><group ref={portion}><Food item={{ kind: 'plate', parts: RECIPES[guest.recipe].parts }}/></group></group>
    <sprite ref={bubble} visible={false} scale={[.88, .73, 1]} name={`customer-order-${guest.id}`}><spriteMaterial map={bubbleMaps[guest.recipe]} transparent depthWrite={false}/></sprite>
    {!ambient && <group ref={emotionAnchor} name={`customer-emotion-${guest.id}`}>
      <Html center zIndexRange={[12, 9]} pointerEvents="none" className="pointer-events-none" wrapperClass="pointer-events-none"><DinerEmotionBadge ref={emotionBadge} guestId={guest.id} /></Html>
    </group>}
  </>;
});

/** Menu-only patrons never enter the real order, score or inventory lifecycle. */
function AmbientDiners({ maps }: { maps: Record<Diner['recipe'], THREE.Texture> }) {
  const guests = useMemo(() => {
    const room = new DiningRoom();
    for (let i = 1; i <= 4; i++) room.order({ id: i, recipe: i % 2 ? 'salad' : 'burger', remaining: 100, duration: 100 }, i);
    return room.guests.map((g, i) => { const index = [2, 3, 4, 0][i], seat = DINING_SEATS[index]; return { ...g, seat: index, x: seat.x, z: seat.z, yaw: seat.yaw, sit: 1, stage: 'eating' as const, outcome: 'served' as const }; });
  }, []);
  useFrame(({ clock }) => { guests.forEach((g, i) => { g.since = Math.floor((clock.elapsedTime + i * .8) / 5.5) * 5.5 - i * .8; }); }, -.6);
  return <>{guests.map(g => <DinerView key={g.id} guest={g} ambient bubbleMaps={maps}/>)}</>;
}

/** Bounded rendering; active diners take priority over the small entrance waiting area. */
export function Diners({ phase }: { phase: GameState['phase'] }) {
  const maps = useMemo(() => ({ salad: dishBubble('salad'), burger: dishBubble('burger') }), []);
  useEffect(() => () => { maps.salad.dispose(); maps.burger.dispose(); }, [maps]);
  const visible = engine.dining.guests.filter(g => g.stage !== 'queued' && g.stage !== 'gone').slice(0, MAX_VISIBLE_GUESTS);
  return <group name="dining-room">{phase === 'menu' || phase === 'briefing' ? <AmbientDiners maps={maps}/> : phase === 'playing' ? visible.map(g => <DinerView key={g.id} guest={g} bubbleMaps={maps}/>) : null}</group>;
}
