import { z } from 'zod';
import type { Validated } from './town';

/**
 * The Ocean: an endless grid of regions around the Home Reef at (0, 0). Each colony lives in one region.
 * The first ring is hand-designed; every other region is generated from its coordinates by a pure hash,
 * so the map is the same every time and never runs out. Balance for regions and fame lives here.
 * Pure: the engine applies `colonyEffects` the same way it applies tides and town effects.
 */
export const BIOME_IDS = ['home', 'kelp', 'vents', 'ice', 'atoll', 'sunken', 'trench', 'lagoon'] as const;
export type BiomeId = typeof BIOME_IDS[number];

/** Multipliers, 1 = neutral. Arrival, patience, crew speed and tips above 1 help; costs below 1 help. */
export interface RegionModifiers { arrival: number; patience: number; crewSpeed: number; tips: number; kelpCost: number; fishCost: number; buildCost: number; }
export type ModifierKey = keyof RegionModifiers;
export const NEUTRAL_MODIFIERS: RegionModifiers = { arrival: 1, patience: 1, crewSpeed: 1, tips: 1, kelpCost: 1, fishCost: 1, buildCost: 1 };
/** For costs a smaller multiplier is the good direction. */
const LOWER_IS_BETTER: Record<ModifierKey, boolean> = { arrival: false, patience: false, crewSpeed: false, tips: false, kelpCost: true, fishCost: true, buildCost: true };

export interface BiomeInfo {
  name: string; description: string;
  /** Good effects at 1★, as signed changes in the helpful direction (0.2 on kelpCost = kelp 20% cheaper). */
  up: Partial<RegionModifiers>;
  /** Bad effects at difficulty 1, scaled up with difficulty (see `severity`). */
  down: Partial<RegionModifiers>;
  /** Fame multiplier and generation weight; `shift` moves difficulty for this biome. */
  fame: number; weight: number; shift: number;
  /** Words for generated names. */
  words: [string[], string[]];
}
export const BIOMES: Record<BiomeId, BiomeInfo> = {
  home: { name: 'Home reef', description: 'Where your story began.', up: {}, down: {}, fame: 2.5, weight: 0, shift: 0, words: [['Home'], ['Reef']] },
  kelp: { name: 'Kelp forest', description: 'Tall swaying kelp. Cheap greens, but crew squeeze through the stalks.', up: { kelpCost: .2 }, down: { crewSpeed: .06 }, fame: 1, weight: 3, shift: 0, words: [['Swaying', 'Green', 'Tangle', 'Mossy', 'Whisper'], ['Hollow', 'Wood', 'Stalks', 'Thicket', 'Glade']] },
  vents: { name: 'Volcanic vents', description: 'Warm smoking vents. Fish gather in the heat, guests get restless.', up: { fishCost: .2 }, down: { patience: .08 }, fame: 1, weight: 3, shift: 0, words: [['Ember', 'Cinder', 'Smoke', 'Ash', 'Sulphur'], ['Vents', 'Chimneys', 'Field', 'Rise', 'Furnace']] },
  ice: { name: 'Ice shelf', description: 'Cold water under the ice. Grateful guests tip well; crew move slowly.', up: { tips: .15 }, down: { crewSpeed: .08 }, fame: 1, weight: 3, shift: 0, words: [['Frost', 'Glacier', 'Pale', 'Snowfall', 'Crystal'], ['Shelf', 'Ledge', 'Floe', 'Cap', 'Drift']] },
  atoll: { name: 'Coral atoll', description: 'A bright ring of coral full of visitors. Building on coral costs more.', up: { arrival: .1 }, down: { buildCost: .12 }, fame: 1, weight: 3, shift: 0, words: [['Sunburst', 'Bright', 'Ring', 'Rainbow', 'Lucky'], ['Atoll', 'Isle', 'Crown', 'Shoals', 'Garden']] },
  sunken: { name: 'Sunken city', description: 'Old ruins to build on, cheaply. Few guests find their way here.', up: { buildCost: .12 }, down: { arrival: .06 }, fame: 1.1, weight: 2, shift: .3, words: [['Drowned', 'Old', 'Pillar', 'Silent', 'Gilded'], ['Spires', 'Ruins', 'Halls', 'Steps', 'Gate']] },
  trench: { name: 'Open trench', description: 'The edge of the deep. Hard going, but daring diners pay well and fame is greater.', up: { tips: .08 }, down: { patience: .06, arrival: .05 }, fame: 1.4, weight: 2, shift: .5, words: [['Blue', 'Deep', 'Night', 'Hollow', 'Long'], ['Trench', 'Fall', 'Chasm', 'Drop', 'Rift']] },
  lagoon: { name: 'Calm lagoon', description: 'Sheltered and gentle: patient guests and an easy rest, with smaller rewards.', up: { patience: .08 }, down: { tips: .05 }, fame: .5, weight: 1.5, shift: -1, words: [['Glass', 'Still', 'Quiet', 'Soft', 'Mirror'], ['Water', 'Pool', 'Bay', 'Cove', 'Shallows']] },
};
export const VISITABLE_BIOMES = BIOME_IDS.filter(id => id !== 'home');

