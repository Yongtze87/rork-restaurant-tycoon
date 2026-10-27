import { z } from 'zod';
import type { BuildingKind, Validated } from './town';
import type { ZoneId } from './zones';
import { HOME_ID, REGION_ID, parseRegionId, regionId, ring } from './world';
export { HOME_ID, REGION_ID, parseRegionId, regionId, ring } from './world';

/**
 * The Ocean: one ever-growing world. The Home Reef town is region (0, 0); every other region is a block
 * of plots around it on the same plot grid (see `world.ts`). The first ring is hand-designed; the rest is
 * generated from its coordinates by a pure hash, so the world is the same every time and never runs out.
 * A region's biome changes buildings placed *in that region*; fame from mastering regions is permanent.
 * Pure: the engine charges, records and applies everything here. Balance for regions and fame lives here.
 */
export const BIOME_IDS = ['home', 'kelp', 'vents', 'ice', 'atoll', 'sunken', 'trench', 'lagoon'] as const;
export type BiomeId = typeof BIOME_IDS[number];
export type BoostKind = Extract<BuildingKind, 'kelpFarm' | 'fishery' | 'garden' | 'workshop'>;

/** What a region does to its own plots, buildings and branch. 1 = neutral; costs and times below 1 help. */
export interface RegionModifiers {
  /** Plots, buildings and upgrades in this region. */ buildCost: number;
  /** Construction time in this region. */ buildTime: number;
  /** The branch restaurant's daily earnings. */ branchIncome: number;
  /** Strength of a building kind's effect when it stands in this region (e.g. 1.5 = 50% stronger). */ boost: Partial<Record<BoostKind, number>>;
}
type Scalar = Exclude<keyof RegionModifiers, 'boost'>;
export const NEUTRAL_MODIFIERS: RegionModifiers = { buildCost: 1, buildTime: 1, branchIncome: 1, boost: {} };
const LOWER_IS_BETTER: Record<Scalar, boolean> = { buildCost: true, buildTime: true, branchIncome: false };

