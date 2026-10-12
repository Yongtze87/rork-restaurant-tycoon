import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { chefShoulder, sampleChefPose, solveChefElbow, type JointPoint } from '@/game/chef-animation';
import { createChefLocomotion } from '@/game/chef-locomotion';
import { createChefRig } from '@/scene/chef-model';
import { createChefArmPoser } from '@/scene/chef-arm';

const restingPose = (id: number, gait = 0) => sampleChefPose({
  id, time: 0, motion: { ...createChefLocomotion(), gait }, held: null, action: 'idle', reduced: false,
});

describe('relaxed connected chef arms', () => {
  it.each([0, 1])('keeps chef %i elbows down and close to the jacket throughout the gait', id => {
    for (let gait = -1; gait <= 1; gait += .05) {
      const pose = restingPose(id, gait);
      [pose.right, pose.left].forEach((hand, i) => {
        const side = i === 0 ? -1 : 1;
        const shoulder = chefShoulder(side), elbow = solveChefElbow(shoulder, hand, side);
        expect(Math.abs(shoulder[0])).toBeLessThan(.33);
        expect(elbow[1]).toBeLessThan(shoulder[1] - .13);
        expect(elbow[1]).toBeGreaterThan(hand[1] + .10);
        expect(Math.abs(elbow[0])).toBeLessThan(.55);
        expect(hand[1]).toBeLessThan(.62);
      });
    }
  });

  it.each([0, 1])('covers both ends of chef %i upper sleeves without pointed gaps', id => {
    const rig = createChefRig(id);
    try {
      for (const arm of rig.arms) {
        const mesh = arm.upper.children[0] as THREE.Mesh;
        mesh.updateMatrixWorld(true);
        // Cast across each joint's cross-section, not just the overall bounding box.
        for (const y of [0, 1]) {
          const ray = new THREE.Raycaster(new THREE.Vector3(.3, y, 0), new THREE.Vector3(-1, 0, 0));
          const hit = ray.intersectObject(mesh, false)[0];
          expect(hit).toBeDefined();
          expect(hit.point.x).toBeGreaterThan(.10);
          expect(hit.point.x).toBeLessThan(.12);
        }
      }
    } finally { rig.dispose(); }
  });

  it.each([0, 1])('poses connected segments for chef %i while preserving exact hand targets', id => {
    const rig = createChefRig(id), poseArm = createChefArmPoser();
    try {
      const idle = restingPose(id);
      const targets: JointPoint[][] = [
        [idle.right, idle.left], // Idle and wardrobe.
        [[-.3, 1.01, .72], [.3, 1.01, .72]], // Carry socket.
        [[-.25, 1.7, 1.2], [.3, 1.4, .9]], // Actual knife/board reach.
        [[-.22, 1.4, .85], [.22, 1.4, .85]], // Sink.
        [[-.3, 1.01, .72], [.12, 1.24, .8]], // Extinguisher.
        [[-.61, 1.70, .13], [.61, 1.46, .13]], // Celebration.
      ];
      const geometry = rig.arms.map(arm => (arm.upper.children[0] as THREE.Mesh).geometry);
      for (const hands of targets) {
        rig.arms.forEach((arm, i) => {
          poseArm(arm, i === 0 ? -1 : 1, hands[i]);
          rig.root.updateMatrixWorld(true);
          const elbow = arm.upper.localToWorld(new THREE.Vector3(0, 1, 0));
          const wrist = arm.forearm.localToWorld(new THREE.Vector3(0, 1, 0));
          expect(elbow.distanceTo(arm.forearm.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-9);
          expect(wrist.distanceTo(arm.hand.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-9);
          expect(arm.hand.position.toArray()).toEqual(hands[i]);
          expect(arm.upper.quaternion.toArray().every(Number.isFinite)).toBe(true);
          expect((arm.upper.children[0] as THREE.Mesh).geometry).toBe(geometry[i]);
          expect(arm.upper.scale.x).toBe(1); expect(arm.upper.scale.z).toBe(1);
        });
      }
    } finally { rig.dispose(); }
  });

  it.each([0, 1])('keeps chef %i sleeve ends round instead of stretching through the head during chopping', id => {
    const rig = createChefRig(id), poseArm = createChefArmPoser();
    try {
      for (const height of [1.5, 1.7, 2.1]) {
        rig.arms.forEach((arm, i) => {
          poseArm(arm, i ? 1 : -1, [i ? .2 : -.2, height, .9]);
          rig.root.updateMatrixWorld(true);
          for (const segment of [arm.upper, arm.forearm]) {
            for (const cap of segment.children.filter(child => child.userData.sleeveCap)) {
              const scale = cap.getWorldScale(new THREE.Vector3());
              expect(scale.x).toBeCloseTo(1); expect(scale.y).toBeCloseTo(1); expect(scale.z).toBeCloseTo(1);
            }
          }
          const sleeve = arm.upper.children[0] as THREE.Mesh;
          sleeve.geometry.computeBoundingBox();
          expect(sleeve.geometry.boundingBox!.min.y).toBe(0);
          expect(sleeve.geometry.boundingBox!.max.y).toBe(1);
        });
      }
    } finally { rig.dispose(); }
  });

  it('does not share arm transforms between players or drift at a frozen pose', () => {
    const first = createChefRig(0), second = createChefRig(1);
    const poseFirst = createChefArmPoser(), poseSecond = createChefArmPoser();
    try {
      const idle = restingPose(1);
      poseSecond(second.arms[0], -1, idle.right);
      second.arms[0].upper.updateMatrix();
      const snapshot = second.arms[0].upper.matrix.clone();
      poseFirst(first.arms[0], -1, [-.3, 1.6, 1]);
      poseSecond(second.arms[0], -1, idle.right); second.arms[0].upper.updateMatrix();
      expect(second.arms[0].upper.matrix.equals(snapshot)).toBe(true);
      expect(second.arms[0].hand.position.toArray()).toEqual(idle.right);
    } finally { first.dispose(); second.dispose(); }
  });
});