/** Balance knobs for regions and fame. */
export const OCEAN_BALANCE = {
  /** Generated difficulty: base + perRing × ring ± jitter/2. */
  base: .8, perRing: .6, jitter: 1.6,
  /** Every region past the Home Reef: build costs and fewer guests grow with difficulty (up to `cap`), unless that is the biome's upside. */
  buildPerLevel: .06, arrivalPerLevel: .03, cap: 6,
  /** Fame reward = fameBase × difficulty ^ fameExponent × biome fame. Grows faster than difficulty. */
  fameBase: 12, fameExponent: 1.5,
  /** No single multiplier strays further than this from neutral. */
  clampLow: .7, clampHigh: 1.4,
} as const;

/**
 * Permanent fame bonuses. Each approaches its cap (bonus = cap × fame / (fame + scale)): every fame point helps,
 * a little less than the one before, and no bonus ever passes its cap.
 * `tips` is an extra share of every bill paid as tips; `build` makes plots, buildings, upgrades and zones cheaper; `arrival` brings guests more often.
 */
export const FAME_BONUS = { scale: 25, tips: .25, build: .35, arrival: .2, startCash: 6000 } as const;
export interface FameBonuses { tips: number; build: number; arrival: number; startCash: number; }
export function fameBonuses(fame: number): FameBonuses {
  const f = Math.max(0, fame), k = f / (f + FAME_BONUS.scale), r = (cap: number) => Math.round(cap * k * 1000) / 1000;
  return { tips: r(FAME_BONUS.tips), build: r(FAME_BONUS.build), arrival: r(FAME_BONUS.arrival), startCash: Math.round(FAME_BONUS.startCash * k / 10) * 10 };
}
const pct = (n: number) => `${Math.round(n * 100)}%`;
/** Fame bonuses in plain words, e.g. for "Founding here earns +16 fame → …". */
export const fameText = (b: FameBonuses): string => `tips +${pct(b.tips)} of each bill · building ${pct(b.build)} cheaper · guests ${pct(b.arrival)} more often · starting cash +$${b.startCash.toLocaleString('en-US')}`;

export interface Region { id: string; x: number; y: number; name: string; biome: BiomeId; /** One decimal, 1 and up; grows with distance on average. */ difficulty: number; stars: 1 | 2 | 3 | 4 | 5; modifiers: RegionModifiers; fame: number; }
export const regionId = (x: number, y: number): string => `${x},${y}`;
export const REGION_ID = /^-?\d{1,6},-?\d{1,6}$/;
export function parseRegionId(id: string): { x: number; y: number } | null {
  if (!REGION_ID.test(id)) return null;
  const [x, y] = id.split(',').map(Number); return { x, y };
}
export const ring = (x: number, y: number): number => Math.max(Math.abs(x), Math.abs(y));
export const HOME_ID = '0,0';