export interface BiomeInfo {
  name: string; description: string; /** What to build here, in plain words. */ goodFor: string;
  /** Good effects at 1★, as changes in the helpful direction (0.15 on buildCost = building 15% cheaper); a little stronger per star. */
  up: Partial<Record<Scalar, number>>; boost?: { kind: BoostKind; amount: number };
  /** Bad effects at difficulty 1, scaled up with difficulty (see `severity`). */
  down: Partial<Record<Scalar, number>>;
  /** Fame multiplier and generation weight; `shift` moves difficulty for this biome. */
  fame: number; weight: number; shift: number;
  /** Words for generated names. */
  words: [string[], string[]];
}
export const BIOMES: Record<BiomeId, BiomeInfo> = {
  home: { name: 'Home reef', description: 'Where your story began. Your flagship restaurant lives here.', goodFor: 'Everything: the restaurant you run yourself.', up: {}, down: {}, fame: 1, weight: 0, shift: 0, words: [['Home'], ['Reef']] },
  kelp: { name: 'Kelp forest', description: 'Tall swaying kelp. Farms thrive, but builders squeeze through the stalks.', goodFor: 'Kelp farms: cheaper kelp dishes in your restaurant.', up: {}, boost: { kind: 'kelpFarm', amount: .5 }, down: { buildTime: .12 }, fame: 1, weight: 3, shift: 0, words: [['Swaying', 'Green', 'Tangle', 'Mossy', 'Whisper'], ['Hollow', 'Wood', 'Stalks', 'Thicket', 'Glade']] },
  vents: { name: 'Volcanic vents', description: 'Warm smoking vents. Fish gather in the heat; building on hot rock costs more.', goodFor: 'Fisheries: cheaper fish dishes in your restaurant.', up: {}, boost: { kind: 'fishery', amount: .5 }, down: { buildCost: .1 }, fame: 1, weight: 3, shift: 0, words: [['Ember', 'Cinder', 'Smoke', 'Ash', 'Sulphur'], ['Vents', 'Chimneys', 'Field', 'Rise', 'Furnace']] },
  ice: { name: 'Ice shelf', description: 'Cold water under the ice. Grateful diners tip a branch well; builders work slowly.', goodFor: 'A branch restaurant: big tips every day.', up: { branchIncome: .25 }, down: { buildTime: .15 }, fame: 1, weight: 3, shift: 0, words: [['Frost', 'Glacier', 'Pale', 'Snowfall', 'Crystal'], ['Shelf', 'Ledge', 'Floe', 'Cap', 'Drift']] },
  atoll: { name: 'Coral atoll', description: 'A bright ring of coral full of visitors. Building on coral costs more.', goodFor: 'Glow gardens: guests visit your restaurant more often.', up: {}, boost: { kind: 'garden', amount: .5 }, down: { buildCost: .12 }, fame: 1, weight: 3, shift: 0, words: [['Sunburst', 'Bright', 'Ring', 'Rainbow', 'Lucky'], ['Atoll', 'Isle', 'Crown', 'Shoals', 'Garden']] },
  sunken: { name: 'Sunken city', description: 'Old ruins to build on, cheaply, with skilled engineers. Few diners find a branch here.', goodFor: 'Workshops and cheap building.', up: { buildCost: .15 }, boost: { kind: 'workshop', amount: .5 }, down: { branchIncome: .15 }, fame: 1.1, weight: 2, shift: .3, words: [['Drowned', 'Old', 'Pillar', 'Silent', 'Gilded'], ['Spires', 'Ruins', 'Halls', 'Steps', 'Gate']] },
  trench: { name: 'Open trench', description: 'The edge of the deep. Hard to build on, but daring diners pay a branch well and fame is greater.', goodFor: 'A branch restaurant: the richest daily income, and more fame.', up: { branchIncome: .45 }, down: { buildCost: .15, buildTime: .1 }, fame: 1.4, weight: 2, shift: .5, words: [['Blue', 'Deep', 'Night', 'Hollow', 'Long'], ['Trench', 'Fall', 'Chasm', 'Drop', 'Rift']] },
  lagoon: { name: 'Calm lagoon', description: 'Sheltered and gentle: cheap, quick building with smaller rewards.', goodFor: 'An easy, cheap start; any building.', up: { buildCost: .12, buildTime: .12 }, down: { branchIncome: .15 }, fame: .5, weight: 1.5, shift: -1, words: [['Glass', 'Still', 'Quiet', 'Soft', 'Mirror'], ['Water', 'Pool', 'Bay', 'Cove', 'Shallows']] },
};
export const VISITABLE_BIOMES = BIOME_IDS.filter(id => id !== 'home');

/** Balance knobs for regions, claiming and fame. See docs/BALANCE.md. */
export const OCEAN_BALANCE = {
  /** Generated difficulty: base + perRing × ring ± jitter/2. */
  base: .8, perRing: .6, jitter: 1.6,
  /** Every region past the Home Reef: building costs more and its branch earns more with difficulty (up to `cap`). */
  buildPerLevel: .06, incomePerLevel: .08, cap: 6,
  /** A region's total mastery fame = fameBase × difficulty ^ fameExponent × biome fame. Grows faster than difficulty. */
  fameBase: 10, fameExponent: 1.5,
  /** No single multiplier strays further than this from neutral. */
  clampLow: .7, clampHigh: 1.8,
} as const;
/** Claim price = base × difficulty ^ exponent × perRing ^ (ring − 1) × growth ^ (regions already claimed), to $100. */
export const CLAIM = { base: 2500, exponent: 1.2, perRing: 2.2, growth: 1.25 } as const;
/** How far out regions may be claimed: ring 1 after the Coral Reef, ring 2 after the Twilight Zone, ring 3+ after the Abyss. */
export const claimGate = (ringIndex: number): ZoneId => ringIndex <= 1 ? 'reef' : ringIndex === 2 ? 'twilight' : 'abyss';
/** Plot prices inside a region: base × (1 + step × (owned − 1)) ^ exponent × (1 + perRing × (ring − 1)), before the region's build cost. */
export const REGION_PLOTS = { base: 300, step: .35, exponent: 1.6, perRing: .6 } as const;
/** Share of a region's mastery fame for each milestone, and the Home Reef's fame for reaching its Abyss. */
export const MASTERY = { claim: .3, branch6: .3, branch11: .25, full: .15, homeAbyss: 30 } as const;

