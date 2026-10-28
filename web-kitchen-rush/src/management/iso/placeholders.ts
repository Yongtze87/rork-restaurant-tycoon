import type { Dish, FurnitureKind, Role } from '../types';
import type { Look } from './sprites';

/**
 * Stand-in art drawn with canvas shapes, in art pixels around a floor anchor (0, 0).
 * Every function here is replaced by a generated image once its sprite slot has a `src`.
 */
type Ctx = CanvasRenderingContext2D;

export function diamondPath(ctx: Ctx, cx: number, cy: number, hw: number, hh: number): void {
  ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath();
}
/** A block whose footprint is `cells` tiles square, centered on the anchor. */
export function isoBlock(ctx: Ctx, cells: number, height: number, top: string, left: string, right: string): void {
  const hw = cells * 32, hh = cells * 16;
  ctx.fillStyle = left; ctx.beginPath(); ctx.moveTo(-hw, -height); ctx.lineTo(0, hh - height); ctx.lineTo(0, hh); ctx.lineTo(-hw, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = right; ctx.beginPath(); ctx.moveTo(hw, -height); ctx.lineTo(0, hh - height); ctx.lineTo(0, hh); ctx.lineTo(hw, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = top; diamondPath(ctx, 0, -height, hw, hh); ctx.fill();
}
export function shadow(ctx: Ctx, rx: number, ry: number, alpha = .22): void {
  ctx.fillStyle = `rgba(6, 30, 48, ${alpha})`; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
function rock(ctx: Ctx, rx: number, ry: number, color = '#5B6470'): void {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, -ry * .6, rx, ry, 0, Math.PI, 0); ctx.lineTo(rx, 0); ctx.ellipse(0, 0, rx, ry * .55, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
}

type FurnitureLook = 1 | 2 | 3;
/** Per-look colours: look 1 is the starter piece, 2 brighter, 3 the richest. */
const TABLE = [['#B4584A', '#C9634F', '#EE8D73', '#F7B39B'], ['#B65A73', '#D06F86', '#F59AAE', '#FFD0DA'], ['#B07A3A', '#D49A4C', '#FFC978', '#FFF0C4']];
const PREP = [['#E3DCC8', '#9AA5A0', '#7B8884'], ['#EAF4EE', '#8FB8B0', '#6F9C95'], ['#F7F1E4', '#B9A4D8', '#9A82C0']];
const GRILL = [['#4A4552', '#2F2C36', '#25222B'], ['#5A4A48', '#8A5A3C', '#6E452E'], ['#3E3A5A', '#B07A3A', '#8C5E2A']];
const PLANT = [['#E26B9C', '#C9508A', '#FFC4DC'], ['#FF7FB0', '#E25C9E', '#FFE0EE'], ['#B58CFF', '#8F66E8', '#9FFFF4']];
const KELP = [['#4FA45A', '#357F45', '#9BCB6A'], ['#5FC06A', '#3E9A50', '#C6EB86'], ['#4DD9B0', '#2FA88C', '#BFFFF0']];
/** Booth looks: [dais top, dais side, table rim, table top, glow]. */
const BOOTH_LOOKS = [['#3E3866', '#2A2648', '#4B3F7A', '#6C5BB0', '120, 240, 230'], ['#2F5F6E', '#1F4450', '#2F7C86', '#4FB7B4', '160, 140, 255'], ['#5A4470', '#3A2B4E', '#B07A3A', '#FFC978', '255, 214, 140']];
const JELLY = [['rgba(190, 240, 255, .55)', 'rgba(214, 246, 255, .92)'], ['rgba(255, 200, 240, .6)', 'rgba(255, 226, 246, .94)'], ['rgba(255, 230, 150, .7)', 'rgba(255, 244, 206, .96)']];
/** A row of pearls along the front half of an ellipse: the look-2 and look-3 trim. */
function pearlTrim(ctx: Ctx, cy: number, rx: number, ry: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = Math.PI * (i + .5) / count, x = Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    ctx.fillStyle = '#FFF6E8'; ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .9)'; ctx.beginPath(); ctx.arc(x - .7, y - .7, .7, 0, Math.PI * 2); ctx.fill();
  }
}
/** The soft look-3 halo behind a piece. */
function softGlow(ctx: Ctx, cy: number, r: number, color = '120, 240, 230'): void {
  const g = ctx.createRadialGradient(0, cy, 2, 0, cy, r); g.addColorStop(0, `rgba(${color}, .35)`); g.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, cy, r, 0, Math.PI * 2); ctx.fill();
}

