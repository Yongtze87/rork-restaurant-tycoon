import * as THREE from 'three';
import { chefShoulder, solveChefElbow, type JointPoint } from '@/game/chef-animation';
import type { ChefRig } from './chef-model';

/** Shared sleeve and hand placement for live chefs and wardrobe portraits. */
export function createChefArmPoser() {
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const segment = (joint: THREE.Group, from: JointPoint, to: JointPoint): void => {
    direction.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    joint.position.set(...from);
    const length = Math.max(.0001, direction.length());
    joint.scale.set(1, length, 1);
    for (const child of joint.children) if (child.userData.sleeveCap) child.scale.y = 1 / length;
    joint.quaternion.setFromUnitVectors(up, direction.normalize());
  };
  return (arm: ChefRig['arms'][number], side: number, hand: JointPoint, wristPitch = 0): void => {
    const shoulder = chefShoulder(side);
    const elbow = solveChefElbow(shoulder, hand, side);
    segment(arm.upper, shoulder, elbow);
    segment(arm.forearm, elbow, hand);
    arm.hand.position.set(...hand);
    arm.hand.rotation.set(wristPitch, 0, side * -.12);
  };
}
