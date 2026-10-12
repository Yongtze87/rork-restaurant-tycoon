import * as THREE from 'three';
import type { FaceWeights } from '@/game/chef-emotion';

/** Small editable facial rig; mouth shapes are generated once and blended on the GPU. */
export interface ChefFace {
  eyes: THREE.Group;
  eyeJoints: THREE.Group[];
  smileEyes: THREE.Group[];
  pupils: THREE.Group[];
  brows: THREE.Group[];
  mouth: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  apply: (weights: FaceWeights, blink: number) => void;
  dispose: () => void;
}

/** Builds matching neutral, delighted and disappointed features for both animal species. */
export function createChefFace(head: THREE.Group, mouse: boolean): ChefFace {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const sphere = new THREE.SphereGeometry(1, 16, 12); geometries.push(sphere);
  const material = (color: string): THREE.MeshStandardMaterial => {
    const result = new THREE.MeshStandardMaterial({ color, roughness: .65 }); materials.push(result); return result;
  };
  const ink = material('#233D3B'), white = material('#FFF9E9'), light = material('#D5CF83');
  const group = (parent: THREE.Group, name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const result = new THREE.Group(); result.name = name; result.position.set(x, y, z); parent.add(result); return result;
  };
  const oval = (parent: THREE.Group, mat: THREE.MeshStandardMaterial, position: [number, number, number], scale: [number, number, number]): void => {
    const mesh = new THREE.Mesh(sphere, mat); mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh);
  };
  const eyes = group(head, 'eyes'), eyeJoints: THREE.Group[] = [], pupils: THREE.Group[] = [], brows: THREE.Group[] = [];
  const openEyes: THREE.Group[] = [], smileEyes: THREE.Group[] = [];
  const smileCurve = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.058, -.012, .035), new THREE.Vector3(0, .025, .048), new THREE.Vector3(.058, -.012, .035),
  ]), 16, .012, 6, false); geometries.push(smileCurve);
  for (const side of [-1, 1]) {
    const eye = group(eyes, `eye-${side}`, side * (mouse ? .14 : .186), mouse ? .052 : .143, .28);
    eyeJoints.push(eye);
    const open = group(eye, `open-eye-${side}`); openEyes.push(open);
    const smile = group(eye, `smile-eye-${side}`); smile.add(new THREE.Mesh(smileCurve, ink)); smileEyes.push(smile);
    if (!mouse) oval(open, light, [0, 0, 0], [.083, .119, .047]);
    const pupil = group(open, `pupil-${side}`, mouse ? 0 : -side * .012, mouse ? 0 : -.006, mouse ? 0 : .038);
    pupils.push(pupil);
    oval(pupil, ink, [0, 0, 0], mouse ? [.055, .075, .035] : [.042, .069, .026]);
    oval(pupil, white, [-.012, .023, mouse ? .027 : .02], mouse ? [.016, .02, .009] : [.012, .019, .007]);
    const brow = group(head, `brow-${side}`, side * (mouse ? .147 : .186), mouse ? .162 : .288, mouse ? .28 : .34);
    oval(brow, ink, [0, 0, 0], [mouse ? .073 : .081, .019, .02]); brows.push(brow);
  }

  // Same topology for every mouth. The ribbon conforms to the rounded muzzle
  // instead of placing an expression texture or a flat decal in front of it.
  const muzzleZ = (x: number, y: number): number => {
    if (mouse) {
      let z = .31;
      for (const side of [-1, 1]) {
        const d = 1 - ((x - side * .112) / .153) ** 2 - ((y + .115) / .117) ** 2;
        if (d > 0) z = Math.max(z, .272 + .135 * Math.sqrt(d));
      }
      return z + .013;
    }
    const jaw = 1 - (x / .275) ** 2 - ((y + .169) / .106) ** 2;
    const snout = 1 - (x / .282) ** 2 - ((y - .012) / .118) ** 2;
    return Math.max(.60, jaw > 0 ? .41 + .295 * Math.sqrt(jaw) : 0, snout > 0 ? .6 + .17 * Math.sqrt(snout) : 0, y >= -.148 ? .71 : 0) + .016;
  };
  const mouthShape = (mood: 'neutral' | 'happy' | 'disappointed'): THREE.BufferGeometry => {
    const positions: number[] = [], indices: number[] = [];
    const segments = 24, width = mouse ? (mood === 'happy' ? .137 : .105) : .25;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments * 2 - 1, edge = t * t;
      const center = mouse
        ? mood === 'happy' ? -.212 + edge * .065 : mood === 'disappointed' ? -.178 - edge * .052 : -.198 + edge * .019
        : mood === 'happy' ? -.196 + edge * .10 : mood === 'disappointed' ? -.117 - edge * .074 : -.16 + edge * .034;
      const thickness = mood === 'happy' ? (mouse ? .033 : .042) * (1 - edge) + .006 : .008;
      for (const sign of [-1, 1]) {
        const x = t * width, y = center + sign * thickness;
        positions.push(x, y, muzzleZ(x, y));
      }
      if (i < segments) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices); geo.computeVertexNormals(); return geo;
  };
  const neutral = mouthShape('neutral'), happy = mouthShape('happy'), disappointed = mouthShape('disappointed');
  neutral.morphAttributes.position = [happy.getAttribute('position').clone(), disappointed.getAttribute('position').clone()];
  neutral.morphAttributes.normal = [happy.getAttribute('normal').clone(), disappointed.getAttribute('normal').clone()];
  neutral.computeBoundingSphere(); geometries.push(neutral); happy.dispose(); disappointed.dispose();
  const mouthMaterial = material('#233D3B'); mouthMaterial.side = THREE.DoubleSide;
  const mouth = new THREE.Mesh(neutral, mouthMaterial); mouth.name = 'expression-mouth'; head.add(mouth);

  const apply = ({ happy: joy, disappointed: sad }: FaceWeights, blink: number): void => {
    const weights = mouth.morphTargetInfluences;
    if (weights) { weights[0] = joy; weights[1] = sad; }
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const eye = eyeJoints[i], pupil = pupils[i], brow = brows[i];
      eye.scale.set(1 + joy * .08, (blink + (1 - blink) * joy) * (1 - sad * .26), 1);
      eye.rotation.z = side * (joy * .09 - sad * .12);
      openEyes[i].scale.setScalar(Math.max(.001, 1 - joy)); openEyes[i].visible = joy < .999;
      smileEyes[i].scale.setScalar(Math.max(.001, joy)); smileEyes[i].visible = joy > .001;
      pupil.position.y = (mouse ? 0 : -.006) - sad * .023;
      brow.position.y = (mouse ? .162 : .288) + joy * .024 + sad * .008;
      brow.rotation.z = side * (.12 - joy * .20 - sad * .65);
    }
  };
  apply({ happy: 0, disappointed: 0 }, 1);
  return { eyes, eyeJoints, smileEyes, pupils, brows, mouth, apply, dispose: () => { geometries.forEach(geo => geo.dispose()); materials.forEach(mat => mat.dispose()); } };
}
