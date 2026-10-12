import { Component, memo, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createDinerRig } from '@/scene/diner-model';
import { createChefArmPoser } from '@/scene/chef-arm';
import { GeneratedProp } from '@/scene/GeneratedModel';
import { AUDIO, type ModelAsset } from '@/game/assets';
import { TrafficAudio } from './traffic-audio';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { restaurant } from './engine';
import { CITY_CARS, CITY_WALKERS, cityDelta, cityLoop, sampleStreet } from './city-motion';

const CITY_CAR: ModelAsset = { url: 'https://4t92512aiqitifoedg47w.rork.app/~assets/3d/f1c9e330-ee14-405f-85a7-2cde23bfba6c.glb', front: 'negativeX', up: 'positiveY' };
class TrafficBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Bounded cosmetic population, separate from restaurant orders, income and persistence. */
export const CityLife = memo(function CityLife({ columns, audioEnabled, building }: { columns: number; audioEnabled: boolean; building: boolean }) {
  const audio = useRef<TrafficAudio | null>(null), enabled = useRef<boolean>(audioEnabled);
  enabled.current = audioEnabled;
  const reduced = useReducedMotionQuery(), clock = useRef<number>(0), stateIdentity = useRef(restaurant.state);
  const root = useRef<THREE.Group>(null), poseArm = useMemo(createChefArmPoser, []);
  const actors = useMemo(() => {
    const cars = Array.from({ length: CITY_CARS }, (_, id) => {
      const direction = (id % 2 ? -1 : 1) as 1 | -1, loop = cityLoop(columns, direction * 1.15);
      const group = new THREE.Group(); group.name = `city-car-${id}`;
      return { group, direction, loop, offset: (Math.floor(id / 2) / 3 + (id % 2 ? .14 : .04)) * loop.length, pose: { x: 0, z: 0, yaw: 0 } };
    });
    const walkers = Array.from({ length: CITY_WALKERS }, (_, id) => {
      const species = (['mouse', 'rabbit', 'bear', 'crocodile'] as const)[id % 4];
      const rig = createDinerRig(species, id + 31), group = new THREE.Group();
      group.name = `city-walker-${id}`; group.scale.setScalar(.64); group.add(rig.root); rig.bite.visible = false;
      rig.root.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = false; });
      const direction = (id % 2 ? -1 : 1) as 1 | -1, loop = cityLoop(columns, id % 2 ? -3.65 : -3.03);
      return { group, rig, direction, loop, offset: (id / CITY_WALKERS + .13) * loop.length, pose: { x: 0, z: 0, yaw: 0 } };
    });
    return { cars, walkers };
  }, [columns]);
  useEffect(() => {
    const sound = new TrafficAudio({ engine: AUDIO.cityEngine, horn: AUDIO.cityHorn }, () => enabled.current && !restaurant.paused && restaurant.state.phase !== 'report' && !reduced.matches);
    audio.current = sound;
    const group = root.current; if (group) group.userData.trafficAudio = sound;
    let previous = restaurant.state;
    const unsubscribe = restaurant.subscribe(() => { if (previous !== restaurant.state) { previous = restaurant.state; sound.reset(); } sound.sync(); });
    reduced.addEventListener('change', sound.sync);
    return () => { unsubscribe(); reduced.removeEventListener('change', sound.sync); sound.dispose(); audio.current = null; if (group) delete group.userData.trafficAudio; };
  }, [reduced]);
  useEffect(() => { audio.current?.sync(); }, [audioEnabled]);
  useEffect(() => { audio.current?.reset(); return () => actors.walkers.forEach(actor => actor.rig.dispose()); }, [actors]);
  useFrame(({ camera }, dt) => {
    if (stateIdentity.current !== restaurant.state) { stateIdentity.current = restaurant.state; clock.current = 0; audio.current?.reset(); }
    clock.current += cityDelta(dt, restaurant.state.phase, restaurant.paused, restaurant.speed, document.hidden, reduced.matches);
    const time = clock.current;
    if (root.current) root.current.userData.time = time;
    for (const car of actors.cars) {
      sampleStreet(car.loop, car.offset + time * 2.8 * car.direction, car.direction, car.pose);
      car.group.position.set(car.pose.x, -1.005, car.pose.z); car.group.rotation.y = car.pose.yaw;
      car.group.userData.direction = car.direction;
    }
    if (actors.cars.every(car => car.group.children.length > 0)) {
      audio.current?.update(actors.cars, columns, camera.matrixWorld.elements[0], camera.matrixWorld.elements[8], dt, time, building);
    } else audio.current?.reset();
    for (const [id, walker] of actors.walkers.entries()) {
      sampleStreet(walker.loop, walker.offset + time * .82 * walker.direction, walker.direction, walker.pose);
      walker.group.position.set(walker.pose.x, -.895, walker.pose.z); walker.group.rotation.y = walker.pose.yaw;
      const gait = reduced.matches ? 0 : Math.sin(time * 7 + id) * .38;
      walker.rig.legs[0].hip.rotation.x = gait; walker.rig.legs[1].hip.rotation.x = -gait;
      poseArm(walker.rig.arms[0], -1, [-.43, .55, .08 + gait * .3]);
      poseArm(walker.rig.arms[1], 1, [.43, .55, .08 - gait * .3]);
      walker.rig.face.apply({ happy: .35, disappointed: 0 }, 1);
    }
  }, -1);
  return <group ref={root} name="city-life" dispose={null}>
    {actors.walkers.map(walker => <primitive key={walker.group.uuid} object={walker.group} />)}
    <TrafficBoundary><Suspense fallback={null}>{actors.cars.map(car => <primitive key={car.group.uuid} object={car.group}><GeneratedProp asset={CITY_CAR} size={2.25} dimension="width" /></primitive>)}</Suspense></TrafficBoundary>
  </group>;
});