/** Hand-designed first ring: name, biome and difficulty. Effects still come from `modifiersFor`. */
export const FIRST_RING: Record<string, { name: string; biome: BiomeId; difficulty: number }> = {
  '0,-1': { name: 'Kelpwood Hollow', biome: 'kelp', difficulty: 1.5 },
  '1,-1': { name: 'Frostlight Shelf', biome: 'ice', difficulty: 2 },
  '1,0': { name: 'Ember Vents', biome: 'vents', difficulty: 2 },
  '1,1': { name: 'Drowned Spires', biome: 'sunken', difficulty: 2.5 },
  '0,1': { name: 'Glasswater Lagoon', biome: 'lagoon', difficulty: 1 },
  '-1,1': { name: 'Sunburst Atoll', biome: 'atoll', difficulty: 1.5 },
  '-1,0': { name: 'Bluefall Trench', biome: 'trench', difficulty: 3 },
  '-1,-1': { name: 'Cinderfield Vents', biome: 'vents', difficulty: 2.5 },
};

function mix(value: number): number {
  let n = value >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}
/** A pure number in [0, 1) for a region and a salt. */
export const hash01 = (x: number, y: number, salt: number): number => mix(mix(Math.imul(x, 0x27d4eb2d) ^ mix(Math.imul(y, 0x165667b1) ^ salt)) + salt) / 4294967296;

const clamp = (n: number) => Math.min(OCEAN_BALANCE.clampHigh, Math.max(OCEAN_BALANCE.clampLow, n));
/** How hard the downsides bite: 0.6 at difficulty 1, +0.2 per level, up to 1.6. */
export const severity = (difficulty: number): number => .6 + .2 * (Math.min(difficulty, OCEAN_BALANCE.cap) - 1);
/** Region effects from biome and difficulty: one formula for hand-made and generated regions. */
export function modifiersFor(biome: BiomeId, difficulty: number): RegionModifiers {
  if (biome === 'home') return { ...NEUTRAL_MODIFIERS };
  const info = BIOMES[biome], m = { ...NEUTRAL_MODIFIERS }, level = Math.min(difficulty, OCEAN_BALANCE.cap) - 1, stars = starsFor(difficulty);
  const apply = (key: ModifierKey, helpful: number) => { m[key] *= 1 + (LOWER_IS_BETTER[key] ? -helpful : helpful); };
  for (const [key, v] of Object.entries(info.up) as [ModifierKey, number][]) apply(key, v * (1 + .1 * (stars - 1)));
  for (const [key, v] of Object.entries(info.down) as [ModifierKey, number][]) apply(key, -v * severity(difficulty));
  // The general difficulty penalty never cancels the biome's own upside.
  if (!info.up.buildCost) m.buildCost *= 1 + OCEAN_BALANCE.buildPerLevel * level;
  if (!info.up.arrival) m.arrival *= 1 - OCEAN_BALANCE.arrivalPerLevel * level;
  for (const key of Object.keys(m) as ModifierKey[]) m[key] = Math.round(clamp(m[key]) * 1000) / 1000;
  return m;
}
export const starsFor = (difficulty: number): Region['stars'] => Math.min(5, Math.max(1, Math.round(difficulty))) as Region['stars'];
export const fameFor = (biome: BiomeId, difficulty: number): number => Math.round(OCEAN_BALANCE.fameBase * difficulty ** OCEAN_BALANCE.fameExponent * BIOMES[biome].fame);

