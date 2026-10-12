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
  return <section aria-label="Cash safety warning" data-testid="capital-warning" className="pointer-events-auto mx-auto mt-2 max-w-[1600px] rounded-2xl border border-ink/15 bg-tomato p-2 shadow-md sm:flex sm:items-center sm:gap-3 sm:px-4 sm:py-2">
    <div className="flex shrink-0 items-center gap-2 px-1 pb-1.5 text-paper sm:max-w-[210px] sm:px-0 sm:pb-0">
      {closing ? <DoorClosed size={22} className="shrink-0" aria-hidden="true" /> : <CircleAlert size={22} className="shrink-0" aria-hidden="true" />}
      <h2 className="font-display text-xl font-semibold leading-tight">{title}</h2>
    </div>
    <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl bg-paper px-3 py-2 text-ink sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1 text-[11px] leading-snug sm:text-xs">
        <p className="font-extrabold tabular-nums" data-testid="capital-warning-balance">Cash {money(cash)} · {closed ? 'Daily bills' : 'Closing bills'} {money(bills)}</p>
        <p>{closing ? instruction : `Keep ${money(reserve)}: wages, rent${debtPayment > 0 ? ', repayment' : ''} + $30 ingredients.`}</p>
        {!closing && <p className="mt-0.5 text-ink/75">{instruction}</p>}
      </div>
      {closing && !paused ? <p className="flex min-h-11 shrink-0 items-center justify-center gap-2 text-xs font-extrabold text-teal"><DoorClosed size={16} aria-hidden="true" />Renovation queued</p>
        : <button onClick={closed ? onLedger : closing ? onResume : onClose} className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-teal px-3 text-xs font-extrabold text-paper transition active:scale-[.98] motion-reduce:transition-none">
          {closed ? <ReceiptText size={17} aria-hidden="true" /> : closing ? <Play size={17} aria-hidden="true" /> : <Hammer size={17} aria-hidden="true" />}
          {closed ? 'Review finances' : closing ? 'Resume to finish closing' : 'Close for renovation'}
        </button>}
    </div>
    <p role="alert" aria-atomic="true" className="sr-only">{title}. {instruction}</p>
  </section>;
});
