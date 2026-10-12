import { Check, Flame, TriangleAlert } from 'lucide-react';
import { GRILL_COOK_SECONDS } from '@/game/config';
import type { Station } from '@/game/types';

/** Station-local countdown driven by simulation time, so pausing also freezes it. */
export function GrillProgress({ station }: { station: Station }) {
  if (station.kind !== 'grill' || station.item?.kind !== 'patty') return null;

  const burning = station.fire > 0;
  const burnt = station.item.state === 'burnt';
  const ready = station.item.state === 'cooked';
  const remaining = Math.max(0, Math.min(GRILL_COOK_SECONDS, GRILL_COOK_SECONDS - station.heat));
  // Ignore floating-point drift at tenth boundaries; never show zero while still raw.
  const seconds = (Math.max(1, Math.ceil(remaining * 10 - 1e-9)) / 10).toFixed(1);

  if (burning || burnt) {
    const Icon = burning ? Flame : TriangleAlert;
    return <div className="pointer-events-none flex w-20 items-center justify-center gap-1 rounded-md border border-paper/60 bg-tomato px-1 py-1.5 text-[10px] font-extrabold text-paper shadow-md">
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span>{burning ? 'FIRE!' : 'BURNT'}</span>
    </div>;
  }

  if (ready) {
    return <div className="pointer-events-none w-20 rounded-md border border-paper/60 bg-teal px-1.5 py-1 text-paper shadow-md">
      <p className="flex items-center justify-center gap-1 text-[11px] font-extrabold"><Check className="size-3" aria-hidden="true" />READY!</p>
      <p className="text-center text-[9px] font-bold">PICK UP</p>
    </div>;
  }

  return <div className="pointer-events-none w-20 rounded-md border border-paper/60 bg-ink/95 px-1.5 py-1 text-paper shadow-md">
    <p className="flex items-center justify-between gap-1 text-[9px] font-extrabold">
      <span>COOKING</span><span className="tabular-nums text-gold">{seconds}s</span>
    </p>
    <progress
      className="mt-1 block h-2 border-paper/20 bg-paper/20 [&::-webkit-progress-bar]:bg-paper/20 [&::-webkit-progress-value]:transition-none"
      value={remaining}
      max={GRILL_COOK_SECONDS}
      aria-label="Grill cooking time remaining"
      aria-valuetext={`${seconds} seconds until ready`}
    />
  </div>;
}