function generatedBiome(x: number, y: number): BiomeId {
  const total = VISITABLE_BIOMES.reduce((sum, b) => sum + BIOMES[b].weight, 0);
  let pick = hash01(x, y, 0x51) * total;
  for (const b of VISITABLE_BIOMES) { pick -= BIOMES[b].weight; if (pick < 0) return b; }
  return 'kelp';
}
const cache = new Map<string, Region>();
/** The region at (x, y). Same answer every time, for any coordinates. */
export function regionAt(x: number, y: number): Region {
  const id = regionId(x, y), hit = cache.get(id); if (hit) return hit;
  let name: string, biome: BiomeId, difficulty: number;
  if (x === 0 && y === 0) { name = 'Home Reef'; biome = 'home'; difficulty = 1; }
  else if (FIRST_RING[id]) ({ name, biome, difficulty } = FIRST_RING[id]);
  else {
    biome = generatedBiome(x, y);
    const b = OCEAN_BALANCE, raw = b.base + b.perRing * ring(x, y) + (hash01(x, y, 0x77) - .5) * b.jitter + BIOMES[biome].shift;
    difficulty = Math.max(1, Math.round(raw * 10) / 10);
    const [first, second] = BIOMES[biome].words;
    name = `${first[Math.floor(hash01(x, y, 0x3a) * first.length)]} ${second[Math.floor(hash01(x, y, 0x9c) * second.length)]}`;
  }
  const region: Region = { id, x, y, name, biome, difficulty, stars: starsFor(difficulty), modifiers: modifiersFor(biome, difficulty), fame: fameFor(biome, difficulty) };
  if (cache.size < 5000) cache.set(id, region);
  return region;
}
export function regionById(id: string): Region | null { const p = parseRegionId(id); return p ? regionAt(p.x, p.y) : null; }
export const neighbourIds = (x: number, y: number): string[] => [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].map(([dx, dy]) => regionId(x + dx, y + dy));

/** What each multiplier means, in plain words: e.g. "Kelp 20% cheaper". Upsides and downsides separately. */
const LABELS: Record<ModifierKey, [string, string]> = {
  arrival: ['Guests arrive {p} more often', 'Guests arrive {p} less often'], patience: ['Guests {p} more patient', 'Guests {p} less patient'],
  crewSpeed: ['Crew {p} faster', 'Crew {p} slower'], tips: ['Tips +{p}', 'Tips −{p}'],
  kelpCost: ['Kelp {p} cheaper', 'Kelp {p} dearer'], fishCost: ['Fish {p} cheaper', 'Fish {p} dearer'], buildCost: ['Building {p} cheaper', 'Building {p} dearer'],
};
export function describeModifiers(m: RegionModifiers): { upsides: string[]; downsides: string[] } {
  const upsides: string[] = [], downsides: string[] = [];
  for (const key of Object.keys(LABELS) as ModifierKey[]) {
    const v = m[key], p = `${Math.round(Math.abs(v - 1) * 100)}%`; if (p === '0%') continue;
    const good = LOWER_IS_BETTER[key] ? v < 1 : v > 1;
    (good ? upsides : downsides).push(LABELS[key][good ? 0 : 1].replace('{p}', p));
  }
  return { upsides, downsides };
}

/** Exactly what founding keeps and what starts over, matching `RestaurantEngine.foundColony`; shown before founding. */
export const FOUNDING_KEEPS = ['Pearls, charms and extra builders', 'Collections: achievements and their progress', 'Fame and its bonuses', 'Your ocean record of colonies', 'Tutorial, milestones, restaurant name and settings'];
export const FOUNDING_RESETS = ['Cash (you start with the colony’s starting cash)', 'Restaurant layout, furniture, crew and menu', 'Town plots, buildings and depth zones', 'Daily receipts and history'];

