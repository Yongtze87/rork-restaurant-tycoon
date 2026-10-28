import { Armchair, ChefHat, CircleCheck, Gauge, Lightbulb, Soup, type LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';

const pct = (n: number) => `${Math.round(n * 100)}%`;
/** A busy-ness bar: teal when there is slack, gold when busy, red when stretched. */
function Meter({ Icon, label, value }: { Icon: LucideIcon; label: string; value: number }) {
  return <div className="flex items-center gap-1.5" aria-label={`${label} ${pct(value)}`} role="img">
    <Icon size={13} className="shrink-0 text-ink/70" aria-hidden="true" />
    <span className="h-1.5 w-full min-w-8 overflow-hidden rounded-full bg-ink/10"><span className={cn('block h-full rounded-full', value > .85 ? 'bg-danger' : value > .6 ? 'bg-gold' : 'bg-teal')} style={{ width: pct(Math.min(1, value)) }} /></span>
  </div>;
}

/** The efficiency details: three bars, where guests wait, and the advice. */
export function EfficiencyDetails() {
  const e = restaurant.efficiency(), l = restaurant.seatLimit();
  return <div data-testid="efficiency" className="space-y-1.5 text-xs">
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">
      {([['Kitchen', ChefHat, e.kitchen], ['Servers', Soup, e.service], ['Seats', Armchair, e.seats]] as const).map(([label, Icon, value]) => <div key={label} className="contents"><span className="font-bold">{label}</span><Meter Icon={Icon} label={`${label} busy`} value={value} /><span className="tabular-nums text-ink/70">{pct(value)}</span></div>)}
    </div>
    <p className="text-[11px] text-ink/65">Last minute: {e.waiting.toFixed(1)} orders waiting for a chef · {e.ready.toFixed(1)} plates waiting for a server · {e.dirty.toFixed(1)} dirty seats · {e.turnedAway} turned away (full) · {e.upset} left upset. Crew can serve {Math.floor(l.servable)} of {l.seats} seats.</p>
    <p className={cn('rounded-lg px-2 py-1.5 font-bold', e.advice.kind === 'smooth' ? 'bg-teal/10 text-teal' : 'bg-gold/15')}><span className="block font-display text-sm">{e.advice.title}</span>{e.advice.text}</p>
  </div>;
}

/** A small chip over the dining room: kitchen, servers and seats at a glance, and the next step. Tap for details. */
export function EfficiencyChip() {
  const e = restaurant.efficiency(), ok = e.advice.kind === 'smooth' || e.advice.kind === 'none';
  return <Popover>
    <PopoverTrigger data-testid="efficiency-chip" aria-label={`Efficiency: ${e.advice.title}`} className="pointer-events-auto flex w-[150px] flex-col gap-1 rounded-xl border border-teal/25 bg-paper/85 px-2 py-1.5 text-left backdrop-blur">
      <span className="flex items-center gap-1 text-[10px] font-extrabold">{ok ? <CircleCheck size={12} className="text-teal" aria-hidden="true" /> : <Lightbulb size={12} className="text-gold" aria-hidden="true" />}<span className="truncate">{e.advice.title}</span></span>
      <Meter Icon={ChefHat} label="Kitchen busy" value={e.kitchen} /><Meter Icon={Soup} label="Servers busy" value={e.service} /><Meter Icon={Armchair} label="Seats used" value={e.seats} />
    </PopoverTrigger>
    <PopoverContent className="z-[60] w-72 rounded-xl border-teal/30 bg-paper p-3 text-ink"><p className="mb-1.5 flex items-center gap-1.5 font-display text-sm"><Gauge size={15} className="text-teal" aria-hidden="true" />Efficiency</p><EfficiencyDetails /></PopoverContent>
  </Popover>;
}
