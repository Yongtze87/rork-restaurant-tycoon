import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from '@/game/engine';
import { MAX_ACTION_EFFECTS, PARTICLES_PER_ACTION, sampleActionParticle } from '@/game/action-feedback';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';

const CAPACITY = MAX_ACTION_EFFECTS * PARTICLES_PER_ACTION;

/** Fixed GPU pools: food flecks, soap-bubble rims, and four-point clean glints. */
export function ActionEffects() {
  const seasoning = useRef<THREE.InstancedMesh>(null);
  const bubbles = useRef<THREE.InstancedMesh>(null);
  const sparkles = useRef<THREE.InstancedMesh>(null);
  const reducedMotion = useReducedMotionQuery();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const star = useMemo(() => {
    const shape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const radius = i % 2 === 0 ? 1 : .27;
      if (i === 0) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    shape.closePath();
    return shape;
  }, []);

  useFrame(({ camera }) => {
    const flecks = seasoning.current, foam = bubbles.current, glints = sparkles.current;
    if (!flecks || !foam || !glints) return;
    flecks.count = 0; foam.count = 0; glints.count = 0;
    if (!reducedMotion.matches && engine.state.phase === 'playing') {
      for (const effect of engine.actionEffects) {
        for (let i = 0; i < PARTICLES_PER_ACTION; i++) {
          const particle = sampleActionParticle(effect, i, engine.state.elapsed);
          if (!particle || particle.size <= 0) continue;
          const mesh = particle.shape === 'seasoning' ? flecks : particle.shape === 'bubble' ? foam : glints;
          dummy.position.set(particle.x, particle.y, particle.z);
          if (particle.shape === 'seasoning') {
            dummy.rotation.set(particle.angle, particle.angle * .7, particle.angle * .4);
            dummy.scale.set(particle.size * .65, particle.size * 1.8, particle.size * .45);
          } else {
            dummy.quaternion.copy(camera.quaternion);
            dummy.rotateZ(particle.angle);
            dummy.scale.setScalar(particle.size);
          }
          dummy.updateMatrix();
          mesh.setMatrixAt(mesh.count, dummy.matrix);
          mesh.setColorAt(mesh.count, color.set(particle.color));
          mesh.count++;
        }
      }
    }
    for (const mesh of [flecks, foam, glints]) {
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return <group name="chef-action-effects">
    <instancedMesh ref={seasoning} name="action-seasoning" args={[undefined, undefined, CAPACITY]} count={0} frustumCulled={false}>
      <boxGeometry />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
    <instancedMesh ref={bubbles} name="action-bubbles" args={[undefined, undefined, CAPACITY]} count={0} frustumCulled={false}>
      <ringGeometry args={[.76, 1, 16]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={.8} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
    <instancedMesh ref={sparkles} name="action-sparkles" args={[undefined, undefined, CAPACITY]} count={0} frustumCulled={false}>
      <shapeGeometry args={[star]} />
      <meshBasicMaterial toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  </group>;
}
