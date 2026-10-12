import { memo, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { InstanceSpec } from '@/scene/Primitives';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import type { WeatherAnimation } from './weather';
import { cityFixtures, cityLightLevel, neonPieces, neonShimmer, NEON_COLORS } from './city-lighting';

const noRaycast = () => {};
type LightMesh = THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
type GlowMesh = THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

function place(mesh: THREE.InstancedMesh | null, items: readonly InstanceSpec[], dummy: THREE.Object3D): void {
  if (!mesh) return;
  items.forEach((item, index) => {
    dummy.position.set(...item.position); dummy.rotation.set(...(item.rotation ?? [0, 0, 0])); dummy.scale.set(...item.scale); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Local luminous surfaces, not a full-screen bloom pass; every effect ignores raycasts. */
export const CityLighting = memo(function CityLighting({ columns, weather, building }: { columns: number; weather: RefObject<WeatherAnimation>; building: boolean }) {
  const reduced = useReducedMotionQuery(), root = useRef<THREE.Group>(null);
  const bulbs = useRef<LightMesh>(null), halos = useRef<GlowMesh>(null), pools = useRef<GlowMesh>(null);
  const neon = useRef<(LightMesh | null)[]>([]), signs = useRef<(GlowMesh | null)[]>([]);
  const fixtures = useMemo(() => cityFixtures(columns), [columns]);
  const tubes = useMemo(() => NEON_COLORS.map((_, channel) => neonPieces(fixtures.buildings, channel)), [fixtures]);
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
      const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
      glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(.18, 'rgba(255,255,255,.65)'); glow.addColorStop(.5, 'rgba(255,255,255,.18)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, dummy: new THREE.Object3D(), cameraRotation: new THREE.Quaternion() };
  }, []);
  useEffect(() => () => resources.texture.dispose(), [resources]);
  useLayoutEffect(() => {
    const dummy = resources.dummy;
    place(bulbs.current, fixtures.lamps.map(l => ({ position: [l.x, 1.67, l.z], scale: [.26, .35, .26], color: '#FFBF52' })), dummy);
    place(pools.current, fixtures.lamps.map(l => ({ position: [l.x, -1.012, l.z], scale: [2.8, 2.8, 1], rotation: [-Math.PI / 2, 0, 0], color: '#FFBF52' })), dummy);
    tubes.forEach((items, channel) => {
      place(neon.current[channel], items, dummy);
      place(signs.current[channel], fixtures.buildings.filter((_, i) => i % 3 === channel).map(b => ({
        position: [b.x + 2.16 * Math.sin(b.facing), 1.02, b.z + 2.16 * Math.cos(b.facing)], rotation: [0, b.facing, 0], scale: [3.6, .95, 1], color: NEON_COLORS[channel],
      })), dummy);
    });
  }, [fixtures, tubes, resources]);
  // Weather runs at -1; reading at -0.5 makes lights use the very same blend, pause and reset frame.
  useFrame(({ camera }) => {
    const current = weather.current, level = cityLightLevel(current.sun, current.rain);
    const softness = building ? .45 : 1;
    if (bulbs.current) bulbs.current.material.emissiveIntensity = level * 2.8;
    if (halos.current && pools.current) {
      halos.current.visible = pools.current.visible = level > .001;
      halos.current.material.opacity = level * .48 * softness;
      pools.current.material.opacity = level * .34 * softness;
      camera.getWorldQuaternion(resources.cameraRotation);
      fixtures.lamps.forEach((lamp, index) => {
        const dummy = resources.dummy;
        dummy.position.set(lamp.x, 1.67, lamp.z); dummy.quaternion.copy(resources.cameraRotation); dummy.scale.set(1.2, 1.2, 1); dummy.updateMatrix(); halos.current!.setMatrixAt(index, dummy.matrix);
      });
      halos.current.instanceMatrix.needsUpdate = true;
    }
    for (let channel = 0; channel < NEON_COLORS.length; channel++) {
      const intensity = level * neonShimmer(current.time, channel, reduced.matches);
      const tube = neon.current[channel], sign = signs.current[channel];
      if (tube) tube.material.emissiveIntensity = intensity * 2.2;
      if (sign) { sign.visible = level > .001; sign.material.opacity = intensity * .38 * softness; }
    }
    if (root.current) Object.assign(root.current.userData, { level, time: current.time, reduced: reduced.matches, building });
  }, -.5);
  return <group ref={root} name="city-lighting">
    <instancedMesh ref={bulbs} name="city-lanterns" args={[undefined, undefined, fixtures.lamps.length]} raycast={noRaycast}>
      <boxGeometry /><meshStandardMaterial color="#FFF2D7" emissive="#FFBF52" emissiveIntensity={0} roughness={.6} />
    </instancedMesh>
    <instancedMesh ref={halos} name="city-lamp-halos" args={[undefined, undefined, fixtures.lamps.length]} raycast={noRaycast} frustumCulled={false} visible={false}>
      <planeGeometry /><meshBasicMaterial map={resources.texture} color="#FFBF52" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    <instancedMesh ref={pools} name="city-light-pools" args={[undefined, undefined, fixtures.lamps.length]} raycast={noRaycast} visible={false}>
      <planeGeometry /><meshBasicMaterial map={resources.texture} color="#FFBF52" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    {NEON_COLORS.map((color, channel) => <group key={color}>
      <instancedMesh ref={mesh => { neon.current[channel] = mesh as LightMesh | null; }} name={`city-neon-${channel}`} args={[undefined, undefined, tubes[channel].length]} raycast={noRaycast}>
        <boxGeometry /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0} roughness={.55} />
      </instancedMesh>
      <instancedMesh ref={mesh => { signs.current[channel] = mesh as GlowMesh | null; }} name={`city-neon-glow-${channel}`} args={[undefined, undefined, fixtures.buildings.length / 3]} raycast={noRaycast} visible={false}>
        <planeGeometry /><meshBasicMaterial map={resources.texture} color={color} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>)}
  </group>;
});
