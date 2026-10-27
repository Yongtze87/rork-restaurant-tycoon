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
export function drawStool(ctx: Ctx): void {
  shadow(ctx, 12, 6);
  ctx.fillStyle = '#C98F6A'; ctx.fillRect(-3, -9, 6, 9);
  ctx.fillStyle = '#F2C9A5'; ctx.beginPath(); ctx.ellipse(0, -10, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#D9A580'; ctx.lineWidth = 1; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(i * 4.5, -6); ctx.stroke(); }
}
export function drawMeal(ctx: Ctx, dish: Dish | 'dirty'): void {
  ctx.fillStyle = dish === 'dirty' ? '#BFB7A6' : '#FFFFFF'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  if (dish === 'salad') { ctx.fillStyle = '#4FA45A'; for (const [x, y] of [[-3, -1], [2, -2], [0, 1], [4, 0]]) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#7E3F8F'; ctx.beginPath(); ctx.arc(-1, -1, 1.3, 0, Math.PI * 2); ctx.fill(); }
  else if (dish === 'burger') { ctx.fillStyle = '#D9953C'; ctx.beginPath(); ctx.ellipse(0, -1.5, 5.5, 3.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#F3C46A'; ctx.beginPath(); ctx.ellipse(-1, -2.5, 3, 1.4, 0, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.fillStyle = '#8E8676'; ctx.beginPath(); ctx.arc(-2, 0, .9, 0, Math.PI * 2); ctx.arc(2, -1, .8, 0, Math.PI * 2); ctx.fill(); }
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
