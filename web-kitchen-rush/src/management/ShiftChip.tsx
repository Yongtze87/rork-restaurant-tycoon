import { Moon, Sun } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { DAY_LENGTH } from './types';
import { nightLevel } from './light';
import { money } from './format';

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;

/** The last day-and-night cycle at a glance: what it brought in and its profit, with the current shift's progress. Tap for the receipt. */
export function ShiftChip() {
  const s = restaurant.state, last = s.history[s.history.length - 1], night = nightLevel(s.elapsed) > .5, progress = Math.min(1, s.elapsed / DAY_LENGTH);
  const takings = last ? last.revenue + last.tips + last.branch : 0, Icon = night ? Moon : Sun;
  const rows: [string, number][] = last ? [['Food sales', last.revenue], ['Tips', last.tips], ...(last.branch ? [['Branches', last.branch]] as [string, number][] : []), ['Ingredients', -last.ingredients], ['Wages', -last.wages], ['Rent', -last.rent], ...(last.debtPayment ? [['Loan repayment', -last.debtPayment]] as [string, number][] : [])] : [];
  return <Popover>
    <PopoverTrigger data-testid="shift-chip" aria-label={last ? `Last shift: ${money(takings)} in, ${signed(last.profit)} profit` : 'First shift under way'} className="pointer-events-auto flex w-[150px] flex-col gap-0.5 rounded-xl border border-teal/25 bg-paper/85 px-2 py-1.5 text-left backdrop-blur">
      <span className="flex items-center gap-1 text-[10px] font-extrabold text-ink/60"><Icon size={12} className={night ? 'text-violet' : 'text-gold'} aria-hidden="true" />{last ? 'Last shift' : 'First shift'}</span>
      {last ? <span className="flex items-baseline justify-between gap-1 font-display text-sm leading-tight tabular-nums">{money(takings)}<span className={cn('text-[11px]', last.profit >= 0 ? 'text-teal' : 'text-danger')}>{signed(last.profit)}</span></span>
        : <span className="text-[11px] font-bold">{restaurant.todayTotals().served} served so far</span>}
      <span className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-ink/10" aria-hidden="true"><span className="block h-full rounded-full bg-gold" style={{ width: `${progress * 100}%` }} /></span>
    </PopoverTrigger>
    <PopoverContent className="z-[60] w-64 rounded-xl border-teal/30 bg-paper p-3 text-xs text-ink">
      <p className="font-display text-sm">{last ? 'Last shift' : 'First shift'}</p>
      {last && <><p className="text-[11px] text-ink/60">{last.served} served · {last.missed} missed · rating {last.rating.toFixed(1)}</p>
        <dl className="mt-1.5 space-y-0.5">{rows.map(([label, value]) => <div key={label} className="flex justify-between"><dt className="text-ink/70">{label}</dt><dd className={cn('tabular-nums', value < 0 && 'text-ink/70')}>{signed(value)}</dd></div>)}
          <div className="flex justify-between border-t border-ink/15 pt-1 font-extrabold"><dt>Profit</dt><dd className={last.profit >= 0 ? 'text-teal' : 'text-danger'}>{signed(last.profit)}</dd></div></dl></>}
      <p className="mt-2 text-[11px] text-ink/60">Each shift is a day and night of about {Math.round(DAY_LENGTH / 60 * 10) / 10} minutes; this one is {Math.round(progress * 100)}% done. Every shift is in the Ledger.</p>
    </PopoverContent>
  </Popover>;
}
