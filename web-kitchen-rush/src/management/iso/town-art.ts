import type { BuildingKind } from '../town';
import { diamondPath, isoBlock, shadow } from './placeholders';

/**
 * Stand-in town buildings, in art pixels around the plot centre (one plot is 64×32).
 * Each kind has three looks (levels 1–5, 6–10, 11–15); generated art replaces these per look.
 */
type Ctx = CanvasRenderingContext2D;
type Look = 1 | 2 | 3;

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, strength: number): void {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, color.replace('A', String(strength))); g.addColorStop(1, color.replace('A', '0'));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function dome(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rim = 'rgba(255,255,255,.55)'): void {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x - rx * .25, y - ry * .55, rx * .35, ry * .25, -.4, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
}
function strands(ctx: Ctx, count: number, height: number, t: number, colors: [string, string], tip?: string): void {
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = -18 + (36 * i) / Math.max(1, count - 1), z = (i % 2) * 5 - 2, h = height + (i % 3) * 5, sway = Math.sin(t * 1.2 + i) * 3;
    ctx.strokeStyle = colors[i % 2]; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(x, z); ctx.quadraticCurveTo(x - 3, z - h * .5, x + sway, z - h); ctx.stroke();
    if (tip) { ctx.fillStyle = tip; ctx.beginPath(); ctx.arc(x + sway, z - h, 2, 0, Math.PI * 2); ctx.fill(); }
  }
}

