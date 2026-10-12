import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Box } from '@/scene/Primitives';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { restaurant } from './engine';
import { cityDelta } from './city-motion';
import { BULLETIN, bulletinPage, readBulletin, type BulletinReadout } from './bulletin';
import { paintBulletin } from './bulletin-screen';
import { BulletinHousing } from './BulletinHousing';

const noRaycast = (): void => {};
/** A persistent in-world screen, not an overlay. Content updates even with reduced motion enabled. */
export const CityBulletin = memo(function CityBulletin() {
  const root = useRef<THREE.Group>(null), clock = useRef<number>(0);
  const identity = useRef(restaurant.state), day = useRef<number>(restaurant.state.day);
  const previous = useRef<string>(''), fonts = useRef<boolean>(false);
  const reduced = useReducedMotionQuery();
  const cached = useRef<{ revision: number; data: BulletinReadout | null; key: string }>({ revision: -1, data: null, key: '' });
  const display = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 640;
    const ctx = canvas.getContext('2d');
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return { ctx, map };
  }, []);
  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => { if (active) fonts.current = true; });
    root.current?.traverse(node => { if (node instanceof THREE.Mesh) node.raycast = noRaycast; });
    return () => { active = false; display.map.dispose(); };
  }, [display]);
  useFrame((_, dt) => {
    const state = restaurant.state;
    if (identity.current !== state || day.current !== state.day) {
      identity.current = state; day.current = state.day; clock.current = 0; previous.current = '';
    }
    clock.current += cityDelta(dt, state.phase, restaurant.paused, restaurant.speed, document.hidden, reduced.matches);
    const revision = restaurant.getSnapshot();
    if (!cached.current.data || cached.current.revision !== revision) {
      const data = readBulletin(state, restaurant.paused);
      cached.current = { revision, data, key: JSON.stringify(data) };
    }
    const data = cached.current.data!, page = bulletinPage(clock.current, data.notices.length);
    const key = `${cached.current.key}:${page}:${fonts.current}`;
    if (key !== previous.current && display.ctx) {
      paintBulletin(display.ctx, data, page); display.map.needsUpdate = true; previous.current = key;
    }
    if (root.current) { root.current.userData.time = clock.current; root.current.userData.readout = data; root.current.userData.page = page; }
  }, -1);
  return <group ref={root} name="city-bulletin" position={[BULLETIN.x, BULLETIN.ground, BULLETIN.z]} rotation={[0, Math.atan2(.5, .8660254), 0]}>
    <Box position={[0, -.025, 0]} size={[4.3, .1, 1.5]} color="#F6E7CA" />
    <BulletinHousing map={display.map} />
  </group>;
});