/** Furniture stand-ins. `t` is seconds for idle sway; `active` lights a working station; `look` is the upgrade look (1–3). */
export function drawFurniture(ctx: Ctx, kind: FurnitureKind, t: number, active = false, look: FurnitureLook = 1): void {
  const i3 = look - 1;
  if (kind === 'table') {
    const [leg, rim, top, spot] = TABLE[i3];
    if (look === 3) softGlow(ctx, -22, 58, '255, 214, 140');
    shadow(ctx, 44, 20, .18);
    ctx.fillStyle = leg; ctx.fillRect(-6, -20, 12, 20);
    ctx.fillStyle = rim; ctx.beginPath(); ctx.ellipse(0, -19, 46, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = top; ctx.beginPath(); ctx.ellipse(0, -24, 46, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = spot; for (const [x, y, r] of [[-18, -28, 4], [10, -18, 3], [22, -30, 2.5], [-4, -34, 2]]) { ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2); ctx.fill(); }
    if (look > 1) pearlTrim(ctx, -21, 45, 21, look === 3 ? 13 : 9);
  } else if (kind === 'booth') {
    const [dais, side, rim, top, glow] = BOOTH_LOOKS[i3];
    shadow(ctx, 60, 28, .25); softGlow(ctx, -22, 54 + i3 * 6, glow);
    isoBlock(ctx, 1.8, 5, dais, side, side);
    ctx.fillStyle = side; ctx.fillRect(-7, -21, 14, 16);
    ctx.fillStyle = rim; ctx.beginPath(); ctx.ellipse(0, -19, 44, 21, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = top; ctx.beginPath(); ctx.ellipse(0, -24, 44, 21, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(${glow}, .8)`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, -24, 38, 17, 0, 0, Math.PI * 2); ctx.stroke();
    crystal(ctx, 0, -30, 5, look === 3 ? '#FFE3A3' : '#9FFFF4', t);
    pearlTrim(ctx, -21, 43, 20, 7 + i3 * 3);
  } else if (kind === 'prep') {
    const [top, left, right] = PREP[i3];
    if (look === 3) softGlow(ctx, -24, 40);
    shadow(ctx, 30, 14);
    isoBlock(ctx, .85, 26, top, left, right);
    ctx.fillStyle = look === 3 ? '#E3B36A' : '#C79A62'; diamondPath(ctx, -4, -27, 12, 6); ctx.fill();
    ctx.strokeStyle = KELP[i3][1]; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const dx of look > 1 ? [6, 11, 16] : [8, 14]) { ctx.beginPath(); ctx.moveTo(dx - 6, -24); ctx.quadraticCurveTo(dx, -34, dx + 4, -26); ctx.stroke(); }
    if (look > 1) pearlTrim(ctx, -26, 26, 13, look === 3 ? 9 : 6);
  } else if (kind === 'grill') {
    const [top, left, right] = GRILL[i3];
    if (look === 3) softGlow(ctx, -22, 42, '255, 170, 100');
    shadow(ctx, 30, 14);
    isoBlock(ctx, .85, 20, top, left, right);
    const glow = (active ? .75 + Math.sin(t * 6) * .2 : .45) + i3 * .1;
    const g = ctx.createRadialGradient(0, -21, 2, 0, -21, 22 + i3 * 4); g.addColorStop(0, `rgba(255, 214, 120, ${glow})`); g.addColorStop(1, 'rgba(240, 110, 60, 0)');
    ctx.fillStyle = g; diamondPath(ctx, 0, -21, 24, 12); ctx.fill();
    ctx.strokeStyle = `rgba(255, 150, 80, ${glow})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-12, -22); ctx.lineTo(-2, -19); ctx.lineTo(6, -24); ctx.lineTo(13, -20); ctx.stroke();
    if (look > 1) pearlTrim(ctx, -20, 26, 13, look === 3 ? 9 : 6);
    if (active) { ctx.fillStyle = 'rgba(220, 245, 255, .7)'; for (let i = 0; i < 3; i++) { const k = (t * .8 + i / 3) % 1; ctx.beginPath(); ctx.arc(Math.sin(t * 3 + i) * 4, -26 - k * 26, 1.5 + k * 1.5, 0, Math.PI * 2); ctx.fill(); } }
  } else if (kind === 'plant') {
    const [a1, a2, tip] = PLANT[i3], fronds = 9 + i3 * 2;
    if (look === 3) softGlow(ctx, -26, 36, '170, 140, 255');
    shadow(ctx, 20, 9); rock(ctx, 16, 8, look === 1 ? '#6A6F7C' : '#7A7F8E');
    ctx.lineCap = 'round';
    for (let i = 0; i < fronds; i++) {
      const a = (i / (fronds - 1) - .5) * 1.9, sway = Math.sin(t * 1.4 + i * .7) * 3, tipX = Math.sin(a) * (18 + i3 * 2) + sway, tipY = -14 - Math.cos(a) * (22 + i3 * 3);
      ctx.strokeStyle = i % 2 ? a1 : a2; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(Math.sin(a) * 4, -8); ctx.quadraticCurveTo(Math.sin(a) * 10, -16, tipX, tipY); ctx.stroke();
      ctx.fillStyle = tip; ctx.beginPath(); ctx.arc(tipX, tipY, 2.6 + i3 * .4, 0, Math.PI * 2); ctx.fill();
    }
    if (look > 1) pearlTrim(ctx, -3, 16, 7, look === 3 ? 7 : 5);
  } else if (kind === 'divider') {
    const [k1, k2, leaf] = KELP[i3], blades = 4 + i3;
    if (look === 3) softGlow(ctx, -48, 46);
    shadow(ctx, 24, 11); rock(ctx, 20, 9, look === 1 ? '#5E6672' : '#6E7684');
    ctx.lineCap = 'round';
    for (let i = 0; i < blades; i++) {
      const x = -15 + i * 30 / (blades - 1), h = 70 + (i % 2) * 14, sway = Math.sin(t * 1.1 + i) * 6;
      ctx.strokeStyle = i % 2 ? k1 : k2; ctx.lineWidth = 6 - i3;
      ctx.beginPath(); ctx.moveTo(x, -6); ctx.bezierCurveTo(x - 6, -h * .35, x + 6 + sway * .5, -h * .7, x + sway, -h); ctx.stroke();
      ctx.fillStyle = leaf; ctx.beginPath(); ctx.ellipse(x + sway * .6 + 3, -h * .62, 3 + i3 * .5, 2 + i3 * .5, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (look > 1) pearlTrim(ctx, -4, 20, 9, look === 3 ? 8 : 6);
  } else {
    const [halo, bell] = JELLY[i3], r = 34 + i3 * 6;
    shadow(ctx, 18, 8); rock(ctx, 12, 6, '#5E6672');
    const bob = Math.sin(t * 1.6) * 2;
    ctx.strokeStyle = look === 3 ? '#B07A3A' : '#2B3F4A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -62 + bob); ctx.stroke();
    const glow = ctx.createRadialGradient(0, -72 + bob, 2, 0, -72 + bob, r); glow.addColorStop(0, halo); glow.addColorStop(1, 'rgba(120, 220, 255, 0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -72 + bob, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(200, 240, 255, .8)'; ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 4, -68 + bob); ctx.quadraticCurveTo(i * 4 + Math.sin(t * 2 + i) * 3, -60 + bob, i * 4, -54 + bob); ctx.stroke(); }
    ctx.fillStyle = bell; ctx.beginPath(); ctx.ellipse(0, -70 + bob, 13 + i3, 10 + i3, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .8)'; ctx.beginPath(); ctx.ellipse(-4, -75 + bob, 4, 2.5, -.4, 0, Math.PI * 2); ctx.fill();
    if (look > 1) pearlTrim(ctx, -70 + bob, 13 + i3, 3, look === 3 ? 7 : 5);
  }
}
/** One glowing crystal point standing at (x, y): `h` tall. */
function crystal(ctx: Ctx, x: number, y: number, h: number, color: string, t: number): void {
  const w = h * .32;
  const alpha = ctx.globalAlpha; ctx.globalAlpha = alpha * (.55 + Math.sin(t * 1.8 + x) * .15); softGlowAt(ctx, x, y - h * .5, h * 1.4, color); ctx.globalAlpha = alpha;
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x - w, y - h * .7); ctx.lineTo(x, y - h * 1.15); ctx.lineTo(x + w, y - h * .7); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, .55)'; ctx.beginPath(); ctx.moveTo(x - w * .2, y - 1); ctx.lineTo(x - w * .2, y - h * .72); ctx.lineTo(x, y - h * 1.05); ctx.lineTo(x + w * .45, y - h * .7); ctx.lineTo(x + w * .45, y - 1); ctx.closePath(); ctx.fill();
}
function softGlowAt(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
/** The booth's scallop-shell canopy, drawn at its back corner so seated guests stay in front. */
export function drawBoothBack(ctx: Ctx, look: FurnitureLook = 1): void {
  const ribs = 7, [shellA, shellB] = look === 3 ? ['#E8B65E', '#C98F3E'] : look === 2 ? ['#4FB7B4', '#2F8C8E'] : ['#7A62C2', '#5A479A'];
  for (let i = 0; i < ribs; i++) {
    const a0 = Math.PI * (1 + i / ribs), a1 = Math.PI * (1 + (i + 1) / ribs);
    ctx.fillStyle = i % 2 ? shellA : shellB; ctx.beginPath(); ctx.moveTo(0, -4);
    ctx.lineTo(Math.cos(a0) * 44, -4 + Math.sin(a0) * 52); ctx.quadraticCurveTo(Math.cos((a0 + a1) / 2) * 51, -4 + Math.sin((a0 + a1) / 2) * 59, Math.cos(a1) * 44, -4 + Math.sin(a1) * 52); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255, 246, 232, .55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, -4, 46, 54, 0, Math.PI, 0); ctx.stroke();
  pearlTrim(ctx, -6, 14, -6, 5);
}
/** A plush seat for booth guests. */
export function drawCushion(ctx: Ctx): void {
  shadow(ctx, 12, 6);
  ctx.fillStyle = '#3A2B5E'; ctx.fillRect(-9, -9, 18, 8);
  ctx.fillStyle = '#8F6FE0'; ctx.beginPath(); ctx.ellipse(0, -10, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, .35)'; ctx.beginPath(); ctx.ellipse(-3, -12, 5, 2, -.2, 0, Math.PI * 2); ctx.fill();
}
/** East grotto set pieces: a crystal cluster, a fallen boulder, a rock pillar of the cave arch and the arch's lintel. */
export function drawCrystals(ctx: Ctx, t: number, lit: boolean, seed: number): void {
  shadow(ctx, 16, 7, .3);
  ctx.globalAlpha = lit ? 1 : .35;
  const colors = ['#A57BFF', '#5FF2E0', '#C9A8FF'];
  for (let i = 0; i < 3; i++) crystal(ctx, (i - 1) * 8 + (seed % 3), -(i === 1 ? 2 : 0), [18, 30, 22][i] * (.8 + (seed % 5) * .08), colors[(i + seed) % 3], lit ? t : 0);
  ctx.globalAlpha = 1;
}
export function drawBoulder(ctx: Ctx, size: number, tint: number): void {
  shadow(ctx, 22 * size, 9 * size, .3); rock(ctx, 20 * size, 13 * size, tint > .5 ? '#3E4656' : '#353C4B');
  ctx.fillStyle = 'rgba(255, 255, 255, .08)'; ctx.beginPath(); ctx.ellipse(-6 * size, -11 * size, 7 * size, 3 * size, -.3, 0, Math.PI * 2); ctx.fill();
}
export function drawArchPillar(ctx: Ctx, t: number, lit: boolean): void {
  shadow(ctx, 18, 8, .3);
  for (const [y, rx, ry, color] of [[-8, 15, 10, '#2E2A48'], [-26, 12, 11, '#3A3460'], [-44, 10, 10, '#433C6E'], [-60, 9, 9, '#3A3460']] as const) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(160, 130, 255, .35)'; ctx.beginPath(); ctx.ellipse(-4, -46, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
  for (const [x, y] of [[5, -20], [-6, -34], [4, -54]]) { ctx.fillStyle = `rgba(120, 255, 235, ${lit ? .6 + Math.sin(t * 2 + y) * .3 : .2})`; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
}
/** Lintel between two pillars at (dx, dy) and (-dx, -dy) around the arch's midpoint. */
export function drawArchLintel(ctx: Ctx, dx: number, dy: number, t: number, lit: boolean): void {
  ctx.lineCap = 'round'; ctx.strokeStyle = '#3A3460'; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(dx, dy - 62); ctx.quadraticCurveTo(0, -96, -dx, -dy - 62); ctx.stroke();
  ctx.strokeStyle = '#4B4380'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(dx, dy - 66); ctx.quadraticCurveTo(0, -101, -dx, -dy - 66); ctx.stroke();
  // Stalactites and hanging glow drops along the underside.
  for (let i = 1; i < 6; i++) {
    const k = i / 6, x = dx * (1 - 2 * k), y = (dy - 62) * (1 - k) * (1 - k) + 2 * (1 - k) * k * -96 + k * k * (-dy - 62) + 5;
    ctx.fillStyle = '#2E2A48'; ctx.beginPath(); ctx.moveTo(x - 3, y - 2); ctx.lineTo(x, y + 6 + (i % 2) * 5); ctx.lineTo(x + 3, y - 2); ctx.closePath(); ctx.fill();
    if (i % 2) { const a = lit ? .65 + Math.sin(t * 1.6 + i) * .25 : .2; ctx.fillStyle = `rgba(150, 255, 240, ${a})`; ctx.beginPath(); ctx.arc(x, y + 14 + (i % 3) * 2, 2, 0, Math.PI * 2); ctx.fill(); }
  }
  crystal(ctx, 0, -98, 12, lit ? '#9FFFF4' : '#5C6A78', lit ? t : 0);
}
/** "East grotto" plaque with a padlock, shown on the locked rock shelf. */
export function drawLockedSign(ctx: Ctx): void {
  shadow(ctx, 22, 7, .3);
  ctx.fillStyle = '#4A3A30'; ctx.fillRect(-2, -26, 4, 26);
  ctx.font = '700 11px Fredoka, sans-serif'; const w = ctx.measureText('East grotto').width + 34;
  ctx.fillStyle = '#5E4A3A'; ctx.beginPath(); ctx.roundRect(-w / 2, -46, w, 22, 6); ctx.fill();
  ctx.fillStyle = '#F2B743'; ctx.beginPath(); ctx.roundRect(-w / 2 + 7, -36, 10, 8, 2); ctx.fill();
  ctx.strokeStyle = '#F2B743'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(-w / 2 + 12, -37, 3.2, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = '#FFF2D7'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('East grotto', 9, -35);
}
export function drawStool(ctx: Ctx): void {
  shadow(ctx, 12, 6);
  ctx.fillStyle = '#C98F6A'; ctx.fillRect(-3, -9, 6, 9);
  ctx.fillStyle = '#F2C9A5'; ctx.beginPath(); ctx.ellipse(0, -10, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#D9A580'; ctx.lineWidth = 1; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(i * 4.5, -6); ctx.stroke(); }
}
const dot = (ctx: Ctx, x: number, y: number, r: number, color: string): void => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
const blob = (ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string, rotation = 0): void => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); ctx.fill(); };
/** One simple, recognisable plate per dish. Deeper dishes sit on darker plates. */
export function drawMeal(ctx: Ctx, dish: Dish | 'dirty'): void {
  const plate = dish === 'dirty' ? '#BFB7A6' : dish === 'pearlDumplings' || dish === 'inkNoodles' ? '#3A3550' : dish === 'jellySalad' || dish === 'squidSkewers' ? '#C9D6F2' : '#FFFFFF';
  blob(ctx, 0, 0, 9, 4.5, plate);
  if (dish === 'salad') { for (const [x, y] of [[-3, -1], [2, -2], [0, 1], [4, 0]]) dot(ctx, x, y, 2.4, '#4FA45A'); dot(ctx, -1, -1, 1.3, '#7E3F8F'); }
  else if (dish === 'burger') { blob(ctx, 0, -1.5, 5.5, 3.2, '#D9953C'); blob(ctx, -1, -2.5, 3, 1.4, '#F3C46A'); }
  else if (dish === 'sushi') { for (const x of [-3.5, 3.5]) { blob(ctx, x, -1, 3.2, 2.2, '#F7F3EA'); blob(ctx, x, -2.4, 2.8, 1.2, '#F08A6E'); dot(ctx, x, -3.4, .9, '#5FB86A'); } }
  else if (dish === 'lobster') {
    blob(ctx, 0, -1.5, 5, 2.6, '#D9483B'); blob(ctx, -.5, -2.4, 3, 1.1, '#F2735E');
    for (const side of [-1, 1]) dot(ctx, side * 6, -3, 1.8, '#C23A2F');
  }
  else if (dish === 'jellySalad') { for (const [x, y] of [[-3, 0], [3, -.5]]) dot(ctx, x, y, 2, '#3E8E4E'); ctx.globalAlpha = .75; blob(ctx, 0, -2, 5, 3, '#BFE9FF'); ctx.globalAlpha = 1; dot(ctx, -1.5, -3, .9, '#FFFFFF'); }
  else if (dish === 'squidSkewers') {
    ctx.strokeStyle = '#B08A5A'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7, 1); ctx.lineTo(7, -3); ctx.moveTo(-7, 3); ctx.lineTo(7, -1); ctx.stroke();
    for (const [x, y] of [[-3.5, -.2], [0, -1.2], [3.5, -2.2], [-3.5, 1.8], [0, .8], [3.5, -.2]]) dot(ctx, x, y, 1.6, '#9C7BE0');
    dot(ctx, 0, -1.2, .7, '#E3F7FF');
  }
  else if (dish === 'pearlDumplings') { for (const [x, y] of [[-3.5, -.5], [3.5, -.5], [0, -2.5]]) { blob(ctx, x, y, 2.8, 2.1, '#F2EEE6'); dot(ctx, x - .8, y - .8, .7, '#BDF4FF'); } }
  else if (dish === 'inkNoodles') {
    blob(ctx, 0, -1.2, 6, 3, '#14121E');
    ctx.strokeStyle = '#3B3656'; ctx.lineWidth = .8; for (const r of [1.5, 3, 4.5]) { ctx.beginPath(); ctx.ellipse(0, -1.2, r, r / 2, 0, 0, Math.PI * 1.6); ctx.stroke(); }
    for (const [x, y] of [[-2.5, -2], [2, -.5], [3.5, -2.5]]) dot(ctx, x, y, .7, '#4DF0FF');
  }
  else { dot(ctx, -2, 0, .9, '#8E8676'); dot(ctx, 2, -1, .8, '#8E8676'); }
}

/** Mareen palettes: fully human, with small fin-like ears. */
export const LOOKS: Record<Look, { skin: string; hair: string; outfit: string; fin: string }> = {
  coral: { skin: '#E9B796', hair: '#7A2E2A', outfit: '#E8806A', fin: '#F4A6A0' },
  pearl: { skin: '#F3D3BE', hair: '#E6E1D6', outfit: '#9FB6E0', fin: '#CDE7F4' },
  lagoon: { skin: '#B98A64', hair: '#1F3B4D', outfit: '#3FA7A0', fin: '#7FD8CF' },
  dusk: { skin: '#7C5640', hair: '#2A1B2E', outfit: '#7B5EA7', fin: '#B49BE0' },
};
const STAFF_SKIN = ['#E2B08C', '#C48E6A', '#8E6247', '#F0CDB3'], STAFF_HAIR = ['#3B2A20', '#1C2A3A', '#8A4B2A', '#D8C7A0'];
export function staffLook(role: Role, id: number) {
  return { skin: STAFF_SKIN[id % 4], hair: STAFF_HAIR[(id + 1) % 4], outfit: role === 'chef' ? '#F7F3EA' : '#224F4A', fin: '#6FD3C8' };
}
export interface PersonPose { back: boolean; seated: boolean; walk: number; bob: number; role?: Role; carrying?: boolean; }

/** A Mareen facing down-right (front) or up-right (back); callers mirror for the left-hand views. */
export function drawMareen(ctx: Ctx, look: { skin: string; hair: string; outfit: string; fin: string }, pose: PersonPose): void {
  const { back, seated, walk, bob, role, carrying } = pose, lift = (seated ? -8 : 0) - bob;
  shadow(ctx, 11, 5);
  ctx.save(); ctx.translate(0, -lift);
  if (!seated) {
    const swing = Math.sin(walk) * 3;
    ctx.fillStyle = '#2E3B4A'; ctx.fillRect(-5, -14 + Math.max(0, swing) * .4, 4, 14 - Math.max(0, swing) * .4); ctx.fillRect(1, -14 + Math.max(0, -swing) * .4, 4, 14 - Math.max(0, -swing) * .4);
  }
  ctx.fillStyle = look.outfit; ctx.beginPath(); ctx.roundRect(-8, -31, 16, 18, 5); ctx.fill();
  if (role === 'server') { ctx.fillStyle = '#FFF2D7'; ctx.fillRect(-5, -24, 10, 10); }
  if (role === 'chef') { ctx.fillStyle = '#D9D2C2'; ctx.fillRect(-1, -29, 2, 12); }
  ctx.fillStyle = look.skin; ctx.fillRect(-11, -28, 3, 10); ctx.fillRect(8, -28, 3, carrying ? 6 : 10);
  if (carrying) { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(12, -24, 7, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#E8A04A'; ctx.beginPath(); ctx.arc(12, -26, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = look.skin; ctx.beginPath(); ctx.arc(1, -38, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = look.fin; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(1 + side * 7, -41); ctx.lineTo(1 + side * 13, -45); ctx.lineTo(1 + side * 12, -37); ctx.lineTo(1 + side * 7, -35); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = look.hair;
  if (back) { ctx.beginPath(); ctx.arc(1, -38.5, 8.3, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-6, -38, 14, 7); }
  else {
    ctx.beginPath(); ctx.arc(1, -39, 8.4, Math.PI * .95, Math.PI * 2.05); ctx.fill(); ctx.fillRect(-7, -40, 4, 8);
    ctx.fillStyle = '#233D3B'; ctx.beginPath(); ctx.arc(1, -37, 1.1, 0, Math.PI * 2); ctx.arc(5.5, -37, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9C4F45'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(3.5, -34, 2, .2, Math.PI - .2); ctx.stroke();
  }
  if (role === 'chef') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-5, -52, 12, 7); for (const x of [-3, 1, 5]) { ctx.beginPath(); ctx.arc(x, -53, 4, 0, Math.PI * 2); ctx.fill(); } }
  ctx.restore();
}
