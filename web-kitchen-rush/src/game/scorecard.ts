import { SHIFTS } from './config';
import type { Results } from './types';

/** Portrait PNG, rendered locally without capturing the WebGL canvas or fetching artwork. */
export const SCORECARD_SIZE = { width: 1080, height: 1350 } as const;
const COLORS = { paper: '#FFF2D7', inlay: '#F6E7CA', ink: '#233D3B', muted: '#66766B', teal: '#224F4A', counter: '#275A55', tomato: '#DC533C', gold: '#F2B743', amber: '#FFBF52' } as const;
const number = (value: number): string => value.toLocaleString('en-US');

/** Copy and filenames come only from the completed shift, not current menu selections. */
export function scorecardDetails(result: Results): { title: string; text: string; filename: string; description: string } {
  const shift = SHIFTS[result.level].name;
  const mode = result.mode === 'coop' ? 'Couch co-op' : 'Solo';
  return {
    title: `Kitchen Rush · ${shift}`,
    text: `${result.mode === 'coop' ? 'We' : 'I'} scored ${number(result.score)} points in Kitchen Rush! ${shift} · ${mode} · ${result.stars}/3 stars · ${result.served} orders served. Can you beat ${result.mode === 'coop' ? 'our' : 'my'} score?`,
    filename: `kitchen-rush-${shift.toLowerCase().replace(/ /g, '-')}-${result.mode}-${result.score}.png`,
    description: `${shift}, ${mode}: ${number(result.score)} points, ${result.stars} of 3 stars. ${result.served} orders served, ${result.missed} missed. Order points ${number(result.orderPoints)}, tips +${number(result.tips)}, penalties −${number(result.penalties)}.${result.newBest ? ' New personal best.' : ''}`,
  };
}

async function loadScorecardFonts(): Promise<void> {
  if (!document.fonts) return;
  // A slow or unavailable font must not prevent saving a score. System fallbacks are fitted too.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 88px Fredoka'), document.fonts.load('600 48px Fredoka'), document.fonts.load('800 26px Nunito'), document.fonts.load('700 32px Nunito')]),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, 2000); }),
    ]);
  } catch { /* Canvas uses the configured local fallback fonts. */ }
  finally { clearTimeout(timeout); }
}

