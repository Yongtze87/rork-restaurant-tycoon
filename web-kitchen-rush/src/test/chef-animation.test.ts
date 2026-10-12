import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { sampleChefPose, solveChefElbow, type ChefPoseInput, type JointPoint } from '@/game/chef-animation';
import { createChefRig } from '@/scene/chef-model';
import { createChefLocomotion } from '@/game/chef-locomotion';

const idle: ChefPoseInput = { time: 1, id: 0, motion: createChefLocomotion(), held: null, action: 'idle', reduced: false };
const walking = { ...createChefLocomotion(), stride: 1, gait: Math.sin(1), gaitPhase: 1 };
const dashing = { ...walking, gait: Math.sin(2), gaitPhase: 2, dashBlend: 1 };
describe('code-driven chef poses', () => {
  it('shares the continuous locomotion gait across limbs and dash accents', () => {
    const walk = sampleChefPose({ ...idle, motion: walking });
    const dash = sampleChefPose({ ...idle, motion: dashing });
    expect(walk.legLeft).toBe(-walk.legRight); expect(walk.legLeft).not.toBe(0);
    expect(walk.gait).not.toBe(dash.gait); expect(dash.scarfX).toBeGreaterThan(.45);
  });
  it('keeps a stable two-hand carry target during walking and dashing', () => {
    const held = { kind: 'plate', parts: [] } as const;
    const one = sampleChefPose({ ...idle, held: { ...held, parts: [] }, motion: walking });
    const two = sampleChefPose({ ...idle, held: { ...held, parts: [] }, motion: dashing, time: 8 });
    expect(one.right).toEqual(two.right); expect(one.left).toEqual(two.left);
    expect(one.right[0]).toBe(-one.left[0]);
  });
  it('is deterministic at a paused simulation time', () => {
    const input = { ...idle, action: 'wash' as const, motion: walking, time: 3.42 };
    expect(sampleChefPose(input)).toEqual(sampleChefPose(input));
  });
  it('removes secondary motion live without removing recognizable action poses', () => {
    const a = sampleChefPose({ ...idle, time: 1, reduced: true, motion: dashing, action: 'celebrate' });
    const b = sampleChefPose({ ...idle, time: 7.3, reduced: true, motion: dashing, action: 'celebrate' });
    expect(a).toEqual(b); expect(a.right[1]).toBeGreaterThan(1.5);
    expect([a.gait, a.hatZ, a.earZ, a.tailY, a.scarfX]).toEqual([0, 0, 0, 0, 0]);
  });
  it('looks down at work without replacing walking or hand controls', () => {
    expect(sampleChefPose({ ...idle, action: 'chop' }).headX).toBeGreaterThan(0);
    expect(sampleChefPose({ ...idle, action: 'wash' }).headX).toBeGreaterThan(0);
  });
});

describe('two-bone arm solving', () => {
  it.each<JointPoint>([[0, 1.7, 1], [-.5, .7, .1], [0, 2, 1.6], [-.35, 1.015, 0]])('keeps elbow finite for target %j', (x, y, z) => {
    const shoulder: JointPoint = [-.35, 1.015, 0], hand: JointPoint = [x, y, z];
    const elbow = solveChefElbow(shoulder, hand, -1);
    expect(elbow.every(Number.isFinite)).toBe(true);
    expect(new THREE.Vector3(...elbow).distanceTo(new THREE.Vector3(...shoulder))).toBeCloseTo(new THREE.Vector3(...elbow).distanceTo(new THREE.Vector3(...hand)), 3);
  });
  it('bends elbows outward, with mirrored independent arms', () => {
    const left = solveChefElbow([-.35, 1.015, 0], [-.5, .7, .1], -1);
    const right = solveChefElbow([.35, 1.015, 0], [.5, .7, .1], 1);
    expect(left[0]).toBeLessThan(-.35); expect(right[0]).toBeGreaterThan(.35);
    expect(left[0]).toBeCloseTo(-right[0]);
  });
});

describe('self-contained animal geometry', () => {
  it.each([0, 1])('constructs chef %i without clips, textures, or skeleton downloads', id => {
    const rig = createChefRig(id);
    try {
      expect(rig.root.userData.species).toBe(id === 0 ? 'crocodile' : 'mouse');
      expect(rig.root.animations).toEqual([]); expect(rig.arms).toHaveLength(2); expect(rig.legs).toHaveLength(2);
      expect(rig.root.getObjectByName('food-socket')).toBe(rig.food);
      const bounds = new THREE.Box3().setFromObject(rig.root);
      expect(bounds.max.y).toBeGreaterThan(2); expect(bounds.max.y).toBeLessThan(2.5);
      let triangles = 0;
      rig.root.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        expect((node as THREE.SkinnedMesh).isSkinnedMesh).not.toBe(true);
        triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
        expect((node.material as THREE.MeshStandardMaterial).map).toBeNull();
      });
      expect(triangles).toBeLessThan(90000);
    } finally { rig.dispose(); }
  });
  it('does not share mutable joints or resources between the two players', () => {
    const first = createChefRig(0), second = createChefRig(1);
    try { first.arms[0].hand.position.x = 3; expect(second.arms[0].hand.position.x).toBe(0); expect(first.head).not.toBe(second.head); }
    finally { first.dispose(); second.dispose(); }
  });
});
