import { TOWN_SIZE, canUnlock, lookFor, unlockCost, type Town } from '../town';
import type { Ambience } from './ambience';
import { depthOf, toScreen, type View } from './projection';
import { at, drawDecor, drawParticles, drawWater, floorPolygon, type Decor } from './render';
import { drawSprite } from './sprites';
import { drawBuilding, drawScaffold } from './town-art';

export interface TownFrame {
  town: Town; cash: number; view: View; width: number; height: number; windowTop: number; windowHeight: number;
  time: number; now: number; ambience: Ambience; reduced: boolean; selected: { x: number; z: number } | null;
}
type Ctx = CanvasRenderingContext2D;
const MARGIN = 2, GAP = .07;

const decor: Decor[] = (() => {
  const list: Decor[] = []; let seed = 77;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 40; i++) {
    const x = -MARGIN + rnd() * (TOWN_SIZE + MARGIN * 2) - .5, z = -MARGIN + rnd() * (TOWN_SIZE + MARGIN * 2) - .5;
    if (x < -.7 || z < -.7 || x > TOWN_SIZE - .3 || z > TOWN_SIZE - .3) list.push({ x, z, kind: (['kelp', 'rock', 'coral', 'shell', 'coral'] as const)[Math.floor(rnd() * 5)], tint: rnd() });
  }
  return list;
})();

const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}

/** Draw the town map. Reads town state only. */
export function renderTown(ctx: Ctx, f: TownFrame): void {
  const { town, view, time, now, reduced, selected } = f, t = reduced ? 0 : time, price = unlockCost(town);
  drawWater(ctx, f);
  floorPolygon(ctx, view, -MARGIN - .5, -MARGIN - .5, TOWN_SIZE - .5 + MARGIN, TOWN_SIZE - .5 + MARGIN); ctx.fillStyle = '#D9C49A'; ctx.fill();
  const c = toScreen(view, (TOWN_SIZE - 1) / 2, (TOWN_SIZE - 1) / 2), r = (TOWN_SIZE + MARGIN * 2) * 64 * .62 * view.scale;
  const fog = ctx.createRadialGradient(c.x, c.y, r * .35, c.x, c.y, r); fog.addColorStop(0, 'rgba(42,143,176,0)'); fog.addColorStop(1, 'rgba(18,88,122,.95)');
  ctx.fillStyle = fog; floorPolygon(ctx, view, -MARGIN - .5, -MARGIN - .5, TOWN_SIZE - .5 + MARGIN, TOWN_SIZE - .5 + MARGIN); ctx.fill();
  // Plots: owned are paved, unlockable are outlined with their price, the rest stay wild.
  for (const plot of town.plots) {
    const open = canUnlock(town, plot), x0 = plot.x - .5 + GAP, z0 = plot.z - .5 + GAP, x1 = plot.x + .5 - GAP, z1 = plot.z + .5 - GAP;
    floorPolygon(ctx, view, x0, z0, x1, z1);
    ctx.fillStyle = plot.owned ? (plot.building ? '#86CAC3' : '#A9D8D0') : open ? 'rgba(255,242,215,.35)' : 'rgba(40,60,80,.28)'; ctx.fill();
    if (open) { ctx.setLineDash([5, 4]); ctx.strokeStyle = f.cash >= price ? '#4DF0FF' : 'rgba(233,230,255,.6)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
    if (selected && selected.x === plot.x && selected.z === plot.z) { ctx.strokeStyle = '#FFE27A'; ctx.lineWidth = 3; floorPolygon(ctx, view, x0, z0, x1, z1); ctx.stroke(); }
  }
  const items: { depth: number; draw: () => void }[] = decor.map(d => ({ depth: depthOf(d.x, d.z), draw: () => at(ctx, view, d.x, d.z, 0, () => drawDecor(ctx, d, t)) }));
  for (const plot of town.plots) {
    if (!plot.building) continue;
    const look = lookFor(plot.level), building = plot.building, job = plot.job;
    items.push({ depth: depthOf(plot.x, plot.z), draw: () => at(ctx, view, plot.x, plot.z, 0, () => {
      if (job?.kind === 'build') { ctx.fillStyle = 'rgba(122,90,62,.8)'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2); ctx.fill(); }
      else if (!drawSprite(ctx, `building.${building}.${look}`)) drawBuilding(ctx, building, look, t);
      if (job) drawScaffold(ctx);
    }) });
  }
  items.sort((a, b) => a.depth - b.depth).forEach(item => item.draw());
  // Badges after the buildings so they are never hidden: level, construction progress, unlock price.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const plot of town.plots) {
    const p = toScreen(view, plot.x, plot.z), s = view.scale;
    if (plot.job) {
      const span = plot.job.endsAt - plot.job.startedAt, done = span > 0 ? Math.min(1, (now - plot.job.startedAt) / span) : 1, y = p.y - 66 * s;
      ctx.fillStyle = 'rgba(18,15,46,.9)'; ctx.beginPath(); ctx.roundRect(p.x - 30 * s, y - 9 * s, 60 * s, 18 * s, 9 * s); ctx.fill();
      ctx.fillStyle = '#4DF0FF'; ctx.beginPath(); ctx.roundRect(p.x - 28 * s, y + 5 * s, 56 * s * done, 2.5 * s, 1.5 * s); ctx.fill();
      ctx.fillStyle = '#E9E6FF'; ctx.font = `700 ${Math.max(9, 9 * s)}px Quicksand, sans-serif`; ctx.fillText(formatDuration(plot.job.endsAt - now), p.x, y - 1 * s);
    } else if (plot.building) {
      const y = p.y + 14 * s;
      ctx.fillStyle = 'rgba(18,15,46,.85)'; ctx.beginPath(); ctx.roundRect(p.x - 15 * s, y - 6 * s, 30 * s, 12 * s, 6 * s); ctx.fill();
      ctx.fillStyle = '#FFE27A'; ctx.font = `700 ${Math.max(8, 8 * s)}px Quicksand, sans-serif`; ctx.fillText(`Lv ${plot.level}`, p.x, y + .5 * s);
    } else if (canUnlock(town, plot)) {
      ctx.fillStyle = f.cash >= price ? '#E9E6FF' : 'rgba(233,230,255,.6)'; ctx.font = `700 ${Math.max(9, 10 * s)}px "Baloo 2", sans-serif`; ctx.fillText(fmt(price), p.x, p.y);
    } else if (plot.owned) {
      ctx.fillStyle = 'rgba(18,15,46,.6)'; ctx.font = `700 ${Math.max(8, 8 * s)}px Quicksand, sans-serif`; ctx.fillText('Empty plot', p.x, p.y);
    }
  }
  drawParticles(ctx, f);
}