function paintScorecard(ctx: CanvasRenderingContext2D, result: Results): void {
  const { width, height } = SCORECARD_SIZE;
  const text = (value: string, x: number, y: number, size: number, color: string = COLORS.ink, display = false, align: CanvasTextAlign = 'center', maxWidth = 800): void => {
    ctx.font = `${display ? 600 : 800} ${size}px ${display ? 'Fredoka, "Arial Rounded MT Bold", sans-serif' : 'Nunito, sans-serif'}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, maxWidth);
  };
  const roundRect = (x: number, y: number, w: number, h: number, radius: number, color: string): void => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  };
  const line = (y: number): void => {
    ctx.save(); ctx.strokeStyle = COLORS.muted; ctx.globalAlpha = .35; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
    ctx.beginPath(); ctx.moveTo(148, y); ctx.lineTo(932, y); ctx.stroke(); ctx.restore();
  };
  ctx.fillStyle = COLORS.teal; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = COLORS.counter; ctx.lineWidth = 2;
  for (let x = -height; x < width; x += 72) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + height, height); ctx.stroke(); }

  // The rooftop's warm string lights frame the souvenir without needing remote assets.
  ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-20, 15); ctx.quadraticCurveTo(540, 105, 1100, 15); ctx.stroke();
  for (let i = 0; i < 11; i++) {
    const x = 40 + i * 100; const t = (x + 20) / 1120; const y = 15 + 180 * t * (1 - t);
    ctx.fillStyle = COLORS.ink; ctx.fillRect(x - 4, y, 8, 16);
    ctx.save(); ctx.shadowColor = COLORS.amber; ctx.shadowBlur = 20; ctx.fillStyle = COLORS.amber;
    ctx.beginPath(); ctx.ellipse(x, y + 23, 8, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  text('KITCHEN RUSH', 540, 158, 86, COLORS.paper, true);
  text('GOOD FOOD. GREAT CHAOS.', 540, 205, 24, COLORS.gold);

  ctx.save(); ctx.shadowColor = COLORS.ink; ctx.shadowBlur = 28; ctx.shadowOffsetY = 14;
  ctx.fillStyle = COLORS.paper; ctx.beginPath(); ctx.moveTo(88, 267);
  for (let x = 88; x <= 992; x += 16) ctx.lineTo(x, 259 + ((x - 88) / 16 % 2) * 10);
  ctx.lineTo(992, 1147);
  for (let x = 992; x >= 88; x -= 16) ctx.lineTo(x, 1147 + ((992 - x) / 16 % 2) * 10);
  ctx.closePath(); ctx.fill(); ctx.restore();

  text(`SHIFT 0${result.level + 1}  /  ${result.mode === 'coop' ? 'COUCH CO-OP' : 'SOLO SERVICE'}`, 540, 322, 24, COLORS.muted);
  text(SHIFTS[result.level].name, 540, 387, 56, COLORS.ink, true);
  for (let i = 0; i < 3; i++) {
    const x = 438 + i * 102; const y = i === 1 ? 454 : 464; const radius = i === 1 ? 40 : 33;
    ctx.beginPath();
    for (let point = 0; point < 10; point++) {
      const angle = -Math.PI / 2 + point * Math.PI / 5; const r = point % 2 ? radius * .47 : radius;
      if (point === 0) ctx.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
      else ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    }
    ctx.closePath(); ctx.fillStyle = i < result.stars ? COLORS.gold : COLORS.inlay; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = i < result.stars ? COLORS.gold : COLORS.muted; ctx.stroke();
  }
  text(number(result.score), 540, 648, 166, COLORS.ink, true, 'center', 752);
  text('POINTS ON THE BOARD', 540, 695, 24, COLORS.muted);

  if (result.newBest) {
    roundRect(390, 722, 300, 44, 12, COLORS.tomato);
    text('NEW PERSONAL BEST', 540, 752, 21, COLORS.paper);
  } else {
    text(result.stars === 3 ? 'THREE-STAR SERVICE' : result.stars > 0 ? 'NICELY SERVED!' : 'EVERY GREAT CHEF STARTS SOMEWHERE', 540, 752, 21, COLORS.teal);
  }
  line(793);
  const rows = [
    ['Order points', number(result.orderPoints)],
    ['Tips earned', `+${number(result.tips)}`],
    ['Missed-order penalties', `−${number(result.penalties)}`],
  ];
  rows.forEach(([label, value], i) => {
    const y = 844 + i * 58;
    text(label, 152, y, 29, COLORS.ink, false, 'left', 510);
    text(value, 928, y, 34, i === 2 ? COLORS.tomato : COLORS.ink, true, 'right', 244);
  });
  line(990);
  roundRect(148, 1019, 784, 88, 18, COLORS.inlay);
  text(`${number(result.served)} SERVED`, 344, 1073, 28, COLORS.teal);
  text(`${number(result.missed)} MISSED`, 736, 1073, 28, COLORS.muted);
  ctx.strokeStyle = COLORS.paper; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(540, 1037); ctx.lineTo(540, 1089); ctx.stroke();
  text('Your rooftop. Your rush.', 540, 1222, 42, COLORS.paper, true);
  text(`CAN YOU BEAT ${result.mode === 'coop' ? 'OUR' : 'MY'} SCORE?`, 540, 1273, 25, COLORS.gold);
}

/** Generates a shareable file; callers own any object URL they create for its preview. */
export async function createScorecard(result: Results): Promise<File> {
  const snapshot: Results = { ...result };
  await loadScorecardFonts();
  const canvas = document.createElement('canvas');
  canvas.width = SCORECARD_SIZE.width; canvas.height = SCORECARD_SIZE.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Scorecard canvas unavailable');
  paintScorecard(context, snapshot);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Scorecard export unavailable')), 'image/png');
  });
  return new File([blob], scorecardDetails(snapshot).filename, { type: 'image/png' });
}

/** Web Share file support varies by browser, OS, and iframe permissions. */
export function canShareScorecard(file: File): boolean {
  try { return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }); }
  catch { return false; }
}
