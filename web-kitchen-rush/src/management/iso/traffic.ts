import { PARCEL, roadSet, type Town } from '../town';

/**
 * Town life: bubble-carts drive along the roads and Mareen folk stroll beside them. Purely visual; nothing here
 * touches the save or the business. Agents keep their state between frames and are rebuilt when the roads change.
 */
export interface Agent { kind: 'cart' | 'walker'; x: number; z: number; tx: number; tz: number; px: number; pz: number; t: number; speed: number; color: number; side: number; steps: number; seed: number }
interface Traffic { roads: string[]; agents: Agent[]; last: number }
const towns = new WeakMap<Town, Traffic>();
export const CART_COLORS = ['#F2A65A', '#4DF0FF', '#E26B9C', '#A57BFF', '#FFE27A', '#7FD8A8'];
export const WALKER_COLORS = ['#F0A58C', '#E9D2B5', '#9AD0F5', '#C6A8FF', '#FFD08A', '#8FD9C5'];
const rand = (seed: number, n: number) => { const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Pick the next road tile: onward if possible, never straight back unless it is a dead end. */
function next(a: Agent, roads: Set<string>): void {
  const options = DIRS.map(([dx, dz]) => [a.x + dx, a.z + dz] as const).filter(([x, z]) => roads.has(`${x},${z}`) && !(x === a.px && z === a.pz));
  const list = options.length ? options : roads.has(`${a.px},${a.pz}`) ? [[a.px, a.pz] as const] : [];
  a.steps++;
  if (!list.length) { a.tx = a.x; a.tz = a.z; return; }
  const [tx, tz] = list[Math.floor(rand(a.seed, a.steps) * list.length)];
  a.tx = tx; a.tz = tz;
}

/** Move everyone on; returns the agents to draw. `time` is seconds; reduced motion keeps them still. */
export function stepTraffic(town: Town, time: number, reduced: boolean): Agent[] {
  let traffic = towns.get(town);
  if (!traffic || traffic.roads !== town.roads) {
    const keys = town.roads, homes = town.buildings.filter(b => b.kind === 'homes').length;
    const carts = Math.min(28, Math.floor(keys.length / 7)), walkers = Math.min(40, Math.floor(keys.length / 6) + homes * 2), agents: Agent[] = [];
    for (let i = 0; i < carts + walkers && keys.length; i++) {
      const [x, z] = keys[Math.floor(rand(i + 1, 1) * keys.length)].split(',').map(Number), cart = i < carts;
      const a: Agent = { kind: cart ? 'cart' : 'walker', x, z, tx: x, tz: z, px: NaN, pz: NaN, t: rand(i + 1, 2), speed: cart ? .9 + rand(i + 1, 3) * .5 : .28 + rand(i + 1, 4) * .14, color: Math.floor(rand(i + 1, 5) * 6), side: rand(i + 1, 6) < .5 ? 1 : -1, steps: 0, seed: i + 1 };
      next(a, roadSet(town)); agents.push(a);
    }
    traffic = { roads: keys, agents, last: time }; towns.set(town, traffic);
  }
  const dt = reduced ? 0 : Math.min(.25, Math.max(0, time - traffic.last)), roads = roadSet(town); traffic.last = time;
  for (const a of traffic.agents) {
    a.t += dt * a.speed;
    while (a.t >= 1) { a.t -= 1; a.px = a.x; a.pz = a.z; a.x = a.tx; a.z = a.tz; next(a, roads); }
  }
  return traffic.agents;
}

/** Where an agent stands, on the plot grid the view uses, and which way it faces (in tiles). Carts keep to one lane, walkers to the road edge. */
export function placeAgent(a: Agent): { x: number; z: number; dx: number; dz: number } {
  const dx = a.tx - a.x, dz = a.tz - a.z, offset = (a.kind === 'cart' ? .17 : .38) * a.side;
  // Right-hand lane: offset perpendicular to the heading.
  const ox = a.kind === 'cart' ? -dz * offset : (dz !== 0 ? offset : 0), oz = a.kind === 'cart' ? dx * offset : (dx !== 0 ? offset : 0);
  const tx = a.x + dx * a.t + .5 + ox, tz = a.z + dz * a.t + .5 + oz;
  return { x: tx / PARCEL - .5, z: tz / PARCEL - .5, dx, dz };
}