/**
 * Permanent fame bonuses. Each approaches its cap (bonus = cap × fame / (fame + scale)): every fame point helps,
 * a little less than the one before, and no bonus ever passes its cap.
 * `tips` is an extra share of every bill paid as tips; `build` makes plots, buildings, upgrades, zones and claims cheaper;
 * `arrival` brings guests more often; `branch` raises every branch's daily earnings.
 */
export const FAME_BONUS = { scale: 60, tips: .15, build: .25, arrival: .12, branch: .25 } as const;
export interface FameBonuses { tips: number; build: number; arrival: number; branch: number; }
export function fameBonuses(fame: number): FameBonuses {
  const f = Math.max(0, fame), k = f / (f + FAME_BONUS.scale), r = (cap: number) => Math.round(cap * k * 1000) / 1000;
  return { tips: r(FAME_BONUS.tips), build: r(FAME_BONUS.build), arrival: r(FAME_BONUS.arrival), branch: r(FAME_BONUS.branch) };
}
const pct = (n: number) => `${Math.round(n * 100)}%`;
/** Fame bonuses in plain words. */
export const fameText = (b: FameBonuses): string => `tips +${pct(b.tips)} of each bill · building ${pct(b.build)} cheaper · guests ${pct(b.arrival)} more often · branches earn +${pct(b.branch)}`;

export interface Region { id: string; x: number; y: number; ring: number; name: string; biome: BiomeId; /** One decimal, 1 and up; grows with distance on average. */ difficulty: number; stars: 1 | 2 | 3 | 4 | 5; modifiers: RegionModifiers; /** Total fame for mastering this region. */ fame: number; }

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

const FIRST_RING_NAMES = new Set(Object.values(FIRST_RING).map(r => r.name));

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
export const starsFor = (difficulty: number): Region['stars'] => Math.min(5, Math.max(1, Math.round(difficulty))) as Region['stars'];
/** Region effects from biome and difficulty: one formula for hand-made and generated regions. */
export function modifiersFor(biome: BiomeId, difficulty: number): RegionModifiers {
  if (biome === 'home') return { ...NEUTRAL_MODIFIERS, boost: {} };
  const info = BIOMES[biome], level = Math.min(difficulty, OCEAN_BALANCE.cap) - 1, strength = 1 + .1 * (starsFor(difficulty) - 1);
  const m: Record<Scalar, number> = { buildCost: 1, buildTime: 1, branchIncome: 1 };
  const apply = (key: Scalar, helpful: number) => { m[key] *= 1 + (LOWER_IS_BETTER[key] ? -helpful : helpful); };
  for (const [key, v] of Object.entries(info.up) as [Scalar, number][]) apply(key, v * strength);
  for (const [key, v] of Object.entries(info.down) as [Scalar, number][]) apply(key, -v * severity(difficulty));
  // Further out, building costs more and branches earn more, but never so that it cancels the biome's own upside or downside.
  if (!info.up.buildCost) m.buildCost *= 1 + OCEAN_BALANCE.buildPerLevel * level;
  if (!info.down.branchIncome) m.branchIncome *= 1 + OCEAN_BALANCE.incomePerLevel * level;
  const round = (n: number) => Math.round(clamp(n) * 1000) / 1000;
  return { buildCost: round(m.buildCost), buildTime: round(m.buildTime), branchIncome: round(m.branchIncome), boost: info.boost ? { [info.boost.kind]: Math.round((1 + info.boost.amount * strength) * 1000) / 1000 } : {} };
}
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
    // Generated names never repeat a hand-made first-ring name.
    for (let salt = 0; ; salt++) {
      name = `${first[Math.floor(hash01(x, y, 0x3a + salt) * first.length)]} ${second[Math.floor(hash01(x, y, 0x9c + salt) * second.length)]}`;
      if (!FIRST_RING_NAMES.has(name) || salt > 8) break;
    }
  }
  const region: Region = { id, x, y, ring: ring(x, y), name, biome, difficulty, stars: starsFor(difficulty), modifiers: modifiersFor(biome, difficulty), fame: biome === 'home' ? MASTERY.homeAbyss : fameFor(biome, difficulty) };
  if (cache.size < 5000) cache.set(id, region);
  return region;
}
export function regionById(id: string): Region | null { const p = parseRegionId(id); return p ? regionAt(p.x, p.y) : null; }
export const neighbourIds = (x: number, y: number): string[] => [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].map(([dx, dy]) => regionId(x + dx, y + dy));

