import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { MODELS } from '@/game/assets';
import { normalizeModel } from '@/scene/GeneratedModel';
import { Box } from '@/scene/Primitives';
import { BULLETIN } from './bulletin';

const noRaycast = (): void => {};
function DisplayFaces({ map, width, height = width / 1.6, y, front, back }: { map: THREE.Texture; width: number; height?: number; y: number; front: number; back: number }) {
  return <>{[1, -1].map(side => <mesh key={side} name={`bulletin-screen-${side}`} position={[0, y, side === 1 ? front : back]} rotation={[0, side === 1 ? 0 : Math.PI, 0]} raycast={noRaycast}>
    <planeGeometry args={[width, height]} /><meshBasicMaterial map={map} toneMapped={false} />
  </mesh>)}</>;
}
function LoadedHousing({ map }: { map: THREE.Texture }) {
  const { scene } = useGLTF(MODELS.bulletin.url);
  const model = useMemo(() => {
    const n = normalizeModel(scene, MODELS.bulletin, BULLETIN.width, 'width');
    const visual = new THREE.Group(); visual.position.set(...n.position); visual.quaternion.copy(n.q); visual.scale.setScalar(n.scale); visual.add(n.clone);
    const runtime = new THREE.Group(); runtime.name = 'generated_model_runtime'; runtime.add(visual); runtime.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(runtime), size = bounds.getSize(new THREE.Vector3());
    // Calibrated to the generated panel's flat region (above the pedestal, below the rain hood).
    const y = size.y * .648, screenWidth = size.x * .835, screenHeight = size.y * .49;
    // Probe the flat panel, not the deeper base, so the emissive display sits flush on its enclosure.
    const frontRay = new THREE.Raycaster(new THREE.Vector3(0, y, 10), new THREE.Vector3(0, 0, -1));
    const backRay = new THREE.Raycaster(new THREE.Vector3(0, y, -10), new THREE.Vector3(0, 0, 1));
    const front = (frontRay.intersectObject(runtime, true)[0]?.point.z ?? bounds.max.z) + .015;
    const back = (backRay.intersectObject(runtime, true)[0]?.point.z ?? bounds.min.z) - .015;
    const materials = new Set<THREE.Material>();
    runtime.traverse(node => { if (node instanceof THREE.Mesh) { node.raycast = noRaycast; (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material)); } });
    return { runtime, y, screenWidth, screenHeight, front, back, materials };
  }, [scene]);
  useEffect(() => () => model.materials.forEach(material => material.dispose()), [model]);
  return <group name="bulletin-enclosure"><primitive object={model.runtime} dispose={null} /><DisplayFaces map={map} width={model.screenWidth} height={model.screenHeight} y={model.y} front={model.front} back={model.back} /></group>;
}
function FallbackHousing({ map }: { map: THREE.Texture }) {
  const root = useMemo(() => new THREE.Group(), []);
  useEffect(() => { root.traverse(node => { if (node instanceof THREE.Mesh) node.raycast = noRaycast; }); }, [root]);
  return <primitive object={root}>
    <Box position={[0, .12, 0]} size={[1.6, .24, .85]} color="#FFF2D7" />
    <Box position={[0, .7, 0]} size={[.4, 1.3, .32]} color="#224F4A" />
    <Box position={[0, 2.3, 0]} size={[3.8, 2.45, .3]} color="#FFF2D7" />
    <DisplayFaces map={map} width={3.55} y={2.3} front={.16} back={-.16} />
  </primitive>;
}
class HousingBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
/** Isolated asset loading: a network failure cannot take down the restaurant or its live readout. */
export function BulletinHousing({ map }: { map: THREE.Texture }) {
  const fallback = <FallbackHousing map={map} />;
  return <HousingBoundary fallback={fallback}><Suspense fallback={fallback}><LoadedHousing map={map} /></Suspense></HousingBoundary>;
}
