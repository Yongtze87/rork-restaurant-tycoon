import type { ChefActionEffect, Ingredient } from './types';

/** Short, simulation-timed feedback; the fixed cap also bounds GPU instance buffers. */
export const ACTION_EFFECT_LIFETIME = { place: .65, wash: 1.05, chop: .34 } as const;
export const MAX_ACTION_EFFECTS = 8;
export const PARTICLES_PER_ACTION = 16;

const INGREDIENT_COLORS: Record<Ingredient, string> = {
  lettuce: '#3B9C98', tomato: '#DC533C', patty: '#B76544', bun: '#F2B743',
};
const PLACE_POSES = [[0, 1], [.065, .8], [.16, 1.16], [.3, .97], [.42, 1]] as const;
const WASH_POSES = [[0, 1], [.085, .76], [.22, 1.22], [.4, .94], [.6, 1]] as const;

/** Latest successful action belonging to this chef, never another co-op player's. */
export function latestChefAction(effects: readonly ChefActionEffect[], chefId: number): ChefActionEffect | undefined {
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].chefId === chefId) return effects[i];
}

/** Feet-anchored, volume-preserving deformation sampled without wall-clock timers. */
export function sampleChefAction(effect: ChefActionEffect | undefined, elapsed: number, reducedMotion: boolean): { width: number; height: number; lift: number } {
  const neutral = { width: 1, height: 1, lift: 0 };
  if (!effect || reducedMotion || effect.kind === 'chop') return neutral;
  const age = elapsed - effect.startedAt;
  const poses = effect.kind === 'place' ? PLACE_POSES : WASH_POSES;
  if (age <= 0 || age >= poses[poses.length - 1][0]) return neutral;
  for (let i = 1; i < poses.length; i++) {
    const [endTime, endHeight] = poses[i];
    if (age > endTime) continue;
    const [startTime, startHeight] = poses[i - 1];
    const t = (age - startTime) / (endTime - startTime);
    const height = startHeight + (endHeight - startHeight) * t * t * (3 - 2 * t);
    const hop = effect.kind === 'wash' && age > .1 && age < .4 ? Math.sin((age - .1) / .3 * Math.PI) * .13 : 0;
    return { width: 1 / Math.sqrt(height), height, lift: hop };
  }
  return neutral;
}

/** A particle sample is mapped onto one of three shared instanced meshes. */
export interface ActionParticle {
  shape: 'seasoning' | 'bubble' | 'sparkle';
  x: number; y: number; z: number;
  size: number; angle: number; color: string;
}

/** Deterministic trajectories make pause/resume exact and avoid per-frame random flicker. */
export function sampleActionParticle(effect: ChefActionEffect, index: number, elapsed: number): ActionParticle | null {
  const age = elapsed - effect.startedAt;
  if (effect.kind === 'chop') {
    if (index >= 7 || age < 0 || age >= ACTION_EFFECT_LIFETIME.chop) return null;
    const t = age / ACTION_EFFECT_LIFETIME.chop;
    const angle = index * 2.39996 + effect.id * .73;
    const radius = .04 + t * (.16 + index % 3 * .045);
    return {
      shape: 'seasoning', x: effect.x + Math.cos(angle) * radius,
      y: 1.53 + Math.sin(t * Math.PI) * (.12 + index % 3 * .035),
      z: effect.z + Math.sin(angle) * radius,
      size: (.032 + index % 2 * .012) * Math.min(1, (1 - t) * 4),
      angle: angle + t * 3,
      color: effect.ingredient === 'tomato' ? (index % 3 ? '#DC533C' : '#FFF2D7') : (index % 2 ? '#76a63e' : '#b8ce6d'),
    };
  }
  const delay = index >= 12 ? .08 : (index % 3) * .018;
  const lifetime = ACTION_EFFECT_LIFETIME[effect.kind] - delay;
  const t = (age - delay) / lifetime;
  if (t < 0 || t >= 1) return null;
  const wash = effect.kind === 'wash';
  const sparkle = index >= 12;
  const angle = index * 2.39996 + effect.id * .73;
  const spread = .72 + (index % 4) * .09;
  const radius = wash ? .22 + t * spread * .55 : .12 + t * spread;
  const envelope = Math.min(1, t / .09) * Math.min(1, (1 - t) / .35);
  const size = (sparkle ? .11 : wash ? .085 + (index % 3) * .025 : .075) * envelope;
  const color = wash ? (sparkle ? '#FFF2D7' : index % 2 ? '#B7E5EF' : '#3B9C98')
    : sparkle || index % 3 === 0 ? '#F2B743' : index % 3 === 1 ? '#FFF2D7' : INGREDIENT_COLORS[effect.ingredient ?? 'lettuce'];
  return {
    shape: sparkle ? 'sparkle' : wash ? 'bubble' : 'seasoning',
    x: effect.x + Math.cos(angle) * radius,
    y: 1.65 + (wash ? t * (1.05 + (index % 3) * .12) : Math.sin(t * Math.PI) * (.5 + (index % 3) * .12)),
    z: effect.z + Math.sin(angle) * radius,
    size, angle: angle + t * (wash ? .6 : 4), color,
  };
}
