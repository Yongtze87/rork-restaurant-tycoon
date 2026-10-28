import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, ReceiptText, ShoppingBag } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { money } from './format';
import { DailyChallenges } from './DailyChallenges';
import { challengeBonus } from './daily-challenges';
import { summarizeReport } from './report';
import { TIDES, tideEffectText } from './tides';
import { TideIcon } from './TideCard';
import type { Report } from './types';

type DailyReportProps = {
  report: Report;
  previous?: Report;
  restaurantName: string;
  closing: boolean;
  onContinue: () => void;
  onClose: () => void;
  onInteriors?: () => void;
  /** How a day is named: “Today”, “Mon 27 Oct”… Defaults to “Day n”. */
  label?: (day: number) => string;
};

/** The same immutable daily receipt is shown at closing and when reopened from the ledger. */
export function DailyReport({ report, previous, restaurantName, closing, onContinue, onClose, onInteriors, label = day => `Day ${day}` }: DailyReportProps) {
  const summary = summarizeReport(report, previous);
  const change = summary.profitChange;
  const ChangeIcon = change === null || change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const rows = [
    { label: 'Food sales', value: report.revenue },
    { label: 'Tips', value: report.tips },
    ...(summary.branch > 0 ? [{ label: 'Branch income', value: summary.branch }] : []),
    { label: 'Total revenue', value: summary.totalRevenue, total: true },
    { label: 'Ingredients', value: -report.ingredients },
    { label: 'Labor costs', value: -report.wages },
    { label: 'Rent', value: -report.rent },
    ...(report.debtPayment > 0 ? [{ label: 'Loan repayment', value: -report.debtPayment }] : []),
    { label: 'Total costs', value: -summary.totalCosts, total: true },
  ];
  return <Dialog open onOpenChange={open => { if (!open && !closing) onClose(); }}>
    <DialogContent
      onEscapeKeyDown={event => { if (closing) event.preventDefault(); }}
      onPointerDownOutside={event => { if (closing) event.preventDefault(); }}
      className="flex max-h-[90svh] w-[calc(100%-24px)] max-w-[580px] flex-col gap-0 overflow-hidden rounded-2xl border-paper bg-paper p-0 text-ink shadow-[0_0_0_1px_#A57BFF40,0_24px_60px_#00000080] sm:rounded-2xl [&>button:last-child]:hidden"
    >
      <div className="shrink-0 border-b border-dashed border-ink/20 px-5 py-4 sm:px-7">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.18em] text-teal"><ReceiptText size={16} aria-hidden="true" />Daily business summary <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-gold/25 px-2 py-1 tracking-normal">{label(report.day)}</span></div>
        <DialogTitle className="font-display text-xl">{closing ? 'That’s a wrap.' : `${label(report.day)} summary`}</DialogTitle>
        <DialogDescription className="mt-1 break-words text-xs text-ink/65">{restaurantName} · {label(report.day)}</DialogDescription>
        <p data-testid="report-tide" className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-teal/10 px-2.5 py-1 text-[11px] font-extrabold text-teal"><TideIcon tide={report.tide} size={14} className="shrink-0" /><span className="min-w-0">{TIDES[report.tide].name} <span className="font-semibold text-ink/65">· {tideEffectText(report.tide)}</span></span></p>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold sm:px-7" role="region" aria-label="Daily report details" tabIndex={0} data-testid="report-scroll">
        <dl className="grid grid-cols-2 gap-3">
          <div className="min-w-0 rounded-2xl bg-ink/[.06] p-3"><dt className="text-xs font-bold text-ink/65">Total revenue</dt><dd data-testid="report-revenue" className="mt-1 break-words font-display text-lg tabular-nums sm:text-xl">{money(summary.totalRevenue)}</dd><p className="mt-1 text-[10px] text-ink/60">Food sales + tips{summary.branch > 0 ? ' + branches' : ''}</p></div>
          <div className="min-w-0 rounded-2xl bg-ink/[.06] p-3"><dt className="text-xs font-bold text-ink/65">Labor costs</dt><dd data-testid="report-labor" className="mt-1 break-words font-display text-lg tabular-nums sm:text-xl">{money(report.wages)}</dd><p className="mt-1 text-[10px] text-ink/60">All staff wages</p></div>
          <div className={cn('col-span-2 rounded-2xl p-3', report.profit < 0 ? 'bg-danger/10' : 'bg-teal text-paper')}>
            <div className="flex flex-wrap items-center justify-between gap-2"><dt className="font-bold">Net profit</dt><span className={cn('rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide', report.profit < 0 ? 'bg-danger/15 text-danger' : 'bg-paper/15')}>{report.profit < 0 ? 'Loss' : report.profit > 0 ? 'Profitable day' : 'Break-even'}</span></div>
            <dd data-testid="report-profit" className={cn('mt-1 break-words font-display text-2xl tabular-nums', report.profit < 0 && 'text-danger')}>{report.profit > 0 ? '+' : ''}{money(report.profit)}</dd>
            <p className="mt-2 text-xs opacity-80">{summary.margin === null ? 'No sales today · margin unavailable' : `${summary.margin.toFixed(1)}% net margin`}{report.debtPayment > 0 ? ' · after loan repayment' : ''}</p>
          </div>
        </dl>
        <div className={cn('my-3 flex items-start gap-2 rounded-xl p-3 text-xs', change === null || change === 0 ? 'bg-ink/5 text-ink/65' : change > 0 ? 'bg-teal/10 text-teal' : 'bg-danger/10 text-danger')} data-testid="report-comparison">
          <ChangeIcon size={18} className="shrink-0" aria-hidden="true" />
          <p>{change === null ? report.day === 1 ? 'Your first day. Tomorrow’s receipt will compare with this one.' : 'No earlier summary retained for comparison.' : change === 0 ? `Net profit is unchanged from ${label(previous!.day)}.` : `Net profit is ${money(Math.abs(change))} ${change > 0 ? 'higher' : 'lower'} than ${label(previous!.day)}.`}</p>
        </div>
        <table className="w-full text-sm" aria-label={`${label(report.day)} income and expenses`}>
          <caption className="pb-2 text-left font-display text-base">Every dollar, accounted for</caption>
          <thead><tr className="text-[10px] uppercase tracking-wider text-ink/60"><th scope="col" className="pb-2 text-left font-extrabold">Income & expenses</th><th scope="col" className="pb-2 text-right font-extrabold">Amount</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.label} className={cn('border-t border-ink/10', row.total && 'bg-teal/5')}><th scope="row" className={cn('py-2 pl-2 text-left font-semibold', row.total && 'font-extrabold')}>{row.label}</th><td className="py-2 pr-2 text-right font-extrabold tabular-nums">{money(row.value)}</td></tr>)}</tbody>
          <tfoot><tr className="border-t-2 border-dashed border-ink/25"><th scope="row" className="py-3 pl-2 text-left font-display text-base">Net profit</th><td className={cn('py-3 pr-2 text-right font-display text-base tabular-nums', report.profit < 0 ? 'text-danger' : 'text-teal')}>{money(report.profit)}</td></tr></tfoot>
        </table>
        <p className="text-[11px] leading-relaxed text-ink/60">Daily result = food sales + tips{summary.branch > 0 ? ' + branch income' : ''} − ingredients − wages − rent{report.debtPayment > 0 ? ' − loan repayment' : ''}. Building, hiring, training and all challenge/milestone rewards are separate from service-day results.</p>
        {report.challenges.length > 0 && <div className="mt-3"><div data-testid="report-challenge-bonus" className="mb-3 rounded-xl bg-gold/20 p-3 text-xs"><p className="flex justify-between gap-2 font-extrabold"><span>Challenge bonus · paid separately</span><span className="text-teal">+{money(challengeBonus(report.challenges))}</span></p><p className="mt-1 text-ink/65">Added to your cash when earned. Not included in revenue or net profit above.</p></div><DailyChallenges challenges={report.challenges} day={report.day} title={`${label(report.day)} challenges`} archived /></div>}
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-dashed border-ink/20 pt-4 text-center">{[['Guests served', report.served], ['Missed guests', report.full ? `${report.missed} (${report.full} full)` : report.missed], ['Day rating', `${report.rating.toFixed(1)}/5`]].map(([label, value]) => <div key={label}><dt className="text-[10px] text-ink/65">{label}</dt><dd className="mt-1 font-display text-base tabular-nums">{value}</dd></div>)}</dl>
      </div>
      <div className="shrink-0 border-t border-ink/10 px-5 pb-5 pt-3 sm:px-7">
        {onInteriors && <button type="button" onClick={onInteriors} className="mb-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-teal/20 bg-teal/5 px-3 text-sm font-extrabold text-teal hover:bg-teal/10"><ShoppingBag size={17} aria-hidden="true" />Shop interiors</button>}
        <button className="game-button game-button-primary min-h-12 w-full text-base" onClick={closing ? onContinue : onClose}>{closing ? `Plan day ${report.day + 1}` : 'Back to ledger'}<ArrowRight size={18} aria-hidden="true" /></button>
      </div>
    </DialogContent>
  </Dialog>;
}
