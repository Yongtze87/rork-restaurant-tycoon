import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { CashAnimation, incomeLabels, type CashNotice } from './cash-feedback';
import { restaurant, type RestaurantEngine } from './engine';
import { DollarBill } from './DollarBill';
import { money } from './format';

type RegisterView = { displayed: number; notice: CashNotice | null };

/** Local presentation frames never rerender the restaurant or modify its real balance. */
export const CashRegister = memo(function CashRegister({ engine = restaurant }: { engine?: RestaurantEngine }) {
  useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const { cash, phase } = engine.state, receipts = engine.incomeReceipts;
  const session = useRef(engine.state), seen = useRef<number>(receipts[receipts.length - 1]?.id ?? 0);
  const motion = useRef<CashAnimation>(new CashAnimation(cash)), reduced = useReducedMotionQuery();
  const [view, setView] = useState<RegisterView>({ displayed: cash, notice: null });
  const frozen = engine.paused && phase === 'service';
  useLayoutEffect(() => {
    if (session.current !== engine.state || phase === 'report') {
      session.current = engine.state; motion.current = new CashAnimation(cash);
      seen.current = receipts[receipts.length - 1]?.id ?? 0;
    } else {
      const incoming = receipts.filter(receipt => receipt.id > seen.current);
      motion.current.sync(cash, incoming);
      seen.current = receipts[receipts.length - 1]?.id ?? seen.current;
      motion.current.advance(0, true, reduced.matches);
    }
    setView({ displayed: motion.current.displayed, notice: motion.current.notice });
  }, [cash, receipts, engine, engine.state, phase, reduced]);
  useEffect(() => {
    if (!view.notice) return;
    let frame = 0, last = performance.now();
    const visibility = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', visibility);
    const tick = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000); last = now;
      motion.current.advance(dt, document.hidden || engine.paused && engine.state.phase === 'service', reduced.matches);
      const displayed = motion.current.displayed, notice = motion.current.notice;
      setView(previous => previous.displayed === displayed && previous.notice === notice ? previous : { displayed, notice });
      if (notice) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility); };
  }, [view.notice, engine, reduced]);
  return <div className="pointer-events-none relative flex items-center gap-1.5 sm:gap-2" data-testid="cash-register">
    <span key={`bill-${view.notice?.id ?? 'idle'}`} className={cn('inline-flex', view.notice && 'animate-cash-pulse motion-reduce:animate-none', frozen && '[animation-play-state:paused]')}><DollarBill /></span>
    <div><p className={cn('text-[9px] font-extrabold uppercase tracking-wider text-ink/50', view.notice && 'invisible sm:visible')}>Cash</p><p className={cn('whitespace-nowrap font-display text-xl tabular-nums', view.notice && 'text-teal')} data-testid="cash" aria-label={`Cash ${money(cash)}`}><span aria-hidden="true">{money(view.displayed)}</span></p></div>
    {view.notice && <div key={`income-${view.notice.id}`} data-testid="cash-income" aria-hidden="true" className={cn('absolute left-[34px] top-0 flex w-max max-w-[145px] flex-row-reverse items-center gap-1 rounded bg-teal px-1 text-paper sm:left-1/2 sm:top-full sm:mt-3 sm:-translate-x-1/2 sm:flex-col sm:gap-0 sm:rounded-xl sm:border-2 sm:border-paper sm:px-3 sm:py-1.5 sm:shadow-md sm:motion-safe:animate-cash-arrive', frozen && '[animation-play-state:paused]')}>
      <span className="absolute -top-1.5 hidden size-2 rotate-45 sm:block border-l-2 border-t-2 border-paper bg-teal" />
      <span className="font-body text-[9px] font-extrabold leading-[12px] tabular-nums text-abyss sm:font-display sm:text-xl sm:font-normal sm:leading-none">+{money(view.notice.amount)}</span>
      <span className="text-center text-[9px] font-extrabold leading-[12px] sm:mt-1 sm:leading-tight"><span className="sm:hidden">{{ service: 'Paid', sale: 'Sale', milestone: 'Bonus', challenge: 'Quest', loan: 'Loan', income: 'In' }[view.notice.source]}</span><span className="hidden sm:inline">{incomeLabels[view.notice.source]}</span></span>
    </div>}
    <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">{view.notice ? `${incomeLabels[view.notice.source]}: ${money(view.notice.amount)} received${view.notice.tip ? `, including ${money(view.notice.tip)} tip` : ''}.` : ''}</span>
  </div>;
});
