/**
 * Decorative ocean life in normalized screen space (0..1), so it survives resizes.
 * Purely visual: it never reads or changes the restaurant simulation.
 */
export interface Bubble { x: number; y: number; r: number; speed: number; phase: number; }
export interface Mote { x: number; y: number; size: number; drift: number; }
export interface School { x: number; y: number; speed: number; count: number; size: number; }
export interface Ambience { time: number; seed: number; bubbles: Bubble[]; motes: Mote[]; schools: School[]; }

const next = (a: Ambience): number => { a.seed = (Math.imul(a.seed, 1664525) + 1013904223) >>> 0; return a.seed / 4294967296; };

export const BUBBLES = 28, MOTES = 46, SCHOOLS = 3;

export function createAmbience(seed = 4242): Ambience {
  const a: Ambience = { time: 0, seed, bubbles: [], motes: [], schools: [] };
  for (let i = 0; i < BUBBLES; i++) a.bubbles.push({ x: next(a), y: next(a), r: 1.5 + next(a) * 3.5, speed: .03 + next(a) * .05, phase: next(a) * 6.28 });
  for (let i = 0; i < MOTES; i++) a.motes.push({ x: next(a), y: next(a), size: .6 + next(a) * 1.4, drift: (next(a) - .5) * .01 });
  for (let i = 0; i < SCHOOLS; i++) a.schools.push({ x: next(a), y: .12 + next(a) * .3, speed: (.012 + next(a) * .02) * (i % 2 ? -1 : 1), count: 4 + Math.floor(next(a) * 5), size: 4 + next(a) * 4 });
  return a;
}

/** Advance by dt seconds. Anything leaving the screen wraps around to re-enter from the other side. */
export function stepAmbience(a: Ambience, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .1); a.time += dt;
  for (const b of a.bubbles) { b.y -= b.speed * dt; if (b.y < -.03) { b.y = 1.03; b.x = next(a); } }
  for (const m of a.motes) { m.y += .004 * dt; m.x += m.drift * dt; if (m.y > 1.02) m.y = -.02; if (m.x < -.02) m.x = 1.02; else if (m.x > 1.02) m.x = -.02; }
  for (const s of a.schools) { s.x += s.speed * dt; if (s.x > 1.15) s.x = -.15; else if (s.x < -.15) s.x = 1.15; }
}
