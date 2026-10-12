import { Zap } from 'lucide-react';
import { DASH_COOLDOWN_SECONDS } from '@/game/config';
import type { Chef } from '@/game/types';
import { cn } from '@/lib/utils';

function remainingSeconds(cooldown: number): string {
  return (Math.max(1, Math.ceil(cooldown * 10 - 1e-9)) / 10).toFixed(1);
}

/** Readiness follows simulation time, so pausing also freezes the recharge display. */
export function DashStatus({ chef, paused }: { chef: Chef; paused: boolean }) {
  const ready = chef.cooldown === 0;
  const label = paused ? 'PAUSED' : chef.dash > 0 ? 'DASHING' : ready ? 'DASH READY' : `${remainingSeconds(chef.cooldown)}s RECHARGE`;
  return <div className={cn('w-36 rounded-xl border bg-ink/95 px-3 py-2 text-paper shadow-lg', ready ? 'border-gold/60' : 'border-paper/20')}>
    <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-extrabold tracking-wider">
      <span className={chef.id === 0 ? 'text-[#ffb28e]' : 'text-[#69bca6]'}>CHEF {chef.id + 1}</span>
      <kbd className="rounded border border-paper/25 px-1.5 font-body text-paper">{chef.id === 0 ? 'SPACE' : 'J'}</kbd>
    </div>
    <p className={cn('mb-1 flex items-center gap-1.5 text-[10px] font-extrabold tabular-nums', ready && !paused ? 'text-gold' : 'text-paper/80')}><Zap aria-hidden="true" className="size-3" />{label}</p>
    <progress className="block h-1 border-0 bg-paper/15" max={DASH_COOLDOWN_SECONDS} value={DASH_COOLDOWN_SECONDS - chef.cooldown} aria-label={`Chef ${chef.id + 1} dash recharge`} aria-valuetext={paused ? 'Paused' : ready ? 'Ready' : `${remainingSeconds(chef.cooldown)} seconds remaining`} />
  </div>;
}

/** Solo touch activation shares the keyboard dash rules and cooldown. */
export function DashButton({ chef, paused, onDash }: { chef: Chef; paused: boolean; onDash: () => void }) {
  const ready = chef.cooldown === 0;
  return <button className={cn('game-button min-h-11 px-3 py-2 text-sm tabular-nums', ready && 'border-gold bg-gold')} disabled={paused || !ready} onClick={onDash}>
    <Zap aria-hidden="true" className="size-4" />{paused ? 'Dash · paused' : ready ? 'Dash' : `Dash · ${remainingSeconds(chef.cooldown)}s`}
  </button>;
}
