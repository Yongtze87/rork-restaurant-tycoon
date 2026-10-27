import { memo } from 'react';
import { CircleAlert, DoorClosed, Hammer, Play, ReceiptText } from 'lucide-react';
import type { CapitalWarning } from './capital-warning';
import { money } from './format';

const titles: Record<CapitalWarning['kind'], string> = {
  low: 'Cash running low', critical: 'Closing bills at risk', closing: 'Closing for renovation', closed: 'Low reopening funds',
};

/** Persistent warning with a quiet live announcement: changing balances are not announced every tick. */
export const CapitalWarningBanner = memo(function CapitalWarningBanner({ warning, paused, onClose, onResume, onLedger }: {
  warning: CapitalWarning; paused: boolean; onClose: () => void; onResume: () => void; onLedger: () => void;
}) {
  const { kind, cash, bills, debtPayment, reserve } = warning;
  const closing = kind === 'closing', closed = kind === 'closed';
  const title = titles[kind];
  const instruction = closing
    ? paused ? 'Service paused. Resume to finish closing; closing bills still apply.' : 'No new arrivals. Finishing guests; closing bills still apply.'
    : closed ? 'Already closed. Review costs before reopening.' : 'Close for renovation to review costs. Closing bills still apply.';
  return <section aria-label="Cash safety warning" data-testid="capital-warning" className="pointer-events-auto mx-auto mt-1.5 flex max-w-[1600px] items-center gap-2 rounded-xl bg-danger py-0.5 pl-2.5 pr-0.5 backdrop-blur" title={instruction}>
    {closing ? <DoorClosed size={18} className="shrink-0 text-abyss" aria-hidden="true" /> : <CircleAlert size={18} className="shrink-0 text-abyss" aria-hidden="true" />}
    <div className="min-w-0 flex-1 leading-tight">
      <h2 className="truncate font-display text-sm text-abyss">{title}</h2>
      <p className="truncate text-[10px] font-bold tabular-nums text-abyss/80" data-testid="capital-warning-balance">Cash {money(cash)} · {closed ? 'Daily bills' : 'Closing bills'} {money(bills)}<span className="hidden sm:inline"> · {closing ? instruction : `Keep ${money(reserve)}: wages, rent${debtPayment > 0 ? ', repayment' : ''} + $30 ingredients.`}</span></p>
    </div>
    {closing && !paused ? <p className="flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-[11px] font-extrabold text-abyss"><DoorClosed size={14} aria-hidden="true" />Renovation queued</p>
      : <button onClick={closed ? onLedger : closing ? onResume : onClose} className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-paper px-2.5 text-[11px] font-extrabold text-teal transition active:scale-[.98] motion-reduce:transition-none">
        {closed ? <ReceiptText size={15} aria-hidden="true" /> : closing ? <Play size={15} aria-hidden="true" /> : <Hammer size={15} aria-hidden="true" />}
        {closed ? 'Review finances' : closing ? 'Resume to finish closing' : 'Close for renovation'}
      </button>}
    <p role="alert" aria-atomic="true" className="sr-only">{title}. {instruction}</p>
  </section>;
});
