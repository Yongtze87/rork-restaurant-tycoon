import { useEffect, useSyncExternalStore } from 'react';
import { TriangleAlert } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { money } from './format';
import { clearSpend, listeners, pendingSpend } from './spend-guard';

/** The confirmation itself: what you would have left, what the next payroll needs, and what going ahead means. */
export function SpendGuardDialog() {
  const p = useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, pendingSpend);
  // A question left open when the game screen goes away must not come back later.
  useEffect(() => clearSpend, []);
  return <AlertDialog open={Boolean(p)} onOpenChange={open => { if (!open) clearSpend(); }}>
    {p && <AlertDialogContent className="w-[calc(100%-24px)] max-w-sm gap-3 rounded-2xl border-gold/50 bg-paper p-4 text-ink">
      <AlertDialogTitle className="flex items-center gap-2 font-display text-lg"><TriangleAlert size={18} className="text-gold" aria-hidden="true" />Tight on cash</AlertDialogTitle>
      <AlertDialogDescription asChild><div className="space-y-2 text-xs leading-relaxed text-ink/75">
        <p>{p.what} costs <strong className="text-ink">{money(p.cost)}</strong>{p.extraDaily ? <> and adds <strong className="text-ink">{money(p.extraDaily)}/shift</strong> in wages</> : null}.</p>
        <dl className="grid grid-cols-2 gap-1.5 text-center">
          <div className="rounded-lg bg-ink/[.06] p-2"><dt className="text-[10px]">You’d have left</dt><dd data-testid="spend-after" className="font-display text-base text-danger">{money(p.after)}</dd></div>
          <div className="rounded-lg bg-ink/[.06] p-2"><dt className="text-[10px]">Next payroll + $30</dt><dd data-testid="spend-reserve" className="font-display text-base">{money(p.reserve)}</dd></div>
        </dl>
        <p>Wages and rent are paid at the end of each shift, and the kitchen needs about $30 for ingredients. If the register runs short, the bank covers the payroll and you repay it $30 a shift.</p>
      </div></AlertDialogDescription>
      <AlertDialogFooter className="flex-row gap-2 sm:space-x-0">
        <AlertDialogCancel className="mt-0 min-h-11 flex-1 rounded-xl border-teal/40 bg-teal text-paper hover:bg-teal/90 hover:text-paper">Keep my cash</AlertDialogCancel>
        <AlertDialogAction className="min-h-11 flex-1 rounded-xl border border-ink/20 bg-transparent text-ink hover:bg-ink/10" onClick={() => { const run = p.run; clearSpend(); run(); }}>Spend anyway</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>}
  </AlertDialog>;
}
