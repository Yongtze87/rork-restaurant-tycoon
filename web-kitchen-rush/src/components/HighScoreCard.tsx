import { Trophy } from 'lucide-react';
import { SHIFTS } from '@/game/config';
import { highScoreFor } from '@/game/high-score';
import type { Mode, Progress } from '@/game/types';
import { cn } from '@/lib/utils';

/** Browser-local record for the selected play mode, never a practice/live score. */
export function HighScoreCard({ progress, mode, className }: { progress: Progress; mode: Mode; className?: string }) {
  const best = highScoreFor(progress, mode);
  return <section aria-label="High score" className={cn('rounded-2xl border-2 border-gold/70 bg-teal px-4 py-3 text-paper shadow-[0_5px_0_#233d3b,0_12px_28px_#233d3b55]', className)}>
    <div className="flex items-center gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-gold/60 bg-gold/15"><Trophy aria-hidden="true" className="size-6 text-gold" /></div>
      <div className="min-w-0 flex-1">
        <h2 className="font-body text-[10px] font-extrabold uppercase tracking-[.15em] text-gold">High Score · {mode === 'solo' ? 'Solo' : 'Couch co-op'}</h2>
        {best ? <><p className="mt-0.5 break-words font-display text-3xl font-semibold leading-tight tabular-nums"><span>{best.score.toLocaleString('en-US')}</span> <span className="font-body text-xs font-bold text-paper/70">pts</span></p><p className="text-xs font-bold text-paper/75">{SHIFTS[best.level].name} · Best completed shift</p></> : <p className="mt-1 font-display text-xl leading-tight">Set your first record</p>}
      </div>
    </div>
    <p className="mt-2 border-t border-paper/15 pt-2 text-xs font-bold text-paper/80">{best ? 'One more shift. A new personal best?' : 'Finish a timed shift to set your best.'}</p>
  </section>;
}
