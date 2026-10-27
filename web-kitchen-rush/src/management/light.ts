import { DAY_LENGTH, type RestaurantState } from './types';

/** Visual only: how dark the evening is, 0 until 19:00, rising smoothly to 1 at 21:30. */
export function nightLevel(elapsed: number): number {
  const hour = 17 + Math.max(0, elapsed) / DAY_LENGTH * 5, k = Math.min(1, Math.max(0, (hour - 19) / 2.5));
  return k * k * (3 - 2 * k);
}
/** Planning shows dusk at 17:00; service darkens with the clock. */
export const sceneNight = (state: Pick<RestaurantState, 'phase' | 'elapsed'>): number => state.phase === 'service' ? nightLevel(state.elapsed) : 0;
