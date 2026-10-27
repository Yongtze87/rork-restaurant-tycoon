import { TOWN_SIZE, activeLevel, canUnlock, lookFor, plotAt, plotZone, type Plot, type Town } from '../town';
import { ZONES, hasZone, type ZoneId } from '../zones';
import type { Ambience } from './ambience';
import { BIOMES, PALETTES, hash01, regionAt, regionStatus, type BiomeId, type Ocean, type RegionStatus } from '../ocean';
import { REGION_PITCH, regionBlock, regionId, type Block } from '../world';
import { depthOf, toGrid, toScreen, type View } from './projection';
import { at, drawDecor, drawNight, drawParticles, drawWater, floorPolygon, type Decor, type Glow } from './render';
import { drawSprite } from './sprites';
import { drawBuilding, drawScaffold } from './town-art';

export interface TownFrame {
  town: Town; ocean: Pick<Ocean, 'regions'>; cash: number; view: View; width: number; height: number; windowTop: number; windowHeight: number;
  time: number; now: number; ambience: Ambience; reduced: boolean; selected: { x: number; z: number } | null;
  /** The region whose details are open; its block is outlined. */
  selectedRegion?: string | null;
  /** Evening darkness, 0 (dusk) to 1 (night); visual only. */
  night?: number;
  /** The next plot's price in the region of (x, z) (engine prices: region and fame applied). */
  plotPrice?: (x: number, z: number) => number;
  /** A region's claim price and why it can't be claimed now (null when it can). */
  claim?: (id: string) => { price: number; error: string | null };
  /** The open water's look (the region the player is looking at). */
  biome?: BiomeId;
}
/** A floating region label on screen, for taps. */
export interface RegionLabel { id: string; left: number; top: number; right: number; bottom: number; }
type Ctx = CanvasRenderingContext2D;
const GAP = .07;

/** Seabed colour per depth zone. The Abyss is the dark drop-off around the home town. */
const ZONE_GROUND: Record<ZoneId, string> = { shallows: '#D9C49A', reef: '#E0A184', twilight: '#2F4C7C', abyss: '#12101C' };
const LOCKED_DIM = 'rgba(8,10,26,.5)';
/** Where each locked home zone's name is drawn once: a corner of its ring, or beside the town for the Abyss. */
const C = (TOWN_SIZE - 1) / 2;
const ZONE_LABEL: Record<Exclude<ZoneId, 'shallows'>, { x: number; z: number }> = { reef: { x: C - 3, z: C + 3 }, twilight: { x: C + 4, z: C + 4 }, abyss: { x: -1, z: C } };
/** Glow points on the drop-off ring around the home town: a few on each side. */
const ABYSS_GLOW = Array.from({ length: 16 }, (_, i) => {
  const side = i % 4, along = (i * .618) % 1 * (TOWN_SIZE + 1) - 1;
  return { x: side === 0 ? -1 : side === 1 ? TOWN_SIZE : along, z: side === 2 ? -1 : side === 3 ? TOWN_SIZE : along, phase: i * 1.7 };
});
/** "Reach the Coral Reef at home to claim…" → "Coral Reef". */
const ZONE_LOCK = /^Reach (?:the )?(.+?) at home/;

const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}

/** Deterministic decor per region: on the seabed paths of claimed regions, everywhere on wild ones. */
const decorCache = new Map<string, Decor[]>();
function regionDecor(x: number, y: number, wild: boolean): Decor[] {
  const key = `${x},${y}:${wild}`, hit = decorCache.get(key); if (hit) return hit;
  const region = regionAt(x, y), palette = PALETTES[region.biome], b = regionBlock(x, y), list: Decor[] = [];
  const x0 = x * REGION_PITCH - .5, z0 = y * REGION_PITCH - .5;
  for (let i = 0; i < (wild ? 16 : 22); i++) {
    const dx = x0 + hash01(x, y, 100 + i) * REGION_PITCH, dz = z0 + hash01(x, y, 300 + i) * REGION_PITCH;
    const inside = dx > b.x0 - .6 && dx < b.x0 + b.size - .4 && dz > b.z0 - .6 && dz < b.z0 + b.size - .4;
    if (wild || !inside) list.push({ x: dx, z: dz, kind: palette.decor[Math.floor(hash01(x, y, 500 + i) * palette.decor.length)], tint: hash01(x, y, 700 + i) });
  }
  if (decorCache.size > 600) decorCache.clear();
  decorCache.set(key, list); return list;
}
const blockPolygon = (ctx: Ctx, view: View, b: Block, inset = 0) => floorPolygon(ctx, view, b.x0 - .5 + inset, b.z0 - .5 + inset, b.x0 + b.size - .5 - inset, b.z0 + b.size - .5 - inset);
const cellPolygon = (ctx: Ctx, view: View, x: number, y: number) => floorPolygon(ctx, view, x * REGION_PITCH - .5, y * REGION_PITCH - .5, (x + 1) * REGION_PITCH - .5, (y + 1) * REGION_PITCH - .5);