export function drawBuilding(ctx: Ctx, kind: BuildingKind, look: Look, t: number): void {
  shadow(ctx, 30, 13, .2);
  if (kind === 'restaurant') {
    if (look === 3) {
      isoBlock(ctx, .8, 16, '#F2B6A6', '#C9634F', '#A94E3F');
      glow(ctx, 0, -40, 40, 'rgba(77,240,255,A)', .35 + Math.sin(t * 1.5) * .08);
      dome(ctx, 0, -16, 26, 30, 'rgba(190,240,255,.55)');
      ctx.fillStyle = '#FFF2D7'; for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; ctx.beginPath(); ctx.arc(Math.cos(a) * 26, -16 + Math.sin(a) * 30, 1.8, 0, Math.PI * 2); ctx.fill(); }
    } else {
      const h = look === 1 ? 18 : 28;
      isoBlock(ctx, .8, h, look === 1 ? '#C98F6A' : '#EE8D73', look === 1 ? '#A86E4E' : '#C9634F', look === 1 ? '#8C5A3E' : '#A94E3F');
      if (look === 2) for (const [x, sh] of [[-14, 18], [0, 26], [14, 16]]) { ctx.fillStyle = '#F2A65A'; ctx.beginPath(); ctx.moveTo(x - 4, -h - 6 + Math.abs(x) * .2); ctx.lineTo(x, -h - 6 - sh); ctx.lineTo(x + 4, -h - 6 + Math.abs(x) * .2); ctx.fill(); }
      else { ctx.fillStyle = '#7A5A3A'; ctx.beginPath(); ctx.moveTo(-27, -h); ctx.lineTo(0, -h - 18); ctx.lineTo(27, -h); ctx.lineTo(0, -h + 6); ctx.closePath(); ctx.fill(); }
    }
    ctx.fillStyle = '#2B1E3A'; ctx.beginPath(); ctx.roundRect(-5, -14, 10, 14, [5, 5, 0, 0]); ctx.fill();
    ctx.fillStyle = '#FFE27A'; ctx.beginPath(); ctx.arc(0, -9, 1.5, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'kelpFarm') {
    ctx.fillStyle = '#7A5A3E'; diamondPath(ctx, 0, 0, 26, 13); ctx.fill();
    ctx.fillStyle = '#5E4430'; for (let i = -1; i <= 1; i++) { ctx.fillRect(-18 + i * 2, -1 + i * 5, 36, 1.5); }
    strands(ctx, 3 + look * 2, 14 + look * 6, t, ['#3E8E4E', '#5BB363'], look === 3 ? '#B8FF9E' : undefined);
    if (look === 3) glow(ctx, 0, -20, 30, 'rgba(160,255,140,A)', .25);
  } else if (kind === 'fishery') {
    ctx.fillStyle = '#6E4B36'; diamondPath(ctx, 0, 0, 26, 13); ctx.fill();
    if (look >= 2) { isoBlock(ctx, .45, 16, '#C9A27A', '#8C6447', '#6E4B36'); ctx.save(); ctx.translate(0, -16); ctx.fillStyle = look === 3 ? '#F4E7FF' : '#5E6672'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 9, 0, Math.PI, 0); ctx.fill(); ctx.restore(); }
    ctx.strokeStyle = '#3B2A20'; ctx.lineWidth = 2; for (const x of [-20, 16]) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, -26); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(240,230,200,.7)'; ctx.lineWidth = 1; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-20, -24 + i * 5); ctx.lineTo(16, -26 + i * 5); ctx.stroke(); }
    ctx.fillStyle = '#F2A65A'; ctx.beginPath(); ctx.ellipse(-4 + Math.sin(t) * 2, -12, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
    if (look === 3) glow(ctx, 0, -18, 26, 'rgba(255,255,255,A)', .25);
  } else if (kind === 'homes') {
    const huts: [number, number, number][] = look === 1 ? [[-8, 2, 14], [10, -4, 11]] : look === 2 ? [[-12, 3, 14], [10, -5, 13], [12, 7, 10]] : [[-12, 3, 15], [9, -6, 15], [13, 7, 11]];
    for (const [x, y, r] of huts) {
      dome(ctx, x, y, r, r * 1.1, look === 3 ? '#F6F0FF' : look === 2 ? '#F0A58C' : '#E9D2B5');
      ctx.fillStyle = look === 3 ? '#FFE27A' : '#2B1E3A'; ctx.beginPath(); ctx.roundRect(x - 2.5, y - 7, 5, 7, [3, 3, 0, 0]); ctx.fill();
      if (look === 3) glow(ctx, x, y - 4, 10, 'rgba(255,226,122,A)', .4);
    }
  } else if (kind === 'garden') {
    ctx.fillStyle = '#4A5B54'; diamondPath(ctx, 0, 0, 26, 13); ctx.fill();
    const pulse = .3 + Math.sin(t * 1.4) * .1;
    for (let i = 0; i < 2 + look * 2; i++) {
      const x = -16 + ((i * 11) % 34), y = -4 + ((i * 7) % 10), c = ['#E26B9C', '#A57BFF', '#4DF0FF'][i % 3];
      glow(ctx, x, y - 6, 8 + look * 2, 'rgba(165,123,255,A)', pulse * look / 2);
      ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + k * 4 + Math.sin(t + i + k) * 1.5, y - 9); ctx.stroke(); }
    }
    if (look >= 2) { const y = -34 + Math.sin(t * 1.2) * 3; glow(ctx, 4, y, 16, 'rgba(190,240,255,A)', .5); dome(ctx, 4, y + 4, 7, 6, 'rgba(214,246,255,.9)'); }
  } else if (kind === 'branch') {
    drawBranch(ctx, look, t);
  } else {
    if (look === 3) {
      isoBlock(ctx, .7, 14, '#8E9AAE', '#5E6672', '#4A5160');
      glow(ctx, 0, -34, 30, 'rgba(77,240,255,A)', .45 + Math.sin(t * 2) * .1);
      ctx.fillStyle = 'rgba(120,240,255,.85)'; ctx.beginPath(); ctx.moveTo(0, -56); ctx.lineTo(9, -30); ctx.lineTo(0, -16); ctx.lineTo(-9, -30); ctx.closePath(); ctx.fill();
    } else {
      isoBlock(ctx, .7, look === 1 ? 16 : 24, look === 1 ? '#A67B55' : '#9AA5A0', look === 1 ? '#7A5A3E' : '#7B8884', look === 1 ? '#5E4430' : '#5F6B68');
      const h = look === 1 ? 16 : 24; ctx.save(); ctx.translate(0, -h - 9); ctx.rotate(t * .6); ctx.strokeStyle = '#FFE27A'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.stroke(); } ctx.restore();
    }
  }
}

