import { memo, useId, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus, ReceiptText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money } from './format';
import { buildRevenueWeeks, revenueAxisMax, type RevenueWeek } from './weekly-revenue';
import type { Report } from './types';

const compactDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** Read-only weekly sales story. Receipt data is stable between closings, avoiding per-frame chart work. */
export const WeeklyRevenue = memo(function WeeklyRevenue({ history, onReport }: { history: readonly Report[]; onReport: (day: number) => void }) {
  const weeks = useMemo(() => buildRevenueWeeks(history), [history]);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const selectId = useId();
  const index = Math.max(0, selectedWeek === null ? weeks.length - 1 : weeks.findIndex(week => week.number === selectedWeek));
  const week = weeks[index], saved = week.days.filter(day => day.report !== null);
  const detail = saved.find(day => day.day === selectedDay) ?? saved[saved.length - 1];
  const changeWeek = (next: number) => { setSelectedWeek(next === weeks.length - 1 ? null : weeks[next].number); setSelectedDay(null); };
  return <section aria-label="Weekly revenue" className="mb-5 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <div><h3 className="text-xl">Weekly revenue</h3><p className="text-[11px] text-ink/60">A little growth, day by day.</p></div>
      <div className="flex shrink-0 gap-1">
        <button type="button" aria-label="Previous revenue week" disabled={index === 0} onClick={() => changeWeek(index - 1)} className="grid size-11 place-items-center rounded-xl border border-ink/10 bg-ink/[.06] transition hover:bg-ink/10 disabled:opacity-30 motion-reduce:transition-none"><ChevronLeft size={18} /></button>
        <button type="button" aria-label="Next revenue week" disabled={index === weeks.length - 1} onClick={() => changeWeek(index + 1)} className="grid size-11 place-items-center rounded-xl border border-ink/10 bg-ink/[.06] transition hover:bg-ink/10 disabled:opacity-30 motion-reduce:transition-none"><ChevronRight size={18} /></button>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
      <p data-testid="revenue-week-label" className="text-xs font-extrabold text-teal">Week {week.number} <span className="font-semibold text-ink/60">· Days {week.start}–{week.end}</span></p>
      <span className="text-[10px] font-bold text-ink/60">{week.count}/7 days recorded</span>
    </div>
    <p data-testid="revenue-week-total" className="mt-1 break-words font-display text-4xl tabular-nums text-teal">{week.count ? money(week.total) : '—'}</p>
    <p className="text-[10px] text-ink/60">{week.unavailable ? 'Saved-day subtotal' : week.count === 7 ? 'Full week' : 'Week to date'} · meal sales + tips</p>
    <RevenueComparison week={week} />
    <RevenueBars week={week} selectedDay={detail?.day ?? null} />
    <p className="mt-1 text-[10px] leading-relaxed text-ink/60">Closed days only · 1 week = 7 game days. Bonuses excluded.</p>
    {!week.count ? <div className="mt-3 rounded-xl border border-dashed border-teal/25 bg-teal/5 p-3 text-xs leading-relaxed text-ink/70">Your story starts with the first closing receipt. Finish a service day to see revenue here.</div> : <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-1 rounded-xl bg-teal/5 px-3 py-2 text-[11px] font-bold text-teal"><span>Sales {money(week.sales)}</span><span>Tips {money(week.tips)}</span></div>
      <div className="mt-3 rounded-xl border border-ink/10 bg-ink/[.06] p-3">
        <label htmlFor={selectId} className="text-[10px] font-extrabold uppercase tracking-widest text-ink/60">Explore a day</label>
        <div className="mt-1 flex items-center gap-2">
          <select id={selectId} value={detail.day} onChange={event => setSelectedDay(Number(event.target.value))} className="min-h-11 min-w-0 flex-1 rounded-lg border border-ink/15 bg-paper px-2 text-sm font-extrabold focus-visible:outline focus-visible:outline-4 focus-visible:outline-gold">
            {saved.map(day => <option key={day.day} value={day.day}>Day {day.day} · {money(day.report!.revenue + day.report!.tips)}</option>)}
          </select>
          <button type="button" aria-label={`Open Day ${detail.day} revenue receipt`} onClick={() => onReport(detail.day)} className="grid size-11 shrink-0 place-items-center rounded-lg bg-teal text-paper transition hover:bg-ink motion-reduce:transition-none"><ReceiptText size={18} /></button>
        </div>
        <p data-testid="revenue-day-detail" className="mt-2 text-[11px] text-ink/70">Day {detail.day}: {money(detail.report!.revenue)} sales + {money(detail.report!.tips)} tips.</p>
      </div>
    </>}
    <p className="mt-3 text-[10px] leading-relaxed text-ink/55">{week.unavailable ? `${week.unavailable} day(s) unavailable in this week. ` : ''}Based on the latest 20 saved receipts, including offline service. Dashed marks mean no saved receipt, not $0.</p>
  </section>;
});