// ---- Save: the exploration record ----
const count = z.number().int().nonnegative();
export const colonySchema = z.object({
  region: z.string().regex(REGION_ID), name: z.string().min(1).max(40),
  /** Fame this colony earns; it is added to the total once the colony reaches its Abyss (`abyss`). */ fame: count.optional(), abyss: z.boolean().default(false),
  /** Service days and guests served there; the current colony's are filled in when the next one is founded. */
  days: count.default(0), served: count.default(0),
  /** Lifetime guests served when this colony began. */ startServed: count.default(0),
}).transform(c => ({ ...c, fame: c.fame ?? regionById(c.region)?.fame ?? 0 }));
export type Colony = Validated<z.infer<typeof colonySchema>>;
export const homeColony = (): Colony => ({ region: HOME_ID, name: 'Home Reef', fame: fameFor('home', 1), abyss: false, days: 0, served: 0, startServed: 0 });
/** Fame the current colony will add when it reaches its Abyss (0 once added). */
export const pendingFame = (o: Ocean): number => currentColony(o).abyss ? 0 : currentColony(o).fame;
/** Add the current colony's fame to the total, once. */
export function creditFame(o: Ocean): number { const c = currentColony(o), gain = pendingFame(o); c.abyss = true; o.fame += gain; return gain; }
export const oceanSchema = z.object({ fame: count.default(0), colonies: z.array(colonySchema).min(1).max(2000).default(() => [homeColony()]) })
  .refine(o => new Set(o.colonies.map(c => c.region)).size === o.colonies.length, 'A region holds one colony');
export type Ocean = Validated<z.infer<typeof oceanSchema>>;
export const createOcean = (): Ocean => ({ fame: 0, colonies: [homeColony()] });

export const currentColony = (o: Ocean): Colony => o.colonies[o.colonies.length - 1];
export const currentRegion = (o: Ocean): Region => regionById(currentColony(o).region) ?? regionAt(0, 0);
export const isExplored = (o: Ocean, id: string): boolean => o.colonies.some(c => c.region === id);
/** Unexplored and next to an explored region (all eight directions). */
export function isFoundable(o: Ocean, id: string): boolean {
  const p = parseRegionId(id); if (!p || isExplored(o, id)) return false;
  return neighbourIds(p.x, p.y).some(n => isExplored(o, n));
}
export type RegionStatus = 'explored' | 'current' | 'foundable' | 'fog';
export function regionStatus(o: Ocean, id: string): RegionStatus {
  if (currentColony(o).region === id) return 'current';
  return isExplored(o, id) ? 'explored' : isFoundable(o, id) ? 'foundable' : 'fog';
}
/** The rectangle the map shows: everything explored plus two rings of water around it. */
export function mapBounds(o: Ocean): { x0: number; y0: number; x1: number; y1: number } {
  const ps = o.colonies.map(c => parseRegionId(c.region)!);
  return { x0: Math.min(...ps.map(p => p.x)) - 2, y0: Math.min(...ps.map(p => p.y)) - 2, x1: Math.max(...ps.map(p => p.x)) + 2, y1: Math.max(...ps.map(p => p.y)) + 2 };
}
export const coloniesFounded = (o: Ocean): number => o.colonies.length - 1;
export const biomesVisited = (o: Ocean): BiomeId[] => [...new Set(o.colonies.map(c => regionById(c.region)?.biome).filter((b): b is BiomeId => Boolean(b) && b !== 'home'))];
/** The colony's restaurant seed: a pure function of the previous seed and the region, so founding is deterministic. */
export const colonySeed = (previous: number, id: string): number => { const p = parseRegionId(id)!; return mix(mix(previous) ^ Math.floor(hash01(p.x, p.y, 0xc0) * 4294967296)) || 1; };

