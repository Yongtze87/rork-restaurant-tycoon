import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { MODELS } from '@/game/assets';
import { normalizeModel } from '@/scene/GeneratedModel';
import { PARK } from './park-motion';

class BenchBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
function LoadedBench({ id, x, onReady }: { id: number; x: number; onReady: (height: number | null) => void }) {
  const { scene } = useGLTF(MODELS.parkBench.url);
  const model = useMemo(() => {
    const n = normalizeModel(scene, MODELS.parkBench, PARK.benchWidth, 'width');
    const visual = new THREE.Group(); visual.position.set(...n.position); visual.quaternion.copy(n.q); visual.scale.setScalar(n.scale); visual.add(n.clone);
    const runtime = new THREE.Group(); runtime.name = 'generated_model_runtime'; runtime.add(visual);
    // Match the low benches to our short-legged animal rigs without changing horizontal clearance.
    runtime.scale.y = .8; runtime.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 4, .13), new THREE.Vector3(0, -1, 0));
    const seatHeight = ray.intersectObject(runtime, true)[0]?.point.y ?? null;
    const materials = new Set<THREE.Material>();
    runtime.traverse(node => { if (node instanceof THREE.Mesh) { node.raycast = () => {}; (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material)); } });
    return { runtime, seatHeight, materials };
  }, [scene]);
  useEffect(() => {
    onReady(model.seatHeight);
    return () => { onReady(null); model.materials.forEach(material => material.dispose()); };
  }, [model, onReady]);
  // The normalized front is +Z. Both benches face the restaurant, towards world -Z.
  const facing = Math.atan2(0, -1);
  return <group name={`park-bench-${id}`} position={[x, PARK.ground, PARK.benchZ]} rotation={[0, facing, 0]} userData={{ seatHeight: model.seatHeight }}><primitive object={model.runtime} dispose={null} /></group>;
}
/** Furniture streams independently; visitors wait on the path until both seats exist. */
export function ParkBench(props: { id: number; x: number; onReady: (height: number | null) => void }) {
  return <BenchBoundary><Suspense fallback={null}><LoadedBench {...props} /></Suspense></BenchBoundary>;
}