function RevenueComparison({ week }: { week: RevenueWeek }) {
  const comparison = week.comparison;
  if (!comparison) return <p data-testid="revenue-comparison" className="mt-2 min-h-8 text-[11px] leading-4 text-ink/60">{week.number === 1 ? 'Your first week sets the baseline.' : 'Not enough saved days for a fair comparison.'}</p>;
  const { difference, percent, days } = comparison;
  const Icon = difference > 0 ? ArrowUpRight : difference < 0 ? ArrowDownRight : Minus;
  const percentLabel = percent === null ? 'from $0' : `${percent > 0 ? '+' : ''}${percent.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  return <div data-testid="revenue-comparison" className={cn('mt-2 flex min-h-8 items-start gap-1.5 text-[11px] leading-4', difference < 0 ? 'text-tomato' : 'text-teal')}>
    <Icon size={16} className="shrink-0" aria-hidden="true" />
    <p><span className="font-extrabold">{difference > 0 ? '+' : ''}{money(difference)} · {percentLabel}</span><br />{days === 7 ? 'vs. the previous full week' : `vs. first ${days} ${days === 1 ? 'day' : 'days'} of the previous week`}</p>
  </div>;
}

function RevenueBars({ week, selectedDay }: { week: RevenueWeek; selectedDay: number | null }) {
  const titleId = useId(), descriptionId = useId(), max = revenueAxisMax(week);
  return <svg data-testid="revenue-chart" viewBox="0 0 280 148" role="img" aria-labelledby={`${titleId} ${descriptionId}`} className="mt-2 block max-h-[164px] w-full overflow-visible">
    <title id={titleId}>Week {week.number} daily revenue in dollars</title>
    <desc id={descriptionId}>{week.days.map(day => `Day ${day.day}: ${day.report ? money(day.report.revenue + day.report.tips) : day.status === 'pending' ? 'not closed yet' : 'receipt unavailable'}`).join('. ')}. Gold marks the selected day; use Explore a day for details.</desc>
    {[0, .5, 1].map(fraction => <g key={fraction} aria-hidden="true">
      <line x1="42" x2="280" y1={118 - fraction * 96} y2={118 - fraction * 96} className="stroke-ink/15" strokeDasharray={fraction ? '3 4' : undefined} />
      <text x="37" y={122 - fraction * 96} textAnchor="end" className="fill-ink/60 font-body text-[10px]">{compactDollars.format(max * fraction)}</text>
    </g>)}
    {week.days.map((day, index) => {
      const value = day.report ? day.report.revenue + day.report.tips : null;
      const height = value === null ? 0 : value / max * 96, x = 48 + index * 33;
      return <g key={day.day} data-revenue-day={day.day} data-revenue={value ?? day.status} aria-hidden="true">
        {value === null ? <><rect x={x} y="106" width="20" height="12" rx="3" className="fill-none stroke-ink/25" strokeDasharray="3 3" /><text x={x + 10} y="101" textAnchor="middle" className="fill-ink/50 text-[10px]">—</text></> : <>
          {value > 0 ? <rect x={x} y={118 - height} width="20" height={height} rx="4" className={cn('transition-colors motion-reduce:transition-none', day.day === selectedDay ? 'fill-gold stroke-ink/30' : 'fill-teal')} /> : <line x1={x} x2={x + 20} y1="118" y2="118" strokeWidth="3" className={day.day === selectedDay ? 'stroke-gold' : 'stroke-teal'} />}
          {value === 0 && <text x={x + 10} y="108" textAnchor="middle" className="fill-teal text-[10px]">$0</text>}
        </>}
        <text x={x + 10} y="136" textAnchor="middle" className={cn('font-body text-[10px]', day.day === selectedDay ? 'fill-ink font-extrabold' : 'fill-ink/60')}>{day.day}</text>
        {day.day === selectedDay && <circle cx={x + 10} cy="144" r="2" className="fill-gold" />}
      </g>;
    })}
  </svg>;
}