// ---- Looks: placeholder palettes per biome (the Home Reef keeps the original look) ----
export interface BiomePalette {
  water: [string, string, string]; sand: string; fog: string; platform: [string, string];
  coral: string[]; kelp: [string, string]; rock: [string, string]; shell: [string, string];
  /** Decor kinds, weighted by repetition. */ decor: ('kelp' | 'rock' | 'coral' | 'shell')[];
}
export const PALETTES: Record<BiomeId, BiomePalette> = {
  home: { water: ['#7FD3DC', '#2A8FB0', '#0B3552'], sand: '#D9C49A', fog: '18, 88, 122', platform: ['#8C5A4E', '#6E4339'], coral: ['#E7746B', '#F2A65A', '#C45AA0', '#EE8DA9'], kelp: ['#3C8A4A', '#2F7340'], rock: ['#6B7380', '#59606C'], shell: ['#F6D2C0', '#F1E3C8'], decor: ['kelp', 'rock', 'shell', 'coral'] },
  kelp: { water: ['#8FD9B0', '#2E8F78', '#0A3A36'], sand: '#B8B47A', fog: '16, 80, 64', platform: ['#6E5A3E', '#55452F'], coral: ['#C9A24A', '#8FBF5A', '#E08A5A', '#B9C66A'], kelp: ['#4C9A3E', '#2F7A34'], rock: ['#5E6B5A', '#4E5A4B'], shell: ['#E9DDB0', '#DCD3A8'], decor: ['kelp', 'kelp', 'kelp', 'rock', 'shell', 'coral'] },
  vents: { water: ['#D49A7A', '#6E3B3A', '#1E0F14'], sand: '#4E3D38', fog: '60, 24, 22', platform: ['#3A2A28', '#2A1D1C'], coral: ['#FF8A3D', '#FFB347', '#E8503A', '#FFD27A'], kelp: ['#6E5A3A', '#5A4730'], rock: ['#2E2A2C', '#3B3436'], shell: ['#C9A28A', '#B88F78'], decor: ['rock', 'rock', 'rock', 'coral', 'coral', 'shell'] },
  ice: { water: ['#D4F4FF', '#6FB6D9', '#173F62'], sand: '#E6F0F4', fog: '40, 90, 130', platform: ['#8FA7B8', '#71899B'], coral: ['#BFE3F2', '#E3F6FF', '#9FC8E8', '#D5E6FF'], kelp: ['#5D9AA0', '#4A8088'], rock: ['#DDEBF2', '#C3D6E2'], shell: ['#FFFFFF', '#EAF4F8'], decor: ['rock', 'rock', 'shell', 'coral', 'kelp'] },
  atoll: { water: ['#A6F4E8', '#2FC2C8', '#0A5A78'], sand: '#F3E3B4', fog: '18, 110, 130', platform: ['#C98A5E', '#A86E48'], coral: ['#FF6F91', '#FFB04A', '#C86BFA', '#FF8A6B', '#5AD1B8'], kelp: ['#3FAF6A', '#2C9257'], rock: ['#B5A48C', '#A08F77'], shell: ['#FFD9E0', '#FFF1CC'], decor: ['coral', 'coral', 'coral', 'shell', 'kelp'] },
  sunken: { water: ['#94B6CC', '#3A6280', '#121D31'], sand: '#9A9486', fog: '30, 50, 76', platform: ['#6F6A60', '#57534B'], coral: ['#8FA6A0', '#C2B48A', '#A08CB8', '#7FA0B0'], kelp: ['#4E7A6A', '#3E6455'], rock: ['#B8B1A0', '#9C9584'], shell: ['#D8CDB0', '#C9BFA4'], decor: ['rock', 'rock', 'rock', 'kelp', 'shell'] },
  trench: { water: ['#4C7AA6', '#15325A', '#030818'], sand: '#38405A', fog: '6, 16, 44', platform: ['#2C3248', '#20253A'], coral: ['#4DF0FF', '#A57BFF', '#5A8CFF', '#7FE0D0'], kelp: ['#2E5A6E', '#244A5C'], rock: ['#262C40', '#323A52'], shell: ['#8A96B8', '#7884A6'], decor: ['rock', 'rock', 'coral', 'kelp'] },
  lagoon: { water: ['#BFF2F2', '#5CC8D2', '#1E7290'], sand: '#EEDDB0', fog: '30, 120, 150', platform: ['#B7875E', '#986C48'], coral: ['#F7A7B8', '#FFD08A', '#9EE0C8', '#C9B5FF'], kelp: ['#5FB36C', '#479A58'], rock: ['#C4B49A', '#AE9F86'], shell: ['#FFE8EE', '#FFF6DA'], decor: ['shell', 'shell', 'kelp', 'coral', 'rock'] },
};
export const paletteFor = (biome: BiomeId): BiomePalette => PALETTES[biome];