/** Base claim price for a region when `claimed` regions are already claimed (fame discount not applied). */
export function claimPrice(region: Region, claimed: number): number {
  if (region.biome === 'home') return 0;
  return Math.round(CLAIM.base * region.difficulty ** CLAIM.exponent * CLAIM.perRing ** (region.ring - 1) * CLAIM.growth ** claimed / 100) * 100;
}
/** Base price of the next plot in a region that already has `owned` plots (region build cost and fame not applied). */
export const regionPlotCost = (region: Region, owned: number): number => REGION_PLOTS.base * (1 + REGION_PLOTS.step * Math.max(0, owned - 1)) ** REGION_PLOTS.exponent * (1 + REGION_PLOTS.perRing * Math.max(0, region.ring - 1));

const BOOST_NAMES: Record<BoostKind, string> = { kelpFarm: 'Kelp farms', fishery: 'Fisheries', garden: 'Glow gardens', workshop: 'Workshops' };
/** What a region does, in plain words: e.g. "Kelp farms 50% stronger here". Upsides and downsides separately. */
const LABELS: Record<Scalar, [string, string]> = {
  buildCost: ['Building {p} cheaper here', 'Building {p} dearer here'], buildTime: ['Building {p} faster here', 'Building takes {p} longer here'],
  branchIncome: ['Branch earns {p} more', 'Branch earns {p} less'],
};
export function describeModifiers(m: RegionModifiers): { upsides: string[]; downsides: string[] } {
  const upsides: string[] = [], downsides: string[] = [];
  for (const [kind, v] of Object.entries(m.boost) as [BoostKind, number][]) upsides.push(`${BOOST_NAMES[kind]} ${Math.round((v - 1) * 100)}% stronger here`);
  for (const key of Object.keys(LABELS) as Scalar[]) {
    const v = m[key], p = `${Math.round(Math.abs(v - 1) * 100)}%`; if (p === '0%') continue;
    const good = LOWER_IS_BETTER[key] ? v < 1 : v > 1;
    (good ? upsides : downsides).push(LABELS[key][good ? 0 : 1].replace('{p}', p));
  }
  return { upsides, downsides };
}

// ---- Save: claimed regions, fame and the milestones that paid it ----
const count = z.number().int().nonnegative();
const unique = (list: unknown[]): boolean => new Set(list).size === list.length;
/**
 * Saves from the short-lived colony build kept `colonies` (one restaurant per region, restarted on founding).
 * They load as one world: fame is kept, every founded region becomes a claimed (empty) region, and milestones
 * already paid stay paid. Anything unreadable in that record is dropped rather than failing the save.
 */
