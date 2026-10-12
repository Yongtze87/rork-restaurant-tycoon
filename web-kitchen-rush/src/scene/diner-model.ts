import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { GuestSpecies } from '@/game/diners';
import { createChefFace } from './chef-face';

type XYZ = [number, number, number];
/** Lightweight original animal guests with independently articulated hips, knees and arms. */
export function createDinerRig(species: GuestSpecies, variant: number) {
  const croc = species === 'crocodile', rabbit = species === 'rabbit', bear = species === 'bear';
  const skin = croc ? '#78A64B' : rabbit ? '#FFF2D7' : bear ? '#B76544' : '#94A49D';
  const light = croc ? '#D5CF83' : rabbit ? '#FFF9E9' : bear ? '#F0AB70' : '#D3DAD0';
  const shirt = ['#F2B743', '#526579', '#3B9C98', '#DC533C', '#FFF2D7'][variant % 5];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const sphere = new THREE.SphereGeometry(1, 16, 10), box = new RoundedBoxGeometry(1, 1, 1, 2, .18);
  geometries.add(sphere); geometries.add(box);
  const root = new THREE.Group(); root.name = 'diner-rig'; root.userData.species = species;
  const joint = (parent: THREE.Group, name: string, position: XYZ = [0, 0, 0]) => {
    const g = new THREE.Group(); g.name = name; g.position.set(...position); parent.add(g); return g;
  };
  const add = (parent: THREE.Group, geometry: THREE.BufferGeometry, color: string, pos: XYZ, scale: XYZ, rotation: XYZ = [0, 0, 0]) => {
    let material = materials.get(color);
    if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: .8 }); materials.set(color, material); }
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...pos); mesh.scale.set(...scale); mesh.rotation.set(...rotation); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const oval = (p: THREE.Group, c: string, pos: XYZ, scale: XYZ, rotation?: XYZ) => add(p, sphere, c, pos, scale, rotation);
  const block = (p: THREE.Group, c: string, pos: XYZ, scale: XYZ, rotation?: XYZ) => add(p, box, c, pos, scale, rotation);
  const body = joint(root, 'shirt');
  oval(body, shirt, [0, .9, 0], [.36, .33, .28]);
  oval(body, '#233D3B', [0, .61, 0], [.30, .12, .235]);
  for (const side of [-1, 1]) block(body, '#FFF2D7', [side * .10, 1.135, .19], [.15, .15, .04], [0, 0, side * -.4]);
  if (variant % 2 === 0) {
    for (const y of [.78, .9]) oval(body, '#FFF2D7', [0, y, .257], [.29, .027, .029]);
  } else {
    block(body, light, [.17, .98, .26], [.13, .12, .025]);
    for (const y of [.8, .96, 1.09]) oval(body, '#F2B743', [0, y, .283], [.023, .023, .014]);
  }
  const head = joint(root, 'head', [0, 1.42, .015]);
  oval(head, skin, [0, 0, 0], croc ? [.36, .315, .33] : [.355, .345, .31]);
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    if (!croc) {
      const ear = joint(head, `ear-${side}`, [side * (rabbit ? .21 : .34), rabbit ? .31 : .22, -.015]); ears.push(ear);
      const size: XYZ = rabbit ? [.13, .40, .10] : bear ? [.155, .17, .085] : [.24, .26, .10];
      oval(ear, skin, [0, 0, 0], size, [0, 0, side * -.16]);
      oval(ear, rabbit || !bear ? '#E7A498' : light, [0, .008, .07], [size[0] * .64, size[1] * .72, .035], [0, 0, side * -.16]);
      oval(head, light, [side * .112, -.115, .272], [.153, .117, .135]);
      oval(head, '#E7A498', [side * .24, -.09, .238], [.065, .035, .014]);
    } else {
      oval(head, skin, [side * .185, .16, .17], [.142, .19, .155]);
      oval(head, '#4E7838', [side * .165, .076, .66], [.037, .022, .03]);
    }
  }
  if (croc) {
    oval(head, light, [0, -.17, .41], [.275, .106, .295]);
    block(head, skin, [0, -.046, .37], [.55, .205, .67]);
    oval(head, skin, [0, .012, .6], [.282, .118, .17]);
  } else {
    oval(head, rabbit ? '#E7A498' : '#233D3B', [0, -.064, .391], [.066, .046, .054]);
    if (rabbit || !bear) block(head, '#FFF9E9', [0, -.215, .34], [.075, .055, .045]);
  }
  const legs = [-1, 1].map(side => {
    const hip = joint(root, `hip-${side}`, [side * .175, .62, 0]);
    oval(hip, '#526579', [0, -.145, 0], [.12, .175, .12]);
    const knee = joint(hip, `knee-${side}`, [0, -.29, 0]);
    oval(knee, '#526579', [0, -.105, 0], [.10, .15, .105]);
    block(knee, '#233D3B', [0, -.22, .055], [.22, .18, .31]);
    block(knee, '#FFF2D7', [0, -.302, .06], [.22, .035, .31]);
    return { hip, knee };
  });
  const sleeve = new THREE.CapsuleGeometry(.105, .26, 4, 12); sleeve.translate(0, .13, 0).scale(1, 1 / .26, 1); geometries.add(sleeve);
  const arms = [-1, 1].map(side => {
    const upper = joint(root, `upper-arm-${side}`); add(upper, sleeve, shirt, [0, 0, 0], [1, 1, 1]);
    const forearm = joint(root, `forearm-${side}`); oval(forearm, skin, [0, .42, 0], [.09, .65, .09]);
    const hand = joint(root, `hand-${side}`); oval(hand, skin, [0, 0, 0], [.11, .10, .12]);
    oval(hand, light, [side * -.07, -.015, .055], [.044, .055, .05]);
    return { upper, forearm, hand };
  });
  const tail = joint(root, 'tail', [0, .7, -.24]);
  oval(tail, skin, [0, 0, croc ? -.21 : 0], croc ? [.14, .11, .31] : rabbit ? [.13, .13, .13] : [.08, .08, .10]);
  if (species === 'mouse') {
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(.12, -.16, -.2), new THREE.Vector3(.30, -.17, -.32), new THREE.Vector3(.37, -.06, -.34)]), 12, .025, 5, false);
    geometries.add(tube); add(tail, tube, '#E7A498', [0, 0, 0], [1, 1, 1]);
  }
  const bite = joint(arms[0].hand, 'bite'); oval(bite, '#F2B743', [0, .04, .065], [.075, .055, .06]);
  const painted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78 }); materials.set('painted', painted);
  const batch = (group: THREE.Group): void => {
    for (const child of group.children) if (child instanceof THREE.Group) batch(child);
    const meshes = group.children.filter((n): n is THREE.Mesh => n instanceof THREE.Mesh);
    if (!meshes.length) return;
    const parts = meshes.map(mesh => {
      mesh.updateMatrix(); const original = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      const geo = original.index ? original.toNonIndexed() : original; if (geo !== original) original.dispose();
      const c = (mesh.material as THREE.MeshStandardMaterial).color, rgb = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < rgb.length; i += 3) { rgb[i] = c.r; rgb[i + 1] = c.g; rgb[i + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3)); return geo;
    });
    const merged = mergeGeometries(parts); parts.forEach(p => p.dispose());
    if (merged) { geometries.add(merged); meshes.forEach(m => group.remove(m)); const mesh = new THREE.Mesh(merged, painted); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
  };
  batch(root);
  const face = createChefFace(head, !croc);
  return { root, head, face, ears, legs, arms, tail, bite,
    dispose: () => { face.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}
