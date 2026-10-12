import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { restaurant } from './engine';
import { cityDelta } from './city-motion';
import { CityLighting } from './CityLighting';
import { createRainSeeds, PUDDLE_COUNT, RAIN_COUNT, WeatherAnimation, writeRainPositions, type WeatherKind, type WeatherMode } from './weather';

const noRaycast = () => {};
const colors = {
  top: ['#b89393', '#B7E5EF', '#526579'], middle: ['#efb68a', '#F6E7CA', '#8999A3'], bottom: ['#f5d5a3', '#FFF2D7', '#C5DFDF'],
  fog: ['#e8bd9c', '#FFF2D7', '#8999A3'], key: ['#ffd3a2', '#FFF2D7', '#C5DFDF'], ambient: ['#ffedda', '#FFF2D7', '#C5DFDF'],
} as const;

/** Bounded outdoor rain and blended lighting. No engine writes, audio, postprocessing or hit targets. */
export const CityWeather = memo(function CityWeather({ columns, mode, building, onChange }: { columns: number; mode: WeatherMode; building: boolean; onChange: (kind: WeatherKind) => void }) {
  const reduced = useReducedMotionQuery(), animation = useRef<WeatherAnimation>(new WeatherAnimation()), identity = useRef(restaurant.state);
  const reported = useRef<WeatherKind | null>(null), root = useRef<THREE.Group>(null);
  const sun = useRef<THREE.DirectionalLight>(null), ambient = useRef<THREE.AmbientLight>(null), fill = useRef<THREE.DirectionalLight>(null);
  const fog = useRef<THREE.Fog>(null), rain = useRef<THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>>(null);
  const puddles = useRef<THREE.InstancedMesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>>(null), ripples = useRef<THREE.InstancedMesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>(null);
  const seeds = useMemo(() => createRainSeeds(columns), [columns]);
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const palette = Object.fromEntries(Object.entries(colors).map(([key, values]) => [key, values.map(value => new THREE.Color(value))])) as Record<keyof typeof colors, THREE.Color[]>;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_COUNT * 6), 3).setUsage(THREE.DynamicDrawUsage));
    return { context, texture, palette, geometry, color: new THREE.Color(), dummy: new THREE.Object3D(), skySun: -1, skyRain: -1 };
  }, []);
  useEffect(() => () => { resources.texture.dispose(); resources.geometry.dispose(); }, [resources]);
  useFrame(({ camera }, dt) => {
    if (identity.current !== restaurant.state) { identity.current = restaurant.state; animation.current = new WeatherAnimation(); }
    const weather = animation.current;
    weather.update(cityDelta(dt, restaurant.state.phase, restaurant.paused, restaurant.speed, document.hidden, reduced.matches), mode, reduced.matches);
    if (reported.current !== weather.kind) { reported.current = weather.kind; onChange(weather.kind); }
    const { sun: sunlight, rain: rainfall, time } = weather;
    const blendColor = (name: keyof typeof colors) => {
      const [base, bright, wet] = resources.palette[name];
      const remaining = 1 - sunlight - rainfall;
      return resources.color.setRGB(base.r * remaining + bright.r * sunlight + wet.r * rainfall, base.g * remaining + bright.g * sunlight + wet.g * rainfall, base.b * remaining + bright.b * sunlight + wet.b * rainfall);
    };
    if (sun.current) { sun.current.intensity = 2.4 + sunlight * 1.3 - rainfall * 1.8; sun.current.color.copy(blendColor('key')); }
    if (ambient.current) { ambient.current.intensity = .65 + rainfall * .22; ambient.current.color.copy(blendColor('ambient')); }
    if (fill.current) fill.current.intensity = .8 - sunlight * .15 + rainfall * .1;
    if (fog.current) { fog.current.color.copy(blendColor('fog')); const distanceOffset = Math.max(0, (camera.userData.viewDistance ?? 32.56) - 32.56); fog.current.near = 40 + distanceOffset - rainfall * 7; fog.current.far = 90 + distanceOffset - rainfall * 12; }
    // Upload the small backdrop only when the blend visibly changes, not on every rain frame.
    if (Math.abs(resources.skySun - sunlight) > .005 || Math.abs(resources.skyRain - rainfall) > .005) {
      const ctx = resources.context;
      if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, blendColor('top').getStyle()); gradient.addColorStop(.45, blendColor('middle').getStyle()); gradient.addColorStop(1, blendColor('bottom').getStyle());
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
        if (sunlight > 0) {
          const glow = ctx.createRadialGradient(48, 48, 3, 48, 48, 130);
          glow.addColorStop(0, `rgba(255,242,215,${sunlight * .85})`); glow.addColorStop(.2, `rgba(242,183,67,${sunlight * .3})`); glow.addColorStop(1, 'rgba(242,183,67,0)');
          ctx.fillStyle = glow; ctx.fillRect(0, 0, 256, 256);
        }
        resources.texture.needsUpdate = true;
      }
      resources.skySun = sunlight; resources.skyRain = rainfall;
    }
    if (rain.current) {
      rain.current.visible = rainfall > .005 && !reduced.matches;
      rain.current.material.opacity = rainfall * (building ? .3 : .58);
      if (rain.current.visible) {
        writeRainPositions(seeds, time, resources.geometry.attributes.position.array as Float32Array);
        resources.geometry.attributes.position.needsUpdate = true;
      }
    }
    if (puddles.current && ripples.current) {
      puddles.current.visible = rainfall > .005;
      puddles.current.material.opacity = rainfall * .3;
      ripples.current.visible = rainfall > .005 && !reduced.matches;
      ripples.current.material.opacity = rainfall * .27;
      for (let i = 0; i < PUDDLE_COUNT; i++) {
        const seed = seeds[i * 15], dummy = resources.dummy;
        dummy.position.set(seed.x, seed.floor + .012, seed.z); dummy.rotation.set(-Math.PI / 2, 0, i * 1.3);
        dummy.scale.set(.4 + seed.phase * .4, .2 + seed.phase * .18, 1); dummy.updateMatrix(); puddles.current.setMatrixAt(i, dummy.matrix);
        const phase = (time * .85 + seed.phase) % 1, radius = .035 + phase * .38;
        dummy.position.y += .008; dummy.scale.setScalar(radius * (1 - Math.pow(phase, 8))); dummy.updateMatrix(); ripples.current.setMatrixAt(i, dummy.matrix);
      }
      puddles.current.instanceMatrix.needsUpdate = true; ripples.current.instanceMatrix.needsUpdate = true;
    }
    if (root.current) Object.assign(root.current.userData, { time, kind: weather.kind, mode, sun: sunlight, rain: rainfall, reduced: reduced.matches });
  }, -1);
  return <>
    <CityLighting columns={columns} weather={animation} building={building} />
    <primitive attach="background" object={resources.texture} />
    <fog ref={fog} attach="fog" args={['#e8bd9c', 40, 90]} />
    <group ref={root} name="city-weather">
    <ambientLight ref={ambient} intensity={.65} color="#ffedda" />
    <hemisphereLight args={['#fff0d8', '#687b52', 1.1]} />
    <directionalLight ref={sun} name="weather-sunlight" position={[-5, 20, -8]} intensity={2.4} color="#ffd3a2" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-normalBias={.03} shadow-bias={-.0001} />
    <directionalLight ref={fill} position={[10, 8, 20]} intensity={.8} color="#c5dfdf" />
    <lineSegments ref={rain} name="weather-rain" geometry={resources.geometry} frustumCulled={false} raycast={noRaycast} visible={false}>
      <lineBasicMaterial color="#B7E5EF" transparent opacity={0} depthWrite={false} />
    </lineSegments>
    <instancedMesh ref={puddles} name="weather-puddles" args={[undefined, undefined, PUDDLE_COUNT]} frustumCulled={false} raycast={noRaycast} visible={false}>
      <circleGeometry args={[1, 24]} /><meshStandardMaterial color="#B7E5EF" transparent opacity={0} roughness={.2} metalness={.15} depthWrite={false} />
    </instancedMesh>
    <instancedMesh ref={ripples} name="weather-ripples" args={[undefined, undefined, PUDDLE_COUNT]} frustumCulled={false} raycast={noRaycast} visible={false}>
      <ringGeometry args={[.87, 1, 24]} /><meshBasicMaterial color="#FFF2D7" transparent opacity={0} depthWrite={false} />
    </instancedMesh>
  </group></>;
});
