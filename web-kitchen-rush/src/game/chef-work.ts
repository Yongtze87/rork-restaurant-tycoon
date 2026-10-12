import type { JointPoint } from './chef-animation';

/** Short simulation-time ease into/out of work; continuous strokes remain exact IK. */
export interface ChefWorkBlend {
  key: string; startedAt: number; time: number; from: [JointPoint, JointPoint]; hands: [JointPoint, JointPoint];
}
const copyHands = (hands: readonly JointPoint[]): [JointPoint, JointPoint] => [[...hands[0]], [...hands[1]]];
/** Reset on chef identity/phase changes so a new shift cannot inherit a work pose. */
export function createChefWorkBlend(hands: readonly JointPoint[], time: number): ChefWorkBlend {
  return { key: '', startedAt: time - 1, time, from: copyHands(hands), hands: copyHands(hands) };
}
/** Blend only the transition, not the cutting cycle, to avoid lagging behind the blade. */
export function blendChefWork(state: ChefWorkBlend, target: readonly JointPoint[], key: string, time: number, reduced: boolean): [JointPoint, JointPoint] {
  if (time < state.time) Object.assign(state, createChefWorkBlend(target, time));
  if (key !== state.key) {
    state.from = copyHands(state.hands); state.startedAt = time; state.key = key;
  }
  state.time = time;
  const t = reduced ? 1 : Math.min(1, Math.max(0, (time - state.startedAt) / (key ? .14 : .16)));
  if (t >= 1) { state.hands = copyHands(target); return state.hands; }
  const ease = t * t * (3 - 2 * t);
  state.hands = target.map((hand, i) => hand.map((v, axis) => state.from[i][axis] + (v - state.from[i][axis]) * ease) as JointPoint) as [JointPoint, JointPoint];
  return state.hands;
}