export function migrateOcean(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { colonies?: unknown }).colonies)) return raw;
  const old = raw as { fame?: unknown; colonies: unknown[] };
  const entries = old.colonies.map(c => (c && typeof c === 'object' ? c : {}) as { region?: unknown; abyss?: unknown });
  const regions = [...new Set(entries.map(c => c.region).filter((id): id is string => typeof id === 'string' && REGION_ID.test(id) && id !== HOME_ID))].slice(0, 2000);
  const fame = typeof old.fame === 'number' && Number.isFinite(old.fame) && old.fame >= 0 ? Math.floor(old.fame) : 0;
  const homeAbyss = entries.some(c => c.region === HOME_ID && c.abyss === true);
  return { fame, regions, mastery: [...regions.map(id => `${id}:claim`), ...(homeAbyss ? [`${HOME_ID}:abyss`] : [])] };
}
export const oceanSchema = z.preprocess(migrateOcean, z.object({
  fame: count.default(0),
  /** Claimed regions other than the Home Reef, in the order they were claimed. */
  regions: z.array(z.string().regex(REGION_ID)).max(2000).default([]).refine(list => unique(list) && !list.includes(HOME_ID), 'Invalid regions'),
  /** Mastery milestones already rewarded with fame, e.g. "1,0:claim", "1,0:branch6". Fame is never taken back. */
  mastery: z.array(z.string().max(40)).max(10000).default([]).refine(unique, 'Duplicate milestones'),
}));
export type Ocean = Validated<z.infer<typeof oceanSchema>>;
export const createOcean = (): Ocean => ({ fame: 0, regions: [], mastery: [] });

export const isClaimed = (o: Pick<Ocean, 'regions'>, id: string): boolean => id === HOME_ID || o.regions.includes(id);
/** Unclaimed and next to a claimed region or the Home Reef (all eight directions). */
export function isClaimable(o: Pick<Ocean, 'regions'>, id: string): boolean {
  const p = parseRegionId(id); if (!p || isClaimed(o, id)) return false;
  return neighbourIds(p.x, p.y).some(n => isClaimed(o, n));
}
export type RegionStatus = 'home' | 'claimed' | 'claimable' | 'fog';
export function regionStatus(o: Pick<Ocean, 'regions'>, id: string): RegionStatus {
  if (id === HOME_ID) return 'home';
  return isClaimed(o, id) ? 'claimed' : isClaimable(o, id) ? 'claimable' : 'fog';
}
/** Every claimable region, nearest first. */
export function claimableRegions(o: Pick<Ocean, 'regions'>): Region[] {
  const seen = new Set<string>(), list: Region[] = [];
  for (const id of [HOME_ID, ...o.regions]) {
    const p = parseRegionId(id)!;
    for (const n of neighbourIds(p.x, p.y)) if (!seen.has(n) && isClaimable(o, n)) { seen.add(n); list.push(regionById(n)!); }
  }
  return list.sort((a, b) => a.ring - b.ring || a.difficulty - b.difficulty || a.id.localeCompare(b.id));
}
/** Region rectangle holding everything claimed plus one ring of claimable regions. */
export function worldBounds(o: Pick<Ocean, 'regions'>): { x0: number; y0: number; x1: number; y1: number } {
  const ps = [HOME_ID, ...o.regions].map(id => parseRegionId(id)!);
  return { x0: Math.min(...ps.map(p => p.x)) - 1, y0: Math.min(...ps.map(p => p.y)) - 1, x1: Math.max(...ps.map(p => p.x)) + 1, y1: Math.max(...ps.map(p => p.y)) + 1 };
}
export const biomesClaimed = (o: Pick<Ocean, 'regions'>): BiomeId[] => [...new Set(o.regions.map(id => regionById(id)?.biome).filter((b): b is BiomeId => Boolean(b) && b !== 'home'))];

export type MasteryKind = 'claim' | 'branch6' | 'branch11' | 'full' | 'abyss';
export const masteryKey = (id: string, kind: MasteryKind): string => `${id}:${kind}`;
/** Fame for one milestone in a region. */
export const masteryFame = (region: Region, kind: MasteryKind): number => kind === 'abyss' ? (region.biome === 'home' ? MASTERY.homeAbyss : 0) : Math.max(1, Math.round(region.fame * MASTERY[kind]));
/** The milestones that earn fame in a region, in order, with their labels. */
export function masterySteps(region: Region): { kind: MasteryKind; label: string; fame: number }[] {
  if (region.biome === 'home') return [{ kind: 'abyss', label: 'Reach the Abyss', fame: MASTERY.homeAbyss }];
  return ([['claim', 'Claim the region'], ['branch6', 'Branch at level 6'], ['branch11', 'Branch at level 11'], ['full', 'Own every plot']] as [MasteryKind, string][]).map(([kind, label]) => ({ kind, label, fame: masteryFame(region, kind) }));
}

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
