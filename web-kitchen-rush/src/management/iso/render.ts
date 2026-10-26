import { accessPoints, localPoint, seatPoint } from '../layout';
import { CATALOG, HEIGHT, entrance, type Furniture, type Guest, type RestaurantState } from '../types';
import type { Ambience } from './ambience';
import { diamondPath, drawFurniture, drawMareen, drawMeal, drawStool, LOOKS, shadow, staffLook } from './placeholders';
import { depthOf, facing, toScreen, TILE_H, TILE_W, type ScreenPoint, type View } from './projection';
import { drawSprite, SPRITES, type SpriteKey } from './sprites';

/** Smoothed on-screen position for one agent; the engine moves in 0.1 s steps. */
export interface Tracked { x: number; z: number; walk: number; seen: number; }
export interface HitBox { id: number; left: number; top: number; right: number; bottom: number; }
export interface FrameInput {
  state: RestaurantState; view: View; width: number; height: number; columns: number;
  /** Where this canvas sits in the window, so the water gradient lines up with the page behind it. */
  windowTop: number; windowHeight: number;
  time: number; ambience: Ambience; reduced: boolean;
  building: boolean; draft: Furniture | null; draftValid: boolean; selected: number | null;
  tracked: Map<string, Tracked>;
}
export interface FrameOutput { anchors: Map<string, ScreenPoint>; hits: HitBox[]; }

export const WATER_TOP = '#7FD3DC', WATER_MID = '#2A8FB0', WATER_DEEP = '#0B3552';
const SEABED_MARGIN = 5;
type Ctx = CanvasRenderingContext2D;
interface Drawable { depth: number; draw: () => void; }
interface Decor { x: number; z: number; kind: 'kelp' | 'rock' | 'coral' | 'shell'; tint: number; }

/** Deterministic seabed decoration around the restaurant: a reef rim behind it, scattered life in front. */
export function seabedDecor(columns: number): Decor[] {
  const list: Decor[] = []; let seed = 1337 + columns;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let x = -1; x < columns + 1; x += .9) list.push({ x: x + rnd() * .3, z: -1.15 - rnd() * .5, kind: rnd() < .5 ? 'coral' : 'kelp', tint: rnd() });
  for (let z = 0; z < HEIGHT + 1; z += .9) list.push({ x: -1.15 - rnd() * .5, z: z + rnd() * .3, kind: rnd() < .5 ? 'coral' : 'kelp', tint: rnd() });
  for (let i = 0; i < 26; i++) {
    const x = -SEABED_MARGIN + rnd() * (columns + SEABED_MARGIN * 2), z = -SEABED_MARGIN + rnd() * (HEIGHT + SEABED_MARGIN * 2);
    const inside = x > -2 && x < columns + .8 && z > -2 && z < HEIGHT + .8;
    if (!inside) list.push({ x, z, kind: (['kelp', 'rock', 'shell', 'coral'] as const)[Math.floor(rnd() * 4)], tint: rnd() });
  }
  return list;
}
const decorCache = new Map<number, Decor[]>();

function at(ctx: Ctx, view: View, x: number, z: number, lift: number, body: () => void, alpha = 1): void {
  const p = toScreen(view, x, z, lift); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(view.scale, view.scale); if (alpha < 1) ctx.globalAlpha = alpha; body(); ctx.restore();
}
function floorPolygon(ctx: Ctx, view: View, x0: number, z0: number, x1: number, z1: number): void {
  const a = toScreen(view, x0, z0), b = toScreen(view, x1, z0), c = toScreen(view, x1, z1), d = toScreen(view, x0, z1);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
}