/** Branch restaurant: a kelp kiosk (1–5), a coral bistro (6–10), a pearl brasserie (11–15). A striped awning marks every look. */
function drawBranch(ctx: Ctx, look: Look, t: number): void {
  const h = [14, 22, 26][look - 1], cells = [.6, .72, .8][look - 1];
  const [top, left, right] = look === 1 ? ['#9BC48A', '#6E9A5E', '#56804A'] : look === 2 ? ['#F7B8A0', '#E0806A', '#C46552'] : ['#F6F0FF', '#D9D0F0', '#BDB2DE'];
  isoBlock(ctx, cells, h, top, left, right);
  // Awning stripes over the front (left) face.
  const hw = cells * 32, hh = cells * 16;
  for (let i = 0; i < 4; i++) {
    const a = i / 4, b = (i + 1) / 4;
    ctx.fillStyle = i % 2 ? '#FFF2D7' : look === 3 ? '#A57BFF' : '#2FB8B0';
    ctx.beginPath(); ctx.moveTo(-hw + hw * a, -h + hh * a + 2); ctx.lineTo(-hw + hw * b, -h + hh * b + 2); ctx.lineTo(-hw + hw * b - 2, -h + hh * b + 9); ctx.lineTo(-hw + hw * a - 2, -h + hh * a + 9); ctx.closePath(); ctx.fill();
  }
  // Door and a lit window.
  ctx.fillStyle = '#2B1E3A'; ctx.beginPath(); ctx.roundRect(-hw * .55 - 3, hh * .45 - 12, 7, 11, [3, 3, 0, 0]); ctx.fill();
  ctx.fillStyle = '#FFE27A'; ctx.beginPath(); ctx.roundRect(hw * .35, -h * .55, 6, 6, 2); ctx.fill();
  if (look >= 2) { ctx.fillStyle = '#FFE27A'; ctx.beginPath(); ctx.roundRect(hw * .65, -h * .45 + 4, 5, 5, 2); ctx.fill(); }
  if (look === 1) { ctx.strokeStyle = '#3E8E4E'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -h); ctx.quadraticCurveTo(-4, -h - 10, Math.sin(t * 1.3) * 3, -h - 18); ctx.stroke(); }
  if (look === 2) for (const [x, sh] of [[-8, 12], [6, 16]]) { ctx.fillStyle = '#F2A65A'; ctx.beginPath(); ctx.moveTo(x - 3, -h); ctx.lineTo(x, -h - sh); ctx.lineTo(x + 3, -h); ctx.fill(); }
  if (look === 3) { glow(ctx, 0, -h - 14, 26, 'rgba(255,226,122,A)', .35 + Math.sin(t * 1.5) * .08); dome(ctx, 0, -h + 2, 14, 16, 'rgba(240,230,255,.85)'); }
  // Hanging sign: a fork and plate.
  ctx.fillStyle = 'rgba(18,15,46,.85)'; ctx.beginPath(); ctx.roundRect(hw * .2 - 7, -h - (look === 3 ? 30 : 12), 14, 9, 3); ctx.fill();
  ctx.fillStyle = '#FFE27A'; ctx.beginPath(); ctx.arc(hw * .2, -h - (look === 3 ? 25.5 : 7.5), 2.5, 0, Math.PI * 2); ctx.fill();
}

/** Scaffolding over a foundation while a job runs. */
export function drawScaffold(ctx: Ctx): void {
  ctx.strokeStyle = 'rgba(255,226,122,.9)'; ctx.lineWidth = 1.5;
  for (const [x, y] of [[-22, 0], [0, 11], [22, 0], [0, -11]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 34); ctx.stroke(); }
  for (const h of [-12, -24, -34]) { ctx.beginPath(); ctx.moveTo(-22, h); ctx.lineTo(0, h + 11); ctx.lineTo(22, h); ctx.lineTo(0, h - 11); ctx.closePath(); ctx.stroke(); }
}

/** The restaurant's east grotto seen from town: a rock outcrop with a glowing cave mouth and crystals. */
export function drawGrottoAnnex(ctx: Ctx, t: number): void {
  ctx.save(); ctx.scale(.55, .55);
  shadow(ctx, 30, 13, .25);
  ctx.fillStyle = '#3A3550'; ctx.beginPath(); ctx.moveTo(-30, 2); ctx.quadraticCurveTo(-28, -30, -6, -38); ctx.quadraticCurveTo(18, -42, 28, -16); ctx.lineTo(30, 4); ctx.quadraticCurveTo(0, 16, -30, 2); ctx.fill();
  ctx.fillStyle = '#4C4668'; ctx.beginPath(); ctx.moveTo(-22, -6); ctx.quadraticCurveTo(-16, -30, 2, -34); ctx.quadraticCurveTo(-4, -18, -22, -6); ctx.fill();
  glow(ctx, 0, -8, 22, 'rgba(165,123,255,A)', .45 + Math.sin(t * 1.6) * .1);
  ctx.fillStyle = '#1A1630'; ctx.beginPath(); ctx.ellipse(2, -4, 9, 11, 0, Math.PI, 0); ctx.lineTo(11, 4); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
  for (const [x, y, h] of [[-18, -2, 14], [16, -6, 18], [22, 0, 10]] as const) { ctx.fillStyle = 'rgba(120,240,255,.9)'; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x, y - h); ctx.lineTo(x + 3, y); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
