import type { BulletinReadout } from './bulletin';

/** Redraw only on content/page changes; this canvas is reused by the two physical display faces. */
export function paintBulletin(ctx: CanvasRenderingContext2D, data: BulletinReadout, page: number): void {
  const w = 1024, h = 640;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#224F4A'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#275A55'; ctx.fillRect(0, 0, w, 98);
  const text = (value: string, x: number, y: number, size: number, color = '#FFF2D7', display = false, max = 920) => {
    ctx.fillStyle = color; ctx.font = `700 ${size}px ${display ? 'Fredoka' : 'Nunito'}, sans-serif`;
    ctx.textAlign = 'left'; ctx.fillText(value, x, y, max);
  };
  ctx.fillStyle = '#F2B743'; ctx.beginPath(); ctx.arc(51, 51, 10, 0, Math.PI * 2); ctx.fill();
  text('NEIGHBORHOOD LIVE', 77, 61, 29);
  ctx.textAlign = 'right'; ctx.fillStyle = '#F2B743'; ctx.font = '800 25px Nunito, sans-serif'; ctx.fillText(`DAY ${data.day}`, 978, 61, 230);
  text(data.name, 48, 156, 38, '#FFF2D7', true);
  text(data.status, 50, 204, 25, '#F2B743');
  ctx.fillStyle = '#FFF2D7'; ctx.fillRect(48, 242, 250, 247);
  text(String(data.guests).padStart(2, '0'), 70, 395, 138, '#224F4A', true, 208);
  text('GUESTS NOW', 74, 453, 28, '#224F4A');
  const notice = data.notices[page] ?? data.notices[0];
  text(notice.label, 337, 281, 23, '#F2B743', false, 636);
  const words = notice.title.split(' '), lines: string[] = []; let line = '';
  ctx.font = '700 53px Fredoka, sans-serif';
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > 636 && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((value, i) => text(value, 334, 357 + i * 64, 53, '#FFF2D7', true, 636));
  text(notice.detail, 337, 470, 22, '#FFF2D7', false, 635);
  ctx.fillStyle = '#3B9C98'; ctx.fillRect(48, 530, 928, 2);
  text('GOOD FOOD. GREAT COMPANY.', 48, 587, 23, '#FFF2D7');
  for (let i = 0; i < data.notices.length; i++) { ctx.fillStyle = i === page ? '#F2B743' : '#3B9C98'; ctx.beginPath(); ctx.arc(974 - (data.notices.length - 1 - i) * 25, 578, 5, 0, Math.PI * 2); ctx.fill(); }
}
