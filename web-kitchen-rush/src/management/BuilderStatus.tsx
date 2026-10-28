import { useEffect, useState } from 'react';
import { Gem, Hammer, LockKeyhole } from 'lucide-react';
import { restaurant } from './engine';
import { BUILDINGS, MAX_BUILDERS, SHOP } from './town';
import { formatDuration } from './iso/town-render';
import type { TileRef } from './town-draft';

/** Each builder at a glance over the town: free, or what they are building and how long is left. Tap a job to open that building. */
export function BuilderStatus({ onSelect, onShop }: { onSelect: (tile: TileRef) => void; onShop: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const town = restaurant.state.town, jobs = town.buildings.filter(b => b.job).sort((a, b) => a.job!.endsAt - b.job!.endsAt);
  return <section aria-label="Builders" data-testid="builder-status" className="pointer-events-auto flex w-[176px] flex-col gap-1 rounded-xl border border-teal/25 bg-paper/85 p-1.5 backdrop-blur">
    {town.builders > jobs.length && <div className="flex min-h-9 items-center gap-1.5 rounded-lg bg-teal/10 px-2 text-[11px] font-extrabold text-teal"><Hammer size={13} aria-hidden="true" />{town.builders - jobs.length > 1 ? `${town.builders - jobs.length} builders free` : 'Builder free'}</div>}
    {jobs.slice(0, town.builders).map((b, i) => {
      const job = b.job!, done = Math.min(1, (now - job.startedAt) / Math.max(1, job.endsAt - job.startedAt));
      return <button type="button" key={i} onClick={() => onSelect({ x: b.x, z: b.z })} aria-label={`Builder: ${BUILDINGS[b.kind].name} ${job.kind === 'build' ? 'being built' : `to level ${b.level + 1}`}, ${formatDuration(job.endsAt - now)} left`} className="flex min-h-9 flex-col justify-center rounded-lg bg-gold/10 px-2 text-left hover:bg-gold/20">
        <span className="flex w-full items-center gap-1.5 text-[11px] font-extrabold"><Hammer size={13} className="shrink-0 text-gold" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{BUILDINGS[b.kind].name}{job.kind === 'upgrade' ? ` → Lv ${b.level + 1}` : ''}</span><span className="shrink-0 tabular-nums">{formatDuration(job.endsAt - now)}</span></span>
        <span className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-ink/10"><span className="block h-full rounded-full bg-teal" style={{ width: `${done * 100}%` }} /></span>
      </button>;
    })}
    {town.builders < MAX_BUILDERS && <button type="button" onClick={onShop} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-ink/20 px-2 text-[11px] font-bold text-ink/60 hover:bg-ink/5"><LockKeyhole size={13} aria-hidden="true" /><span className="flex-1 text-left">2nd builder</span><Gem size={11} className="text-violet" aria-hidden="true" />{SHOP.builder.pearls}</button>}
  </section>;
}