/** The region cells that touch the screen (plus a margin for tall buildings and labels). */
export function visibleCells(view: View, width: number, height: number): { x0: number; y0: number; x1: number; y1: number } {
  const pad = 120 * view.scale, corners = [toGrid(view, -pad, -pad * 2), toGrid(view, width + pad, -pad * 2), toGrid(view, -pad, height + pad), toGrid(view, width + pad, height + pad)];
  const xs = corners.map(p => p.x), zs = corners.map(p => p.z), cell = (n: number) => Math.floor((n + .5) / REGION_PITCH);
  const x0 = cell(Math.min(...xs)), x1 = cell(Math.max(...xs)), y0 = cell(Math.min(...zs)), y1 = cell(Math.max(...zs));
  // Never loop over more than a 24×24 block of regions, however far the view is zoomed out.
  const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
  return { x0: Math.max(x0, cx - 12), x1: Math.min(x1, cx + 12), y0: Math.max(y0, cy - 12), y1: Math.min(y1, cy + 12) };
}

/** Draw the whole world: the home town, claimed regions, claimable regions and fog. Reads state only; returns label boxes for taps. */
export function renderTown(ctx: Ctx, f: TownFrame): RegionLabel[] {
  const { town, ocean, view, time, now, reduced, selected } = f, t = reduced ? 0 : time, s = view.scale;
  const homePalette = PALETTES.home, price = (p: Plot) => f.plotPrice?.(p.x, p.z) ?? 0;
  drawWater(ctx, { ...f, palette: PALETTES[f.biome ?? 'home'] });
  const range = visibleCells(view, f.width, f.height), cells: { x: number; y: number; id: string; status: RegionStatus }[] = [];
  for (let y = range.y0; y <= range.y1; y++) for (let x = range.x0; x <= range.x1; x++) { const id = regionId(x, y); cells.push({ x, y, id, status: regionStatus(ocean, id) }); }
  // Ground: fog first, then seabed for every known cell, then each region's block in its biome colours.
  for (const c of cells) {
    if (c.status === 'fog') { cellPolygon(ctx, view, c.x, c.y); ctx.fillStyle = `rgba(${homePalette.fog},.88)`; ctx.fill(); continue; }
    if (c.status === 'home') continue;
    const palette = PALETTES[regionAt(c.x, c.y).biome], b = regionBlock(c.x, c.y);
    cellPolygon(ctx, view, c.x, c.y); ctx.fillStyle = palette.sand; ctx.fill(); ctx.fillStyle = 'rgba(20,28,48,.32)'; ctx.fill();
    blockPolygon(ctx, view, b); ctx.fillStyle = palette.sand; ctx.fill();
    if (c.status === 'claimable') { ctx.fillStyle = 'rgba(8,10,26,.42)'; ctx.fill(); }
  }
  // The home town: the drop-off ring around it, then its zone rings.
  const abyss = hasZone(town, 'abyss');
  floorPolygon(ctx, view, -1.5, -1.5, TOWN_SIZE + .5, TOWN_SIZE + .5); ctx.fillStyle = ZONE_GROUND.abyss; ctx.fill();
  for (const g of ABYSS_GLOW) {
    const p = toScreen(view, g.x, g.z), r = 14 * s, a = (abyss ? .5 : .14) * (.7 + .3 * Math.sin(t * 1.3 + g.phase));
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); glow.addColorStop(0, `rgba(77,240,255,${a})`); glow.addColorStop(1, 'rgba(77,240,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }
  const ground = (zone: ZoneId) => zone === 'shallows' ? homePalette.sand : ZONE_GROUND[zone], homePlots: Plot[] = [];
  for (let z = 0; z < TOWN_SIZE; z++) for (let x = 0; x < TOWN_SIZE; x++) { const p = plotAt(town, x, z); if (p) homePlots.push(p); }
  for (const plot of homePlots) { floorPolygon(ctx, view, plot.x - .5, plot.z - .5, plot.x + .5, plot.z + .5); ctx.fillStyle = ground(plotZone(plot)); ctx.fill(); if (!hasZone(town, plotZone(plot))) { ctx.fillStyle = LOCKED_DIM; ctx.fill(); } }
  // Region borders: a soft edge around every claimed block, a dashed one around claimable blocks.
  const claimed = cells.filter(c => c.status === 'claimed' || c.status === 'home');
  for (const c of cells) {
    if (c.status === 'fog') continue;
    const b = regionBlock(c.x, c.y); blockPolygon(ctx, view, b, -.08);
    if (c.status === 'claimable') { const ok = !f.claim?.(c.id).error; ctx.setLineDash([7, 5]); ctx.strokeStyle = ok ? '#4DF0FF' : 'rgba(233,230,255,.55)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
    else { ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (f.selectedRegion === c.id) { blockPolygon(ctx, view, b, -.18); ctx.strokeStyle = '#FFE27A'; ctx.lineWidth = 3; ctx.stroke(); }
  }
  // Plots of every visible claimed region: owned are paved, unlockable outlined with their price, the rest stay wild.
  const plots: Plot[] = [];
  for (const c of claimed) {
    if (c.status === 'home') { plots.push(...homePlots); continue; }
    const b = regionBlock(c.x, c.y);
    for (let z = b.z0; z < b.z0 + b.size; z++) for (let x = b.x0; x < b.x0 + b.size; x++) { const p = plotAt(town, x, z); if (p) plots.push(p); }
  }
  const openPlots = new Set(plots.filter(p => canUnlock(town, p)));
  for (const plot of plots) {
    const open = openPlots.has(plot), x0 = plot.x - .5 + GAP, z0 = plot.z - .5 + GAP, x1 = plot.x + .5 - GAP, z1 = plot.z + .5 - GAP;
    floorPolygon(ctx, view, x0, z0, x1, z1);
    ctx.fillStyle = plot.owned ? (plot.building ? '#86CAC3' : '#A9D8D0') : open ? 'rgba(255,242,215,.35)' : 'rgba(40,60,80,.28)'; ctx.fill();
    if (open) { ctx.setLineDash([5, 4]); ctx.strokeStyle = f.cash >= price(plot) ? '#4DF0FF' : 'rgba(233,230,255,.6)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
    if (selected && selected.x === plot.x && selected.z === plot.z) { ctx.strokeStyle = '#FFE27A'; ctx.lineWidth = 3; floorPolygon(ctx, view, x0, z0, x1, z1); ctx.stroke(); }
  }
  // Decor and buildings, back to front.
  const items: { depth: number; draw: () => void }[] = [];
  for (const c of cells) {
    if (c.status === 'fog' || c.status === 'home') continue;
    const palette = PALETTES[regionAt(c.x, c.y).biome];
    for (const d of regionDecor(c.x, c.y, c.status === 'claimable')) items.push({ depth: depthOf(d.x, d.z), draw: () => at(ctx, view, d.x, d.z, 0, () => drawDecor(ctx, d, t, palette), c.status === 'claimable' ? .7 : 1) });
  }
  for (const plot of plots) {
    if (!plot.building) continue;
    const look = lookFor(plot.level), building = plot.building, job = plot.job;
    items.push({ depth: depthOf(plot.x, plot.z), draw: () => at(ctx, view, plot.x, plot.z, 0, () => {
      if (job?.kind === 'build') { ctx.fillStyle = 'rgba(122,90,62,.8)'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2); ctx.fill(); }
      else if (!drawSprite(ctx, `building.${building}.${look}`)) drawBuilding(ctx, building, look, t);
      if (job) drawScaffold(ctx);
    }) });
  }
  items.sort((a, b) => a.depth - b.depth).forEach(item => item.draw());
  const night = f.night ?? 0;
  if (night > 0) drawNight(ctx, f, night, plots.flatMap((plot): Glow[] => {
    if (!plot.building || !activeLevel(plot)) return [];
    const look = lookFor(plot.level), glows: Glow[] = [];
    if (plot.building === 'garden') glows.push({ ...toScreen(view, plot.x, plot.z, 12), r: 52 * s, color: '165, 123, 255', strength: .2 + look * .1 });
    if (plot.building === 'restaurant' || plot.building === 'branch') glows.push({ ...toScreen(view, plot.x, plot.z, 10), r: 26 * s, color: '255, 226, 122', strength: .4 });
    if (look === 3) glows.push({ ...toScreen(view, plot.x, plot.z, 30), r: 58 * s, color: plot.building === 'homes' || plot.building === 'branch' ? '255, 226, 122' : '77, 240, 255', strength: .35 });
    return glows;
  }));
  // Badges after the buildings so they are never hidden: level, construction progress, unlock price.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Zoomed far out only construction bars stay; the region labels carry the information.
  const detail = s >= .6;
  for (const plot of plots) {
    const p = toScreen(view, plot.x, plot.z);
    if (plot.job) {
      const span = plot.job.endsAt - plot.job.startedAt, done = span > 0 ? Math.min(1, (now - plot.job.startedAt) / span) : 1, y = p.y - 66 * s;
      ctx.fillStyle = 'rgba(18,15,46,.9)'; ctx.beginPath(); ctx.roundRect(p.x - 30 * s, y - 9 * s, 60 * s, 18 * s, 9 * s); ctx.fill();
      ctx.fillStyle = '#4DF0FF'; ctx.beginPath(); ctx.roundRect(p.x - 28 * s, y + 5 * s, 56 * s * done, 2.5 * s, 1.5 * s); ctx.fill();
      if (detail) { ctx.fillStyle = '#E9E6FF'; ctx.font = `700 ${Math.max(9, 9 * s)}px Quicksand, sans-serif`; ctx.fillText(formatDuration(plot.job.endsAt - now), p.x, y - 1 * s); }
    } else if (plot.building && detail) {
      const y = p.y + 14 * s;
      ctx.fillStyle = 'rgba(18,15,46,.85)'; ctx.beginPath(); ctx.roundRect(p.x - 15 * s, y - 6 * s, 30 * s, 12 * s, 6 * s); ctx.fill();
      if (detail) { ctx.fillStyle = '#FFE27A'; ctx.font = `700 ${Math.max(8, 8 * s)}px Quicksand, sans-serif`; ctx.fillText(`Lv ${plot.level}`, p.x, y + .5 * s); }
    } else if (openPlots.has(plot) && detail) {
      const cost = price(plot); ctx.fillStyle = f.cash >= cost ? '#E9E6FF' : 'rgba(233,230,255,.6)'; ctx.font = `700 ${Math.max(9, 10 * s)}px "Baloo 2", sans-serif`; ctx.fillText(fmt(cost), p.x, p.y);
    } else if (plot.owned && detail) {
      ctx.fillStyle = 'rgba(18,15,46,.6)'; ctx.font = `700 ${Math.max(8, 8 * s)}px Quicksand, sans-serif`; ctx.fillText('Empty plot', p.x, p.y);
    }
  }
  if (cells.some(c => c.status === 'home')) for (const [id, spot] of Object.entries(ZONE_LABEL) as [Exclude<ZoneId, 'shallows'>, { x: number; z: number }][]) {
    if (hasZone(town, id)) continue;
    pill(ctx, toScreen(view, spot.x, spot.z), [`${ZONES[id].name} · locked`], s, 'rgba(18,15,46,.8)', null);
  }
  // Region labels float above their blocks: names on claimed regions; name, stars and price on claimable ones.
  const labels: RegionLabel[] = [];
  for (const c of cells) {
    if (c.status === 'fog' || c.status === 'home') continue;
    const region = regionAt(c.x, c.y), b = regionBlock(c.x, c.y), mid = b.size / 2 - .5;
    if (c.status === 'claimed') { pill(ctx, toScreen(view, b.x0 + mid, b.z0 - .9), [region.name], s, 'rgba(18,15,46,.72)', null); continue; }
    const claim = f.claim?.(c.id), stars = '★'.repeat(region.stars);
    const gate = claim?.error ? ZONE_LOCK.exec(claim.error)?.[1] : undefined, status = !claim ? '' : gate ? `After the ${gate}` : fmt(claim.price);
    const box = pill(ctx, toScreen(view, b.x0 + mid, b.z0 + mid, 40), [region.name, `${stars} · ${BIOMES[region.biome].name}`, status], s, 'rgba(18,15,46,.86)', claim && !claim.error ? '#4DF0FF' : 'rgba(233,230,255,.4)');
    labels.push({ id: c.id, ...box });
  }
  drawParticles(ctx, f);
  return labels;
}

/** A rounded label of one to three lines centred on a point; returns its screen box. */
function pill(ctx: Ctx, p: { x: number; y: number }, lines: string[], scale: number, fill: string, stroke: string | null): Omit<RegionLabel, 'id'> {
  const k = Math.max(.8, Math.min(1.3, scale)), size = [12 * k, 9.5 * k, 10.5 * k], rows = lines.filter(Boolean);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const widths = rows.map((line, i) => { ctx.font = i === 0 ? `800 ${size[0]}px "Baloo 2", sans-serif` : `700 ${size[i]}px Quicksand, sans-serif`; return ctx.measureText(line).width; });
  const w = Math.max(...widths) + 18 * k, lh = 14 * k, h = rows.length * lh + 8 * k, left = p.x - w / 2, top = p.y - h / 2;
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(left, top, w, h, 9 * k); ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  rows.forEach((line, i) => {
    ctx.font = i === 0 ? `800 ${size[0]}px "Baloo 2", sans-serif` : `700 ${size[i]}px Quicksand, sans-serif`;
    ctx.fillStyle = i === 0 ? '#E9E6FF' : i === 1 ? '#FFE27A' : stroke === '#4DF0FF' ? '#4DF0FF' : 'rgba(233,230,255,.75)';
    ctx.fillText(line, p.x, top + 4 * k + lh * (i + .5));
  });
  return { left, top, right: left + w, bottom: top + h };
}
