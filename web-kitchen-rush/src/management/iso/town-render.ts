import { PARCEL, TOWN_SIZE, activeLevel, buildingLook, buildingAt, buildingRegion, canUnlock, connected, footprint, occupancy, parcelOf, plotAt, plotZone, rectOf, roadSet, type Building, type Plot, type Rect, type Spot, type Town } from '../town';
import { ZONES, hasZone, type ZoneId } from '../zones';
import type { Ambience } from './ambience';
import { BIOMES, PALETTES, hash01, regionAt, regionStatus, type BiomeId, type Ocean, type RegionStatus } from '../ocean';
import { REGION_PITCH, regionBlock, regionId, type Block } from '../world';
import { depthOf, toGrid, toScreen, type View } from './projection';
import { at, drawDecor, drawNight, drawParticles, drawWater, floorPolygon, type Decor, type Glow } from './render';
import { drawSprite } from './sprites';
import { drawBuilding, drawCart, drawGrottoAnnex, drawScaffold, drawWalker } from './town-art';
import { CART_COLORS, WALKER_COLORS, placeAgent, stepTraffic } from './traffic';

export interface TownFrame {
  town: Town; ocean: Pick<Ocean, 'regions'>; cash: number; view: View; width: number; height: number; windowTop: number; windowHeight: number;
  time: number; now: number; ambience: Ambience; reduced: boolean;
  /** The tapped tile (tile coordinates); a building covering it is outlined. */
  selected: { x: number; z: number } | null;
  /** A building being placed or moved, and whether it fits there. */
  draft?: { spot: Spot; ok: boolean; /** The building being moved: hidden from its old spot. */ id?: number } | null;
  /** The road tool is on: every tile of your land is outlined. */
  roadMode?: boolean;
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
/** A building's art on screen, for taps on its roof. */
export interface BuildingBox { id: number; left: number; top: number; right: number; bottom: number; depth: number; /** The middle of its art on screen. */ cx: number; cy: number; }
/** Tile coordinates to the plot grid the view uses: tile t spans [edge(t), edge(t + 1)]. */
export const tileEdge = (t: number): number => t / PARCEL - .5;
export const rectCentre = (r: Rect): { x: number; z: number } => ({ x: (tileEdge(r.x0) + tileEdge(r.x1 + 1)) / 2, z: (tileEdge(r.z0) + tileEdge(r.z1 + 1)) / 2 });
const rectPolygon = (ctx: CanvasRenderingContext2D, view: View, r: Rect, inset = 0) => floorPolygon(ctx, view, tileEdge(r.x0) + inset, tileEdge(r.z0) + inset, tileEdge(r.x1 + 1) - inset, tileEdge(r.z1 + 1) - inset);
/** Art is authored for a whole plot (about 60 px wide); a footprint is (w + d) × 8 px wide. */
const artScale = (w: number, d: number) => (w + d) / 7.2;
const PAD: Record<Building['kind'], string> = { restaurant: '#E7C9A4', branch: '#E7C9A4', kelpFarm: '#8FB47E', fishery: '#9DB4C4', homes: '#D8C2A8', garden: '#8F86B8', workshop: '#A9A39A' };
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
export function renderTown(ctx: Ctx, f: TownFrame): { labels: RegionLabel[]; buildings: BuildingBox[] } {
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
  const openPlots = new Set(plots.filter(p => canUnlock(town, p))), taken = occupancy(town), roads = roadSet(town), grid = f.roadMode || Boolean(f.draft) || s >= .8;
  const usedPlots = new Set<string>(); for (const key of taken.keys()) { const [x, z] = key.split(',').map(Number), p = parcelOf(x, z); usedPlots.add(`${p.x},${p.z}`); }
  for (const plot of plots) {
    const open = openPlots.has(plot), x0 = plot.x - .5 + GAP / 2, z0 = plot.z - .5 + GAP / 2, x1 = plot.x + .5 - GAP / 2, z1 = plot.z + .5 - GAP / 2;
    floorPolygon(ctx, view, x0, z0, x1, z1);
    ctx.fillStyle = plot.owned ? '#A9D8D0' : open ? 'rgba(255,242,215,.35)' : 'rgba(40,60,80,.28)'; ctx.fill();
    if (open) { ctx.setLineDash([5, 4]); ctx.strokeStyle = f.cash >= price(plot) ? '#4DF0FF' : 'rgba(233,230,255,.6)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
    if (!plot.owned) continue;
    // Roads, then (zoomed in, or while placing) the tile grid on your land.
    for (let tz = plot.z * PARCEL; tz < (plot.z + 1) * PARCEL; tz++) for (let tx = plot.x * PARCEL; tx < (plot.x + 1) * PARCEL; tx++) {
      if (!roads.has(`${tx},${tz}`)) continue;
      floorPolygon(ctx, view, tileEdge(tx), tileEdge(tz), tileEdge(tx + 1), tileEdge(tz + 1)); ctx.fillStyle = '#5B6684'; ctx.fill();
      if (s >= .8) { floorPolygon(ctx, view, tileEdge(tx) + .07, tileEdge(tz) + .07, tileEdge(tx + 1) - .07, tileEdge(tz + 1) - .07); ctx.strokeStyle = 'rgba(233,230,255,.22)'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    if (grid) {
      ctx.strokeStyle = f.roadMode || f.draft ? 'rgba(77,240,255,.45)' : 'rgba(18,15,46,.12)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 1; i < PARCEL; i++) {
        const a = toScreen(view, plot.x - .5 + i / PARCEL, plot.z - .5), b = toScreen(view, plot.x - .5 + i / PARCEL, plot.z + .5), c = toScreen(view, plot.x - .5, plot.z - .5 + i / PARCEL), d = toScreen(view, plot.x + .5, plot.z - .5 + i / PARCEL);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      }
      ctx.stroke();
    }
  }
  // Selection: the tapped building's footprint, or the tapped tile.
  const picked = selected ? buildingAt(town, selected.x, selected.z) : undefined;
  if (selected) {
    if (picked) rectPolygon(ctx, view, rectOf(picked), -.02); else floorPolygon(ctx, view, tileEdge(selected.x), tileEdge(selected.z), tileEdge(selected.x + 1), tileEdge(selected.z + 1));
    ctx.strokeStyle = '#FFE27A'; ctx.lineWidth = 3; ctx.stroke();
  }
  const regions = new Set(claimed.map(c => c.id)), visible = town.buildings.filter(b => regions.has(buildingRegion(b)) && b.id !== f.draft?.id);
  // Decor and buildings, back to front.
  const items: { depth: number; draw: () => void }[] = [], boxes: BuildingBox[] = [];
  for (const c of cells) {
    if (c.status === 'fog' || c.status === 'home') continue;
    const palette = PALETTES[regionAt(c.x, c.y).biome];
    for (const d of regionDecor(c.x, c.y, c.status === 'claimable')) items.push({ depth: depthOf(d.x, d.z), draw: () => at(ctx, view, d.x, d.z, 0, () => drawDecor(ctx, d, t, palette), c.status === 'claimable' ? .7 : 1) });
  }
  const drawPiece = (kind: Building['kind'], level: number, job: Building['job'], r: Rect, alpha = 1, wide = false, turned = false) => {
    const look = buildingLook(kind, level);
    rectPolygon(ctx, view, r, .03); ctx.globalAlpha = alpha; ctx.fillStyle = PAD[kind]; ctx.fill(); ctx.strokeStyle = 'rgba(18,15,46,.35)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    // The restaurant's grotto row is a rock annex; the hall stands on the other 3×3.
    let body = r;
    if (wide) {
      const annex: Rect = turned ? { ...r, z0: r.z1 } : { ...r, x0: r.x1 }; body = turned ? { ...r, z1: r.z1 - 1 } : { ...r, x1: r.x1 - 1 };
      const c = rectCentre(annex);
      at(ctx, view, c.x, c.z, 0, () => drawGrottoAnnex(ctx, t), alpha);
    }
    // A long footprint repeats its art along the long side, so a 3×2 farm reads as a long field, not a square.
    const w = body.x1 - body.x0 + 1, d = body.z1 - body.z0 + 1, along = w >= d, n = job?.kind === 'build' ? 1 : Math.max(1, Math.round(Math.max(w, d) / Math.min(w, d)));
    for (let i = 0; i < n; i++) {
      const part: Rect = along ? { ...body, x0: body.x0 + w * i / n, x1: body.x0 + w * (i + 1) / n - 1 } : { ...body, z0: body.z0 + d * i / n, z1: body.z0 + d * (i + 1) / n - 1 };
      const c = rectCentre(part), k = artScale(part.x1 - part.x0 + 1, part.z1 - part.z0 + 1) * (n > 1 ? .95 : 1);
      at(ctx, view, c.x, c.z, 0, () => {
        ctx.scale(k, k);
        if (job?.kind === 'build') { ctx.fillStyle = 'rgba(122,90,62,.8)'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2); ctx.fill(); }
        else if (!drawSprite(ctx, `building.${kind}.${look}`)) drawBuilding(ctx, kind, look, t);
        if (job) drawScaffold(ctx);
      }, alpha);
    }
  };
  for (const b of visible) {
    const r = rectOf(b), centre = rectCentre(r), { w, d } = footprint(b.kind, b.turned, b.wide), k = artScale(w, d), depth = depthOf(centre.x, centre.z);
    items.push({ depth, draw: () => drawPiece(b.kind, b.level, b.job, r, 1, b.wide, b.turned) });
    const p = toScreen(view, centre.x, centre.z);
    boxes.push({ id: b.id, left: p.x - 30 * k * s, right: p.x + 30 * k * s, top: p.y - 52 * k * s, bottom: p.y + 12 * k * s, depth, cx: p.x, cy: p.y - 16 * k * s });
  }
  // Town life on the roads: carts and walkers, drawn among the buildings so they pass behind them.
  if (s >= .5) {
    const night = f.night ?? 0;
    for (const a of stepTraffic(town, time, reduced)) {
      if (!regions.has(buildingRegion(a))) continue;
      const p = placeAgent(a);
      items.push({ depth: depthOf(p.x, p.z), draw: () => at(ctx, view, p.x, p.z, 0, () => a.kind === 'cart' ? drawCart(ctx, CART_COLORS[a.color], (p.dx - p.dz) * 32, (p.dx + p.dz) * 16, night) : drawWalker(ctx, WALKER_COLORS[a.color], t, a.seed)) });
    }
  }
  const draft = f.draft;
  if (draft) {
    const r = rectOf(draft.spot), centre = rectCentre(r);
    items.push({ depth: depthOf(centre.x, centre.z) + .01, draw: () => {
      drawPiece(draft.spot.kind, 1, null, r, .7, draft.spot.wide, draft.spot.turned);
      rectPolygon(ctx, view, r); ctx.fillStyle = draft.ok ? 'rgba(77,240,255,.28)' : 'rgba(255,92,108,.35)'; ctx.fill();
      ctx.setLineDash([6, 4]); ctx.strokeStyle = draft.ok ? '#4DF0FF' : '#FF5C6C'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
    } });
  }
  items.sort((a, b) => a.depth - b.depth).forEach(item => item.draw());
  const night = f.night ?? 0;
  if (night > 0) drawNight(ctx, f, night, visible.flatMap((b): Glow[] => {
    if (!activeLevel(b)) return [];
    const look = buildingLook(b.kind, b.level), glows: Glow[] = [], r = rectOf(b), c = rectCentre(r), k = artScale(r.x1 - r.x0 + 1, r.z1 - r.z0 + 1);
    if (b.kind === 'garden') glows.push({ ...toScreen(view, c.x, c.z, 12 * k), r: 52 * s * k, color: '165, 123, 255', strength: .2 + look * .1 });
    if (b.kind === 'restaurant' || b.kind === 'branch') glows.push({ ...toScreen(view, c.x, c.z, 10 * k), r: 26 * s * k, color: '255, 226, 122', strength: .4 });
    if (look === 3) glows.push({ ...toScreen(view, c.x, c.z, 30 * k), r: 58 * s * k, color: b.kind === 'homes' || b.kind === 'branch' ? '255, 226, 122' : '77, 240, 255', strength: .35 });
    return glows;
  }));
  // Badges after the buildings so they are never hidden: level, construction progress, no road, unlock price.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Zoomed far out only construction bars stay; the region labels carry the information. Prices need a closer look.
  const detail = s >= .6, close = s >= .9;
  for (const b of visible) {
    const r = rectOf(b), c = rectCentre(r), p = toScreen(view, c.x, c.z), k = artScale(r.x1 - r.x0 + 1, r.z1 - r.z0 + 1), u = Math.min(s, 1.1);
    if (b.job) {
      const span = b.job.endsAt - b.job.startedAt, done = span > 0 ? Math.min(1, (now - b.job.startedAt) / span) : 1, y = p.y - 66 * s * k;
      ctx.fillStyle = 'rgba(18,15,46,.9)'; ctx.beginPath(); ctx.roundRect(p.x - 30 * u, y - 9 * u, 60 * u, 18 * u, 9 * u); ctx.fill();
      ctx.fillStyle = '#4DF0FF'; ctx.beginPath(); ctx.roundRect(p.x - 28 * u, y + 5 * u, 56 * u * done, 2.5 * u, 1.5 * u); ctx.fill();
      if (detail) { ctx.fillStyle = '#E9E6FF'; ctx.font = `700 ${Math.max(9, 9 * u)}px Quicksand, sans-serif`; ctx.fillText(formatDuration(b.job.endsAt - now), p.x, y - 1 * u); }
    } else if (detail && (!connected(town, b) || 30 * s * k >= 24)) {
      // Level badges only once a building is big enough on screen to carry one; a missing road always shows.
      const y = p.y + 6 * s * k, off = !connected(town, b);
      ctx.fillStyle = off ? 'rgba(160,30,48,.92)' : 'rgba(18,15,46,.85)'; ctx.beginPath(); ctx.roundRect(p.x - (off ? 26 : 15) * u, y - 6 * u, (off ? 52 : 30) * u, 12 * u, 6 * u); ctx.fill();
      ctx.fillStyle = off ? '#FFF2D7' : '#FFE27A'; ctx.font = `700 ${Math.max(8, 8 * u)}px Quicksand, sans-serif`; ctx.fillText(off ? 'No road' : `Lv ${b.level}`, p.x, y + .5 * u);
    }
  }
  for (const plot of plots) {
    const p = toScreen(view, plot.x, plot.z), u = Math.min(s, 1.1);
    if (openPlots.has(plot) && close) {
      const cost = price(plot); ctx.fillStyle = f.cash >= cost ? '#E9E6FF' : 'rgba(233,230,255,.6)'; ctx.font = `700 ${Math.max(10, 13 * u)}px "Baloo 2", sans-serif`; ctx.fillText(fmt(cost), p.x, p.y);
    } else if (plot.owned && !usedPlots.has(`${plot.x},${plot.z}`) && detail && !f.draft && !f.roadMode) {
      // An empty plot of your own: a small + inviting a building.
      ctx.fillStyle = 'rgba(18,15,46,.45)'; ctx.beginPath(); ctx.arc(p.x, p.y, 10 * u, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4DF0FF'; ctx.font = `800 ${Math.max(11, 15 * u)}px "Baloo 2", sans-serif`; ctx.fillText('+', p.x, p.y + .5 * u);
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
  return { labels, buildings: boxes };
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
