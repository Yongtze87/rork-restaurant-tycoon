import { Component, useEffect, useMemo, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ChefOutfit } from '@/game/chef-outfit';
import { sampleChefPose } from '@/game/chef-animation';
import { createChefLocomotion } from '@/game/chef-locomotion';
import { createChefArmPoser } from './chef-arm';
import { createChefRig } from './chef-model';

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="flex h-full items-center p-6 text-center text-sm font-bold text-paper">3D preview unavailable. You can still choose your colors below.</p> : this.props.children; }
}

function PreviewRig({ id, outfit }: { id: number; outfit: ChefOutfit }) {
  const rig = useMemo(() => {
    const model = createChefRig(id), poseArm = createChefArmPoser();
    const pose = sampleChefPose({ id, time: 0, motion: createChefLocomotion(), held: null, action: 'idle', reduced: true });
    model.root.rotation.y = -.24;
    model.arms.forEach((arm, i) => poseArm(arm, i === 0 ? -1 : 1, i === 0 ? pose.right : pose.left));
    return model;
  }, [id]);
  const { camera, size, invalidate } = useThree();
  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => { rig.setOutfit(outfit); invalidate(); }, [rig, outfit, invalidate]);
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.position.set(2, 2.1, 7); cam.lookAt(0, 1.13, 0);
    cam.zoom = Math.min(size.width / 2.65, size.height / 2.85); cam.updateProjectionMatrix(); invalidate();
  }, [camera, size, invalidate]);
  return <primitive object={rig.root} dispose={null} />;
}

/** The actual gameplay rig, lit in a static on-demand portrait rather than an illustration. */
export function ChefPreview({ id, outfit }: { id: number; outfit: ChefOutfit }) {
  return <div role="img" aria-label={`Chef ${id + 1} ${id === 0 ? 'crocodile' : 'mouse'} preview: ${outfit.hat} hat, ${outfit.apron} apron`} className="h-[210px] w-full sm:h-[330px]">
    <PreviewBoundary><Canvas orthographic frameloop="demand" dpr={[1, 1.5]} camera={{ position: [2, 2.1, 7], zoom: 100, near: .1, far: 30 }} gl={{ antialias: true, alpha: true }} fallback={<p className="p-5 text-paper">3D preview needs WebGL. Your color choices still apply.</p>}>
      <ambientLight intensity={1.3} /><hemisphereLight args={['#FFF2D7', '#526579', 1.2]} />
      <directionalLight position={[-3, 5, 6]} intensity={2.5} /><directionalLight position={[4, 2, -3]} intensity={1.4} color="#F0AB70" />
      <PreviewRig id={id} outfit={outfit} />
      <mesh position={[0, -.04, 0]}><cylinderGeometry args={[.85, .94, .12, 48]} /><meshStandardMaterial color="#275A55" roughness={.85} /></mesh>
    </Canvas></PreviewBoundary>
  </div>;
}
