import { memo } from 'react';
import { CircleAlert, ReceiptText } from 'lucide-react';
import type { CapitalWarning } from './capital-warning';
import { money } from './format';

const titles: Record<CapitalWarning['kind'], string> = { low: 'Cash running low', critical: 'Tonight’s bills at risk' };

/** Persistent one-line warning with a quiet live announcement: changing balances are not announced every tick. */
export const CapitalWarningBanner = memo(function CapitalWarningBanner({ warning, onLedger }: { warning: CapitalWarning; onLedger: () => void }) {
  const { kind, cash, bills } = warning, title = titles[kind];
  const advice = 'The restaurant stays open. If the register is short at closing, the bank covers it and you repay $30 a day.';
  return <section aria-label="Cash safety warning" data-testid="capital-warning" title={advice} className="pointer-events-auto mx-auto mt-1.5 flex max-w-[1600px] items-center gap-2 rounded-xl bg-danger py-0.5 pl-2.5 pr-0.5">
    <CircleAlert size={18} className="shrink-0 text-abyss" aria-hidden="true" />
    <div className="min-w-0 flex-1 leading-tight">
      <h2 className="truncate font-display text-sm text-abyss">{title}</h2>
      <p className="truncate text-[10px] font-bold tabular-nums text-abyss/80" data-testid="capital-warning-balance">Cash {money(cash)} · Tonight’s bills {money(bills)}</p>
    </div>
    <button onClick={onLedger} className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-paper px-2.5 text-[11px] font-extrabold text-teal"><ReceiptText size={15} aria-hidden="true" />Finances</button>
    <p role="alert" aria-atomic="true" className="sr-only">{title}. {advice}</p>
  </section>;
});
