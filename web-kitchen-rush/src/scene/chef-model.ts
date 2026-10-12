import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createChefFace, type ChefFace } from './chef-face';
import { DEFAULT_OUTFIT, outfitColor, type ChefOutfit } from '@/game/chef-outfit';

type XYZ = [number, number, number];
/** Editable, named joints; nothing in this rig relies on imported bones or clips. */
export interface ChefRig {
  root: THREE.Group;
  head: THREE.Group;
  hat: THREE.Group;
  eyes: THREE.Group;
  face: ChefFace;
  ears: THREE.Group[];
  scarf: THREE.Group;
  tail: THREE.Group;
  legs: THREE.Group[];
  arms: { upper: THREE.Group; forearm: THREE.Group; hand: THREE.Group }[];
  food: THREE.Group;
  setOutfit: (outfit: ChefOutfit) => void;
  dispose: () => void;
}

/** Builds an original miniature animal chef from smooth, editable solid geometry. */
export function createChefRig(id: number): ChefRig {
  const mouse = id === 1;
  const colors = {
    coat: '#FFF2D7', piping: '#E1D3B7', ink: '#233D3B', accent: mouse ? '#3B9C98' : '#DC533C',
    skin: mouse ? '#94A49D' : '#78A64B', light: mouse ? '#D3DAD0' : '#D5CF83',
    dark: mouse ? '#66766B' : '#4E7838', pink: '#E7A498', white: '#FFF9E9',
  };
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries = new Set<THREE.BufferGeometry>();
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const rounded = new RoundedBoxGeometry(1, 1, 1, 3, .18);
  geometries.add(sphere); geometries.add(rounded);
  const mat = (color: string): THREE.MeshStandardMaterial => {
    let value = materials.get(color);
    if (!value) { value = new THREE.MeshStandardMaterial({ color, roughness: color === colors.ink ? .35 : .78 }); materials.set(color, value); }
    return value;
  };
  const joint = (parent: THREE.Group, name: string, position: XYZ = [0, 0, 0]): THREE.Group => {
    const group = new THREE.Group(); group.name = name; group.position.set(...position); parent.add(group); return group;
  };
  const add = (parent: THREE.Group, geo: THREE.BufferGeometry, color: string, position: XYZ, scale: XYZ = [1, 1, 1], rotation: XYZ = [0, 0, 0]): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat(color)); mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.set(...rotation);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const oval = (p: THREE.Group, color: string, pos: XYZ, scale: XYZ, rotation?: XYZ): THREE.Mesh => add(p, sphere, color, pos, scale, rotation);
  const box = (p: THREE.Group, color: string, pos: XYZ, scale: XYZ, rotation?: XYZ): THREE.Mesh => add(p, rounded, color, pos, scale, rotation);
  const tube = (p: THREE.Group, color: string, points: XYZ[], radius: number): void => {
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v => new THREE.Vector3(...v))), 20, radius, 6, false);
    geometries.add(geo); add(p, geo, color, [0, 0, 0]);
  };
  const root = new THREE.Group(); root.name = `procedural-chef-${id}`; root.userData.species = mouse ? 'mouse' : 'crocodile';
  const hatMaterial = new THREE.MeshStandardMaterial({ color: outfitColor(DEFAULT_OUTFIT.hat).hex, vertexColors: true, roughness: .78 });
  const apronMaterial = new THREE.MeshStandardMaterial({ color: outfitColor(DEFAULT_OUTFIT.apron).hex, vertexColors: true, roughness: .78 });
  materials.set('hat-fabric', hatMaterial); materials.set('apron-fabric', apronMaterial);
  const body = joint(root, 'jacket');
  const apron = joint(body, 'apron-fabric');
  // Pear-shaped jacket, overlapping front panel, piping and double-breasted buttons.
  const profile = [[.0, .35], [.24, .35], [.36, .39], [.42, .53], [.415, .73], [.35, .97], [.24, 1.13], [0, 1.14]];
  const coat = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  geometries.add(coat); add(body, coat, colors.coat, [0, 0, 0], [1, 1, .86]);
  oval(body, colors.piping, [0, .47, .295], [.31, .095, .045]);
  oval(apron, '#FFFFFF', [0, .69, .295], [.33, .285, .07]);
  tube(body, colors.piping, [[.02, .49, .359], [.055, .72, .374], [.08, .92, .29]], .008);
  for (const x of [-.18, .2]) for (const y of [.55, .75, .94]) {
    oval(body, colors.ink, [x, y, y > .9 ? .27 : .356], [.032, .034, .02]);
    oval(body, colors.piping, [x - .007, y + .008, y > .9 ? .29 : .377], [.008, .008, .003]);
  }
  box(apron, '#FFFFFF', [0, .89, -.298], [.66, .07, .04]);
  for (const side of [-1, 1]) {
    box(body, colors.white, [side * .135, 1.065, .22], [.19, .2, .075], [0, 0, side * -.5]);
    oval(apron, '#FFFFFF', [side * .25, .44, -.24], [.06, .16, .035], [0, 0, side * .2]);
  }
  const scarf = joint(root, 'scarf', [0, 1.035, .295]);
  oval(scarf, colors.accent, [0, .01, 0], [.105, .085, .075]);
  oval(scarf, colors.accent, [-.085, -.1, .015], [.065, .15, .04], [0, 0, -.38]);
  oval(scarf, colors.accent, [.09, -.095, .01], [.07, .14, .045], [0, 0, .42]);
  const head = joint(root, 'head', [0, 1.39, .015]);
  oval(head, colors.skin, [0, 0, 0], mouse ? [.355, .345, .31] : [.36, .315, .33]);
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    if (mouse) {
      const ear = joint(head, `ear-${side}`, [side * .36, .15, -.015]); ears.push(ear);
      oval(ear, colors.dark, [0, 0, 0], [.255, .29, .105], [0, side * -.18, side * -.22]);
      oval(ear, colors.skin, [0, .006, .027], [.231, .266, .09], [0, side * -.18, side * -.22]);
      oval(ear, colors.pink, [0, .01, .085], [.184, .215, .035], [0, side * -.18, side * -.22]);
      oval(head, colors.light, [side * .112, -.115, .272], [.153, .117, .135]);
      oval(head, colors.pink, [side * .24, -.09, .238], [.065, .035, .012]);
      for (const y of [-.045, .005]) tube(head, colors.ink, [[side * .13, y - .1, .366], [side * .29, y - .09, .4], [side * .39, y - .035, .335]], .007);
    } else {
      oval(head, colors.skin, [side * .185, .16, .17], [.142, .19, .155]);
      oval(head, colors.dark, [side * .28, -.065, .195], [.065, .035, .018], [0, side * .6, -.3]);
    }
  }
  if (mouse) {
    oval(head, colors.ink, [0, -.064, .391], [.069, .048, .054]);
    oval(head, colors.white, [-.019, -.044, .43], [.021, .01, .008]);
    box(head, colors.white, [0, -.211, .34], [.08, .065, .06]);
    oval(head, colors.light, [-.065, .227, .234], [.105, .055, .033], [0, 0, -.35]);
    oval(head, colors.light, [.045, .221, .248], [.09, .047, .037], [0, 0, -.5]);
  } else {
    const jaw = joint(head, 'jaw', [0, -.145, .29]);
    oval(jaw, colors.light, [0, -.024, .12], [.275, .106, .295]);
    box(head, colors.skin, [0, -.046, .37], [.55, .205, .67]);
    oval(head, colors.skin, [0, .012, .6], [.282, .118, .17]);
    for (const side of [-1, 1]) {
      oval(head, colors.dark, [side * .163, .074, .658], [.041, .02, .032]);
      for (const z of [.31, .53]) {
        const tooth = new THREE.ConeGeometry(.036, .078, 10); geometries.add(tooth);
        add(head, tooth, colors.white, [side * .263, -.153, z], [1, 1, 1], [Math.PI, 0, 0]);
      }
    }
    for (const x of [-.13, 0, .13]) oval(head, colors.dark, [x, .02, -.29], [.044, .074, .033]);
  }
  const hat = joint(head, 'toque', [0, .3, -.035]);
  const hatFabric = joint(hat, 'hat-fabric');
  const brim = new THREE.CylinderGeometry(.302, .335, .23, 32); geometries.add(brim);
  add(hatFabric, brim, '#FFFFFF', [0, .105, 0]);
  const band = new THREE.CylinderGeometry(.333, .335, .046, 32); geometries.add(band);
  add(hat, band, colors.accent, [0, .008, 0]);
  oval(hatFabric, '#FFFFFF', [0, .31, 0], [.392, .237, .335]);
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * Math.PI * 2;
    oval(hatFabric, '#FFFFFF', [Math.sin(angle) * .225, .342 + (i === 0 ? .035 : 0), Math.cos(angle) * .155], [.202, .238, .205]);
  }
  oval(hatFabric, '#FFFFFF', [-.025, .45, .015], [.23, .153, .222]);
  oval(hat, colors.accent, [0, .11, .31], [.073, .073, .015]);
  oval(hat, '#F2B743', [0, .11, .326], [.03, .03, .009]);
  const legs = [-1, 1].map(side => {
    const leg = joint(root, `leg-${side}`, [side * .205, .37, 0]);
    oval(leg, colors.ink, [0, -.08, 0], [.135, .2, .135]);
    box(leg, colors.ink, [0, -.225, .075], [.285, .22, .405]);
    box(leg, colors.dark, [0, -.316, .077], [.287, .045, .406]);
    box(leg, colors.accent, [0, -.18, .252], [.12, .033, .019]);
    return leg;
  });
  // Only the sleeve shaft stretches. Independent round ends retain their radius
  // when IK reaches up to a board, rather than growing through the head/jacket.
  const sleeve = new THREE.CylinderGeometry(.11, .11, 1, 16);
  sleeve.translate(0, .5, 0); geometries.add(sleeve);
  const sleeveCap = (parent: THREE.Group, name: string, y: number, radius: number, color: string): void => {
    const cap = joint(parent, name, [0, y, 0]);
    cap.userData.sleeveCap = true;
    oval(cap, color, [0, 0, 0], [radius, radius, radius]);
  };
  const arms = [-1, 1].map(side => {
    const upper = joint(root, `upper-arm-${side}`);
    add(upper, sleeve, colors.coat, [0, 0, 0]);
    sleeveCap(upper, 'shoulder-cap', 0, .11, colors.coat);
    sleeveCap(upper, 'elbow-cap', 1, .11, colors.coat);
    const forearm = joint(root, `forearm-${side}`);
    add(forearm, sleeve, colors.coat, [0, 0, 0], [.91, .88, .91]);
    sleeveCap(forearm, 'forearm-cap', 0, .1, colors.coat);
    const cuff = joint(forearm, 'wrist-cuff', [0, .90, 0]);
    cuff.userData.sleeveCap = true;
    oval(cuff, colors.accent, [0, 0, 0], [.11, .04, .11]);
    const hand = joint(root, `hand-${side}`);
    oval(hand, colors.skin, [0, 0, 0], [.115, .105, .12]);
    oval(hand, colors.light, [side * -.085, -.012, .056], [.052, .06, .055]);
    for (let i = 0; i < 3; i++) oval(hand, colors.skin, [(i - 1) * .05, -.038, .075], [.032, .05, .07]);
    return { upper, forearm, hand };
  });
  const tail = joint(root, 'tail', [0, .5, -.24]);
  if (mouse) tube(tail, colors.pink, [[0, 0, 0], [.12, -.17, -.28], [.36, -.2, -.53], [.53, -.08, -.57], [.58, .08, -.51]], .03);
  else {
    oval(tail, colors.skin, [0, -.12, -.235], [.18, .145, .39], [.27, 0, 0]);
    oval(tail, colors.skin, [.09, -.19, -.48], [.11, .09, .24], [0, -.38, 0]);
    for (let i = 0; i < 3; i++) oval(tail, colors.dark, [0, -.005 - i * .035, -.08 - i * .15], [.045, .055, .075]);
  }
  const food = joint(root, 'food-socket', [0, 1.01, .72]);
  // Vertex colors allow one draw per joint, without merging away editable pivots.
  const painted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72 });
  materials.set('joint-paint', painted);
  const batch = (group: THREE.Group): void => {
    for (const child of [...group.children]) if (child instanceof THREE.Group) batch(child);
    const meshes = group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    if (meshes.length < 2) return;
    const parts = meshes.map(mesh => {
      mesh.updateMatrix();
      const original = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      const geo = original.index ? original.toNonIndexed() : original;
      if (geo !== original) original.dispose();
      const color = (mesh.material as THREE.MeshStandardMaterial).color;
      const rgb = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < rgb.length; i += 3) { rgb[i] = color.r; rgb[i + 1] = color.g; rgb[i + 2] = color.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
      return geo;
    });
    const merged = mergeGeometries(parts); parts.forEach(geo => geo.dispose());
    if (!merged) return;
    geometries.add(merged); meshes.forEach(mesh => group.remove(mesh));
    const fabric = group.name === 'hat-fabric' ? hatMaterial : group.name === 'apron-fabric' ? apronMaterial : undefined;
    const mesh = new THREE.Mesh(merged, fabric ?? painted); mesh.name = `${group.name}-mesh`;
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  };
  batch(root);
  const face = createChefFace(head, mouse);
  const setOutfit = (outfit: ChefOutfit): void => {
    // Tint dedicated materials, not shared vertex paint, so joints and facial morphs survive.
    if (root.userData.hatColor !== outfit.hat) { hatMaterial.color.set(outfitColor(outfit.hat).hex); root.userData.hatColor = outfit.hat; }
    if (root.userData.apronColor !== outfit.apron) { apronMaterial.color.set(outfitColor(outfit.apron).hex); root.userData.apronColor = outfit.apron; }
  };
  setOutfit(DEFAULT_OUTFIT);
  return { root, head, hat, eyes: face.eyes, face, ears, scarf, tail, legs, arms, food, setOutfit, dispose: () => { face.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}