function drawWater(ctx: Ctx, f: FrameInput): void {
  const { width, height, windowTop, windowHeight, time, ambience, reduced, view } = f;
  const g = ctx.createLinearGradient(0, -windowTop, 0, windowHeight - windowTop);
  g.addColorStop(0, WATER_TOP); g.addColorStop(.45, WATER_MID); g.addColorStop(1, WATER_DEEP);
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  // Sun shafts from the surface.
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const sway = reduced ? 0 : Math.sin(time * .25 + i * 1.7) * 30, x = width * (i + .5) / 6 + sway, a = .05 + (reduced ? .02 : (Math.sin(time * .5 + i) + 1) * .025);
    const ray = ctx.createLinearGradient(0, -windowTop, 0, height * .9); ray.addColorStop(0, `rgba(230, 252, 255, ${a})`); ray.addColorStop(1, 'rgba(230, 252, 255, 0)');
    ctx.fillStyle = ray; ctx.beginPath(); ctx.moveTo(x - 18, -windowTop); ctx.lineTo(x + 26, -windowTop); ctx.lineTo(x + 140, height); ctx.lineTo(x + 40, height); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // Distant reef silhouettes, with a little parallax.
  const horizon = Math.min(height * .45, view.originY - 40 * view.scale), drift = (view.originX - width / 2) * .25;
  ctx.fillStyle = 'rgba(20, 90, 120, .45)'; ctx.beginPath(); ctx.moveTo(0, height);
  for (let i = 0; i <= 12; i++) { const x = i / 12 * width; ctx.lineTo(x, horizon + Math.sin(i * 1.9 + drift * .01) * 26 - (i % 3 === 1 ? 40 : 0)); }
  ctx.lineTo(width, height); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(12, 60, 90, .55)';
  for (const s of ambience.schools) for (let i = 0; i < s.count; i++) {
    const x = s.x * width + (i % 3) * s.size * 3 * Math.sign(s.speed) * -1 + drift * .3, y = s.y * height + Math.floor(i / 3) * s.size * 2 + (i % 2) * s.size;
    ctx.save(); ctx.translate(x, y); if (s.speed < 0) ctx.scale(-1, 1);
    ctx.beginPath(); ctx.ellipse(0, 0, s.size, s.size * .45, 0, 0, Math.PI * 2); ctx.moveTo(-s.size * .8, 0); ctx.lineTo(-s.size * 1.6, -s.size * .5); ctx.lineTo(-s.size * 1.6, s.size * .5); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}

function drawGround(ctx: Ctx, f: FrameInput): void {
  const { view, columns, time, reduced, state } = f, m = SEABED_MARGIN;
  floorPolygon(ctx, view, -m - .5, -m - .5, columns - .5 + m, HEIGHT - .5 + m); ctx.fillStyle = '#D9C49A'; ctx.fill();
  const center = toScreen(view, (columns - 1) / 2, (HEIGHT - 1) / 2), radius = (columns + m * 2) * TILE_W * .62 * view.scale;
  const fog = ctx.createRadialGradient(center.x, center.y, radius * .35, center.x, center.y, radius);
  fog.addColorStop(0, 'rgba(42, 143, 176, 0)'); fog.addColorStop(1, 'rgba(18, 88, 122, .95)'); ctx.fillStyle = fog;
  floorPolygon(ctx, view, -m - .5, -m - .5, columns - .5 + m, HEIGHT - .5 + m); ctx.fill();
  // Platform: thickness first, then tiles.
  const depth = 12 * view.scale, fl = toScreen(view, -.5, HEIGHT - .5), fr = toScreen(view, columns - .5, HEIGHT - .5), br = toScreen(view, columns - .5, -.5);
  ctx.fillStyle = '#8C5A4E'; ctx.beginPath(); ctx.moveTo(fl.x, fl.y); ctx.lineTo(fr.x, fr.y); ctx.lineTo(fr.x, fr.y + depth); ctx.lineTo(fl.x, fl.y + depth); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6E4339'; ctx.beginPath(); ctx.moveTo(fr.x, fr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(br.x, br.y + depth); ctx.lineTo(fr.x, fr.y + depth); ctx.closePath(); ctx.fill();
  for (let x = 0; x < columns; x++) for (let z = 0; z < HEIGHT; z++) {
    const kitchen = x < 5 && z < 4, p = toScreen(view, x, z);
    ctx.fillStyle = kitchen ? (x + z) % 2 ? '#E7DCC2' : '#F3EBD8' : ['#7CC2BE', '#86CAC3', '#73B9B8'][(x * 17 + z * 3) % 3];
    diamondPath(ctx, p.x, p.y, TILE_W / 2 * view.scale, TILE_H / 2 * view.scale); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, .18)'; ctx.lineWidth = 1; floorPolygon(ctx, view, -.5, -.5, columns - .5, HEIGHT - .5); ctx.stroke();
  // Caustics: drifting light on the floor.
  if (!reduced) {
    ctx.save(); floorPolygon(ctx, view, -.5, -.5, columns - .5, HEIGHT - .5); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
      const p = toScreen(view, (i * 3.7 + Math.sin(time * .3 + i) * 1.5) % columns, (i * 2.3 + Math.cos(time * .25 + i * 2) * 1.5) % HEIGHT);
      ctx.fillStyle = 'rgba(255, 255, 240, .07)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 46 * view.scale, 18 * view.scale, Math.sin(time * .2 + i) * .3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  const selected = state.furniture.find(item => item.id === f.selected);
  if (selected && !f.draft) { const n = CATALOG[selected.kind].size; ctx.strokeStyle = '#F2B743'; ctx.lineWidth = 3; floorPolygon(ctx, view, selected.x - .5, selected.z - .5, selected.x + n - .5, selected.z + n - .5); ctx.stroke(); }
}

function drawBuildGrid(ctx: Ctx, f: FrameInput): void {
  const { view, columns, draft, draftValid } = f;
  ctx.fillStyle = 'rgba(255, 242, 215, .12)';
  for (let x = 0; x < columns; x++) for (let z = 0; z < HEIGHT; z++) if ((x + z) % 2) { floorPolygon(ctx, view, x - .5, z - .5, x + .5, z + .5); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255, 242, 215, .7)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x <= columns; x++) { const a = toScreen(view, x - .5, -.5), b = toScreen(view, x - .5, HEIGHT - .5); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  for (let z = 0; z <= HEIGHT; z++) { const a = toScreen(view, -.5, z - .5), b = toScreen(view, columns - .5, z - .5); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  ctx.stroke();
  const e1 = toScreen(view, entrance.x - .3, entrance.z + .25), e2 = toScreen(view, entrance.x, entrance.z - .2), e3 = toScreen(view, entrance.x + .3, entrance.z + .25);
  ctx.strokeStyle = '#F2B743'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.lineTo(e3.x, e3.y); ctx.stroke();
  if (!draft) return;
  const n = CATALOG[draft.kind].size, color = draftValid ? '#3B9C98' : '#DC533C';
  ctx.setLineDash([6, 4]); ctx.strokeStyle = '#F2B743'; ctx.lineWidth = 2; ctx.beginPath();
  const g1 = toScreen(view, draft.x - .5, -.5), g2 = toScreen(view, draft.x - .5, HEIGHT - .5), g3 = toScreen(view, -.5, draft.z - .5), g4 = toScreen(view, columns - .5, draft.z - .5);
  ctx.moveTo(g1.x, g1.y); ctx.lineTo(g2.x, g2.y); ctx.moveTo(g3.x, g3.y); ctx.lineTo(g4.x, g4.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = draftValid ? 'rgba(59, 156, 152, .5)' : 'rgba(220, 83, 60, .5)'; floorPolygon(ctx, view, draft.x - .5, draft.z - .5, draft.x + n - .5, draft.z + n - .5); ctx.fill();
  ctx.strokeStyle = '#FFF2D7'; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  for (const p of accessPoints(draft)) { const s = toScreen(view, p.x, p.z); ctx.strokeStyle = draftValid ? '#F2B743' : '#DC533C'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(s.x, s.y, 10 * view.scale, 5 * view.scale, 0, 0, Math.PI * 2); ctx.stroke(); }
}

function drawDecor(ctx: Ctx, d: Decor, t: number): void {
  if (d.kind === 'rock') { shadow(ctx, 22, 9); ctx.fillStyle = d.tint > .5 ? '#6B7380' : '#59606C'; ctx.beginPath(); ctx.ellipse(0, -8, 20, 12, 0, Math.PI, 0); ctx.ellipse(0, 0, 20, 7, 0, 0, Math.PI); ctx.fill(); }
  else if (d.kind === 'shell') { ctx.fillStyle = d.tint > .5 ? '#F6D2C0' : '#F1E3C8'; ctx.beginPath(); ctx.moveTo(0, -2); ctx.arc(0, -2, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.closePath(); ctx.fill(); }
  else if (d.kind === 'coral') {
    const color = ['#E7746B', '#F2A65A', '#C45AA0', '#EE8DA9'][Math.floor(d.tint * 4)]; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 5;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 3, 0); ctx.quadraticCurveTo(i * 7, -14, i * 9 + Math.sin(t + i) * 1.5, -24 - (2 - Math.abs(i)) * 6); ctx.stroke(); }
  } else {
    ctx.strokeStyle = d.tint > .5 ? '#3C8A4A' : '#2F7340'; ctx.lineCap = 'round'; ctx.lineWidth = 6;
    for (let i = 0; i < 3; i++) { const h = 60 + d.tint * 50 + i * 12, sway = Math.sin(t * .9 + d.tint * 6 + i) * 8; ctx.beginPath(); ctx.moveTo(i * 6 - 6, 0); ctx.bezierCurveTo(i * 6 - 12, -h * .4, i * 6 + sway * .4, -h * .7, i * 6 - 6 + sway, -h); ctx.stroke(); }
  }
}

function drawPerson(ctx: Ctx, key: SpriteKey, flip: boolean, draw: () => void): void {
  ctx.save(); if (flip) ctx.scale(-1, 1);
  if (!drawSprite(ctx, key)) draw();
  ctx.restore();
}

/** Track agents toward their simulated position so 10 Hz engine steps render as smooth motion. */
function track(f: FrameInput, id: string, x: number, z: number, dt: number): Tracked {
  let t = f.tracked.get(id);
  if (!t || Math.hypot(t.x - x, t.z - z) > 2.5) { t = { x, z, walk: 0, seen: f.time }; f.tracked.set(id, t); }
  const k = 1 - Math.exp(-dt * 14), nx = t.x + (x - t.x) * k, nz = t.z + (z - t.z) * k;
  t.walk += Math.hypot(nx - t.x, nz - t.z) * 9; t.x = nx; t.z = nz; t.seen = f.time; return t;
}

/** Draw one complete frame. Reads simulation state; never changes it. */
export function renderFrame(ctx: Ctx, f: FrameInput, dt: number): FrameOutput {
  const { state, view, columns, time, reduced, building, draft } = f, t = reduced ? 0 : time;
  const anchors = new Map<string, ScreenPoint>(), hits: HitBox[] = [], items: Drawable[] = [];
  drawWater(ctx, f); drawGround(ctx, f); if (building) drawBuildGrid(ctx, f);
  let decor = decorCache.get(columns); if (!decor) { decor = seabedDecor(columns); decorCache.set(columns, decor); }
  for (const d of decor) items.push({ depth: depthOf(d.x, d.z), draw: () => at(ctx, view, d.x, d.z, 0, () => drawDecor(ctx, d, t)) });
  const working = new Set(state.staff.filter(s => s.task === 'cooking').map(s => s.stationId));
  for (const item of state.furniture) {
    if (item.id === draft?.id) continue;
    const n = CATALOG[item.kind].size, cx = item.x + (n - 1) / 2, cz = item.z + (n - 1) / 2, slot = SPRITES[`furniture.${item.kind}`];
    items.push({ depth: depthOf(cx, cz), draw: () => at(ctx, view, cx, cz, 0, () => { if (!drawSprite(ctx, `furniture.${item.kind}`)) drawFurniture(ctx, item.kind, t, working.has(item.id)); }) });
    const p = toScreen(view, cx, cz);
    hits.push({ id: item.id, left: p.x - n * TILE_W / 2 * view.scale, right: p.x + n * TILE_W / 2 * view.scale, top: p.y - slot.ay * view.scale, bottom: p.y + n * TILE_H / 2 * view.scale });
    if (item.kind === 'table') for (const seat of [0, 1]) { const s = seatPoint(item, seat); items.push({ depth: depthOf(s.x, s.z) - .01, draw: () => at(ctx, view, s.x, s.z, 0, () => { if (!drawSprite(ctx, 'furniture.stool')) drawStool(ctx); }) }); }
  }
  hits.sort((a, b) => a.bottom - b.bottom);
  const tableTop = (table: Furniture, seat: number) => localPoint(table, seat ? .82 : .18, .4);
  for (const guest of state.guests) if (guest.stage === 'eating') {
    const table = state.furniture.find(item => item.id === guest.tableId); if (!table) continue;
    const p = tableTop(table, guest.seat); items.push({ depth: depthOf(table.x + .5, table.z + .5) + .005, draw: () => at(ctx, view, p.x, p.z, 24, () => { if (!drawSprite(ctx, `meal.${guest.dish}`)) drawMeal(ctx, guest.dish); }) });
  }
  for (const key of state.dirty) {
    const [id, seat] = key.split(':').map(Number), table = state.furniture.find(item => item.id === id); if (!table) continue;
    const p = tableTop(table, seat); items.push({ depth: depthOf(table.x + .5, table.z + .5) + .005, draw: () => at(ctx, view, p.x, p.z, 24, () => { if (!drawSprite(ctx, 'meal.dirty')) drawMeal(ctx, 'dirty'); }) });
  }
  const seated = (g: Guest) => g.stage !== 'arriving' && g.stage !== 'leaving';
  for (const guest of state.guests) {
    const id = `customer-${guest.id}`, tr = track(f, id, guest.x, guest.z, dt), face = facing(guest.yaw), sit = seated(guest), bob = reduced ? 0 : sit ? Math.sin(time * 2 + guest.id) * .6 : Math.abs(Math.sin(tr.walk)) * 1.5;
    items.push({ depth: depthOf(tr.x, tr.z), draw: () => at(ctx, view, tr.x, tr.z, 0, () => drawPerson(ctx, `guest.${guest.look}.${face.back ? 'back' : 'front'}`, face.flip, () => drawMareen(ctx, LOOKS[guest.look], { back: face.back, seated: sit, walk: reduced ? 0 : tr.walk, bob }))) });
    anchors.set(id, toScreen(view, tr.x, tr.z, sit ? 54 : 62));
  }
  for (const member of state.staff) {
    const id = `employee-${member.id}`, tr = track(f, id, member.x, member.z, dt), face = facing(member.yaw), moving = member.route.length > 0, bob = reduced ? 0 : moving ? Math.abs(Math.sin(tr.walk)) * 1.5 : Math.sin(time * 2 + member.id) * .6;
    items.push({ depth: depthOf(tr.x, tr.z), draw: () => at(ctx, view, tr.x, tr.z, 0, () => drawPerson(ctx, `staff.${member.role}.${face.back ? 'back' : 'front'}`, face.flip, () => drawMareen(ctx, staffLook(member.role, member.id), { back: face.back, seated: false, walk: reduced || !moving ? 0 : tr.walk, bob, role: member.role, carrying: member.task === 'deliver' }))) });
    if (member.task === 'cooking') anchors.set(id, toScreen(view, tr.x, tr.z, member.role === 'chef' ? 76 : 64));
  }
  for (const [id, tr] of f.tracked) if (tr.seen !== time) f.tracked.delete(id);
  // Entrance arch and the restaurant's sign.
  items.push({ depth: depthOf(entrance.x, entrance.z + .62), draw: () => at(ctx, view, entrance.x, entrance.z + .62, 0, () => drawArch(ctx, t)) });
  items.push({ depth: depthOf(1.2, HEIGHT - .5 + .9), draw: () => at(ctx, view, 1.2, HEIGHT - .5 + .9, 0, () => drawSign(ctx, state.name)) });
  items.sort((a, b) => a.depth - b.depth).forEach(item => item.draw());
  if (draft) { const n = CATALOG[draft.kind].size, cx = draft.x + (n - 1) / 2, cz = draft.z + (n - 1) / 2; at(ctx, view, cx, cz, 0, () => { if (!drawSprite(ctx, `furniture.${draft.kind}`)) drawFurniture(ctx, draft.kind, t); }, .72); }
  drawParticles(ctx, f);
  return { anchors, hits };
}

function drawArch(ctx: Ctx, t: number): void {
  for (const side of [-1, 1]) { ctx.save(); ctx.translate(side * 15, side * 7.5); shadow(ctx, 8, 4); ctx.fillStyle = '#E7846F'; ctx.beginPath(); ctx.roundRect(-4, -46, 8, 46, 4); ctx.fill(); ctx.restore(); }
  ctx.strokeStyle = '#F2B743'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-15, -50); ctx.quadraticCurveTo(0, -70, 15, -35); ctx.stroke();
  ctx.fillStyle = '#FFF2D7'; for (let i = 0; i < 5; i++) { const k = i / 4, x = -15 + 30 * k, y = -50 + 15 * k - Math.sin(k * Math.PI) * 10 + Math.sin(t * 2 + i) * .6; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }
}
function drawSign(ctx: Ctx, name: string): void {
  shadow(ctx, 30, 8);
  ctx.fillStyle = '#6E4B36'; ctx.fillRect(-2, -26, 4, 26);
  ctx.font = '700 11px Fredoka, sans-serif'; const w = Math.min(150, ctx.measureText(name).width + 20);
  ctx.fillStyle = '#8C6447'; ctx.beginPath(); ctx.roundRect(-w / 2, -44, w, 20, 6); ctx.fill();
  ctx.fillStyle = '#FFF2D7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, 0, -34, w - 12);
}
function drawParticles(ctx: Ctx, f: FrameInput): void {
  const { width, height, ambience } = f;
  ctx.save();
  for (const m of ambience.motes) { ctx.fillStyle = 'rgba(235, 250, 255, .35)'; ctx.fillRect(m.x * width, m.y * height, m.size, m.size); }
  ctx.strokeStyle = 'rgba(235, 252, 255, .6)'; ctx.lineWidth = 1.2;
  for (const b of ambience.bubbles) { const x = b.x * width + Math.sin(ambience.time * 2 + b.phase) * 4; ctx.beginPath(); ctx.arc(x, b.y * height, b.r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

/** The topmost furniture under a screen point, using drawn bounds so tall pieces are easy to tap. */
export function furnitureAt(hits: HitBox[], x: number, y: number): number | null {
  for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (x >= h.left && x <= h.right && y >= h.top && y <= h.bottom) return h.id; }
  return null;
}
