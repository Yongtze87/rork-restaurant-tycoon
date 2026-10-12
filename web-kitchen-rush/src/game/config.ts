import type { Item, Mode, Recipe, Shift, Station, StationKind } from './types';

/** Patty cooking duration, shared by the simulation and station countdown. */
export const GRILL_COOK_SECONDS = 5;

/** Movement tuning in rooftop units and simulation seconds; recharge starts on activation. */
export const CHEF_WALK_SPEED = 3.8;
export const CHEF_DASH_SPEED = 10;
export const DASH_DURATION_SECONDS = .24;
export const DASH_COOLDOWN_SECONDS = 3;

/** Keep queues readable; extra diners wait for an available order slot. */
export const MAX_ACTIVE_ORDERS = 4;

/** A gentler first shift, then faster arrivals and shorter waits in both modes. */
export const SHIFTS: Shift[] = [
  {
    name: 'Golden Hour', subtitle: 'A little sunshine. A little chaos.', description: 'Room to breathe. Time to find your rhythm.', thresholds: [300, 500, 700],
    service: { solo: { arrivalSeconds: 28, patienceSeconds: 110 }, coop: { arrivalSeconds: 20, patienceSeconds: 85 } },
  },
  {
    name: 'Dinner Rush', subtitle: 'A tighter kitchen. A bigger rush.', description: 'Split prep islands and a faster dinner crowd.', thresholds: [400, 650, 900],
    service: { solo: { arrivalSeconds: 22, patienceSeconds: 90 }, coop: { arrivalSeconds: 16, patienceSeconds: 70 } },
  },
  {
    name: 'Last Call', subtitle: 'One rooftop. All the pressure.', description: 'Narrow lanes, impatient guests, your finest service.', thresholds: [500, 800, 1100],
    service: { solo: { arrivalSeconds: 17, patienceSeconds: 70 }, coop: { arrivalSeconds: 12, patienceSeconds: 55 } },
  },
];
export const RECIPES: Record<Recipe, { name: string; parts: string[]; points: number }> = {
  salad: { name: 'Garden salad', parts: ['lettuce:chopped', 'tomato:chopped'], points: 50 },
  burger: { name: 'Rooftop burger', parts: ['lettuce:chopped', 'tomato:chopped', 'patty:cooked', 'bun:raw'], points: 80 },
};
export const LABELS: Record<StationKind, string> = { lettuce: 'Lettuce', tomato: 'Tomato', patty: 'Patties', bun: 'Buns', board: 'Chop', grill: 'Grill', sink: 'Wash', plates: 'Clean plates', counter: 'Prep', serve: 'Serve here', dirty: 'Dirty plates', trash: 'Discard', extinguisher: 'Extinguisher' };
export const PRACTICE_STEPS = [
  'Take lettuce from the front crate. Move with WASD, then press E nearby.',
  'Place lettuce on a chopping board with E. Hold F to chop it.',
  'Pick up chopped lettuce. Put it on an empty prep counter for now.',
  'Take a clean plate at the back right. E combines a plate with chopped food.',
  'Chop a tomato too, then add it to your lettuce plate with E.',
  'Carry the finished salad to the right serving hatch. Press E to serve!',
  'Great service! Dirty plates return on the right. Place one in the sink and hold F.',
  'You’re ready! Try a burger, or exit practice and start a timed shift.',
];
/** Score targets are lower in solo without changing recipe or scoring rules. */
export function targets(level: number, mode: Mode): number[] { return SHIFTS[level].thresholds.map(n => mode === 'solo' ? Math.round(n * .6) : n); }
export function starsFor(score: number, level: number, mode: Mode): number { return targets(level, mode).filter(n => score >= n).length; }
export function recipeFor(item: Item | null): Recipe | null {
  if (item?.kind !== 'plate') return null;
  return (Object.keys(RECIPES) as Recipe[]).find(recipe => RECIPES[recipe].parts.length === item.parts.length && RECIPES[recipe].parts.every(p => item.parts.includes(p))) ?? null;
}
export function itemLabel(item: Item | null): string {
  if (!item) return 'Empty hands';
  if (item.kind === 'plate') return recipeFor(item) ? RECIPES[recipeFor(item)!].name : item.parts.length ? `Plate: ${item.parts.map(p => p.split(':')[0]).join(' + ')}` : 'Clean plate';
  if (item.kind === 'dirty') return 'Dirty plate';
  if (item.kind === 'extinguisher') return 'Extinguisher';
  return `${item.state === 'raw' ? '' : `${item.state} `}${item.kind}`;
}
/** Layouts share a legible perimeter and vary their central prep islands. */
export function makeStations(level: number): Station[] {
  const stations: Station[] = [];
  const add = (kind: StationKind, x: number, z: number) => stations.push({ id: `${kind}-${stations.length}`, kind, x, z, item: null, progress: 0, heat: 0, fire: 0 });
  add('counter', -4.8, -3.2); add('grill', -3.2, -3.2); add('grill', -1.6, -3.2);
  add('counter', 0, -3.2); add('counter', 1.6, -3.2); add('sink', 3.2, -3.2); add('plates', 4.8, -3.2);
  add('extinguisher', -6.4, -1.6); add('counter', -6.4, 0); add('trash', -6.4, 1.6);
  add('counter', 6.4, -1.6); add('serve', 6.4, 0); add('dirty', 6.4, 1.6);
  add('lettuce', -4.8, 3.2); add('tomato', -3.2, 3.2); add('patty', -1.6, 3.2); add('bun', 0, 3.2);
  add('counter', 1.6, 3.2); add('counter', 3.2, 3.2); add('counter', 4.8, 3.2);
  if (level === 0) { add('board', -1.6, .2); add('counter', 0, .2); add('board', 1.6, .2); }
  if (level === 1) { add('board', -2.4, 0); add('counter', -2.4, 1.6); add('board', 2.4, 0); add('counter', 2.4, 1.6); }
  if (level === 2) { add('board', -3.2, 0); add('counter', -1.6, 0); add('counter', 1.6, 0); add('board', 3.2, 0); add('counter', 0, -1.6); }
  return stations;
}
