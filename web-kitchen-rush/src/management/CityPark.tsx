import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Batch, type InstanceSpec } from '@/scene/Primitives';
import { createDinerRig } from '@/scene/diner-model';
import { createChefArmPoser } from '@/scene/chef-arm';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { restaurant } from './engine';
import { cityDelta } from './city-motion';
import { PARK, PARK_BENCHES, sampleParkVisitor, type ParkPose } from './park-motion';
import { ParkBench } from './ParkBench';

const noRaycast = (): void => {};
/** Compact public garden: fixed scenery and two cosmetic visitors, never paying table guests. */
export const CityPark = memo(function CityPark() {
  const root = useRef<THREE.Group>(null), clock = useRef<number>(0), identity = useRef(restaurant.state);
  const reduced = useReducedMotionQuery(), poseArm = useMemo(createChefArmPoser, []);
  const seats = useRef<(number | null)[]>([null, null]);
  const seatCallbacks = useMemo(() => PARK_BENCHES.map((_, id) => (height: number | null) => { seats.current[id] = height; }), []);
  const visitors = useMemo(() => (['rabbit', 'bear'] as const).map((species, id) => {
    const rig = createDinerRig(species, 40 + id), group = new THREE.Group();
    group.name = `park-visitor-${id}`; group.scale.setScalar(PARK.visitorScale); group.add(rig.root); rig.bite.visible = false;
    rig.root.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = false; node.raycast = noRaycast; } });
    const pose: ParkPose = { x: 0, z: 0, yaw: 0, seated: 0, walking: 0, stage: 'waiting' };
    return { rig, group, pose };
  }), []);
  const scenery = useMemo(() => {
    const blocks: InstanceSpec[] = [], foliage: InstanceSpec[] = [];
    const box = (position: [number, number, number], scale: [number, number, number], color: string) => blocks.push({ position, scale, color });
    const leaf = (position: [number, number, number], scale: [number, number, number], color: string) => foliage.push({ position, scale, color });
    box([PARK.x, -1.025, PARK.z], [PARK.width, .23, PARK.depth], '#FFF2D7');
    box([PARK.x, -.92, PARK.z], [PARK.width - .22, .04, PARK.depth - .22], '#F6E7CA');
    // Four lawn panels leave a generous T-shaped walk and paved bench alcoves.
    for (const x of [2.6, 8.6]) {
      box([x, -.845, 22.85], [4.45, .11, .9], '#8C9D70');
      box([x, -.845, 26.25], [4.45, .11, 1.12], '#82935E');
      for (let i = 0; i < 6; i++) box([x - 1.8 + i * .72, -.785, 26.25], [.34, .012, 1.02], '#8C9D70');
    }
    // A flush path joins the existing outer promenade, never the road lane.
    box([PARK.x, -.97, 21.95], [1.25, .14, .6], '#F6E7CA');
    for (let i = 0; i < 8; i++) box([.8 + i * 1.37, -.893, 23.45], [.018, .012, 1.05], '#C8B699');
    for (const x of [1.05, 10.15]) {
      box([x, -.08, 26.05], [.16, 1.7, .16], '#73513D');
      leaf([x, 1.05, 26.05], [.68, .95, .64], '#667D52');
      leaf([x - .28, .78, 26.14], [.51, .62, .53], '#82935E');
    }
    // Low flower borders keep the restaurant silhouette visible.
    for (const x of [.38, 10.82]) for (let i = 0; i < 9; i++) {
      const z = 22.75 + i * .43;
      leaf([x, -.62, z], [.24, .24, .23], '#667D52');
      leaf([x, -.39, z], [.095, .075, .095], i % 3 === 0 ? '#DC533C' : i % 3 === 1 ? '#F2B743' : '#FFF2D7');
    }
    return { blocks, foliage };
  }, []);
  useEffect(() => {
    root.current?.traverse(node => { if (node instanceof THREE.Mesh) node.raycast = noRaycast; });
    return () => visitors.forEach(visitor => visitor.rig.dispose());
  }, [visitors]);
  useFrame((_, dt) => {
    if (identity.current !== restaurant.state) { identity.current = restaurant.state; clock.current = 0; }
    const ready = seats.current.every(height => height !== null);
    if (ready) clock.current += cityDelta(dt, restaurant.state.phase, restaurant.paused, restaurant.speed, document.hidden, reduced.matches);
    const time = clock.current;
    if (root.current) { root.current.userData.time = time; root.current.userData.ready = ready; }
    for (const [id, visitor] of visitors.entries()) {
      const p = sampleParkVisitor(id, time, ready, visitor.pose), rig = visitor.rig;
      const seatHeight = seats.current[id] ?? .46;
      // Bottom of the rig's trousers rests on the actual generated seat surface.
      visitor.group.position.set(p.x, PARK.ground + p.seated * (seatHeight - .49 * PARK.visitorScale), p.z);
      visitor.group.rotation.y = p.yaw;
      visitor.group.userData.stage = p.stage; visitor.group.userData.seated = p.seated;
      const gait = reduced.matches ? 0 : Math.sin(time * 7 + id) * .38 * p.walking;
      rig.legs.forEach((leg, side) => { leg.hip.rotation.x = -Math.PI / 2 * p.seated + gait * (side ? -1 : 1); leg.knee.rotation.x = Math.PI / 2 * p.seated; });
      poseArm(rig.arms[0], -1, [-.43 + p.seated * .11, .55 + p.seated * .16, .08 + p.seated * .37 + gait * .3]);
      poseArm(rig.arms[1], 1, [.43 - p.seated * .11, .55 + p.seated * .16, .08 + p.seated * .37 - gait * .3]);
      rig.head.rotation.y = reduced.matches ? 0 : Math.sin(time * .65 + id * 2) * .09 * (1 - p.walking);
      rig.head.rotation.x = -.025 * p.seated;
      rig.tail.scale.z = 1 - p.seated * .7;
      rig.face.apply({ happy: .45 + p.seated * .3, disappointed: 0 }, 1);
    }
  }, -1);
  return <group ref={root} name="city-park">
    <group name="park-landscape"><Batch items={scenery.blocks} /><Batch items={scenery.foliage} shape="sphere" /></group>
    {PARK_BENCHES.map((x, id) => <ParkBench key={id} id={id} x={x} onReady={seatCallbacks[id]} />)}
    {visitors.map(visitor => <primitive key={visitor.group.uuid} object={visitor.group} dispose={null} />)}
  </group>;
});
