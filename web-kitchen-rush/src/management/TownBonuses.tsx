import { Fish, Hammer, House, Route, Sparkles, Sprout, Zap, type LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { townBreakdown, type BuildingKind } from './town';

const pct = (n: number) => `${Math.round(n * 100)}%`;
interface Bonus { id: string; kinds: BuildingKind[]; Icon: LucideIcon; label: string; capped: boolean; lines: string[]; warn?: boolean }

/** Town-wide totals: what all your buildings add up to, and how close each is to its cap. Tap a chip for the breakdown. */
export function TownBonuses({ only }: { only?: BuildingKind }) {
  const t = townBreakdown(restaurant.state.town), gardens = Math.min(t.gardenCap, t.gardens);
  const list: Bonus[] = [
    { id: 'guests', kinds: ['garden', 'restaurant'], Icon: Sparkles, label: `+${pct(t.restaurant + gardens + t.zones)} guests`, capped: t.gardens >= t.gardenCap, lines: [`Glow gardens +${pct(gardens)} of ${pct(t.gardenCap)} max`, `Restaurant level +${pct(t.restaurant)}`, `Depth zones +${pct(t.zones)}`] },
    { id: 'kelp', kinds: ['kelpFarm'], Icon: Sprout, label: `Kelp −${pct(Math.min(t.producerCap, t.kelp))}`, capped: t.kelp >= t.producerCap, lines: [`Kelp farms make kelp dishes ${pct(Math.min(t.producerCap, t.kelp))} cheaper, of ${pct(t.producerCap)} max`] },
    { id: 'fish', kinds: ['fishery'], Icon: Fish, label: `Fish −${pct(Math.min(t.producerCap, t.fish))}`, capped: t.fish >= t.producerCap, lines: [`Fisheries make fish dishes ${pct(Math.min(t.producerCap, t.fish))} cheaper, of ${pct(t.producerCap)} max`] },
    { id: 'crew', kinds: ['homes'], Icon: House, label: `+${Math.min(t.crewCap, t.homes)} crew`, capped: t.homes >= t.crewCap, lines: [`Mareen homes add ${Math.min(t.crewCap, t.homes)} crew slots, of ${t.crewCap} max`] },
    { id: 'speed', kinds: ['garden', 'homes'], Icon: Zap, label: `Crew +${pct(Math.min(t.crewSpeedCap, t.crewSpeed))}`, capped: t.crewSpeed >= t.crewSpeedCap, lines: [`Gardens near homes make the crew ${pct(Math.min(t.crewSpeedCap, t.crewSpeed))} faster, of ${pct(t.crewSpeedCap)} max`] },
    { id: 'build', kinds: ['workshop'], Icon: Hammer, label: `Builds −${pct(Math.min(t.workshopCap, t.workshop))}`, capped: t.workshop >= t.workshopCap, lines: [`Workshops cut building time by ${pct(Math.min(t.workshopCap, t.workshop))}, of ${pct(t.workshopCap)} max`] },
  ];
  const shown = only ? list.filter(b => b.kinds.includes(only)) : list.filter(b => b.id === 'guests' || b.id === 'crew' || !/[−+]0%/.test(b.label));
  if (!only && t.idle) shown.push({ id: 'idle', kinds: [], Icon: Route, label: `${t.idle} without road`, capped: false, warn: true, lines: ['These buildings do nothing until a road joins them to your restaurant or a branch.'] });
  return <div role="group" aria-label="Town bonuses" className="flex flex-wrap gap-1">{shown.map(b => <Popover key={b.id}>
    <PopoverTrigger className={cn('flex min-h-8 items-center gap-1 rounded-full border px-2 text-[11px] font-extrabold tabular-nums', b.warn ? 'border-danger/40 bg-danger/10 text-danger' : b.capped ? 'border-gold/50 bg-gold/15' : 'border-teal/30 bg-teal/10')}>
      <b.Icon size={13} className={b.warn ? '' : 'text-teal'} aria-hidden="true" />{b.label}{b.capped && <span className="text-[9px] text-gold">MAX</span>}</PopoverTrigger>
    <PopoverContent className="z-[60] w-64 rounded-xl border-teal/30 bg-paper p-3 text-xs leading-relaxed text-ink/80"><ul className="space-y-0.5">{b.lines.map(line => <li key={line}>{line}</li>)}</ul></PopoverContent>
  </Popover>)}</div>;
}
