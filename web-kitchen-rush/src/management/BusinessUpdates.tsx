import { ReceiptText, Target, ChevronRight, X } from 'lucide-react';
import { restaurant } from './engine';
import { money } from './format';

/** Quiet, dismissible business updates; opening a receipt never pauses the restaurant. */
export function BusinessUpdates({ onReport, onChallenges }: { onReport: (day: number) => void; onChallenges: () => void }) {
  const away = restaurant.awaySummary, reports = restaurant.state.history;
  const latest = reports[reports.length - 1];
  const challenges = restaurant.state.dailyChallenges, completed = challenges.filter(c => c.rewarded).length;
  return <section aria-label="Business updates" className="absolute bottom-[166px] left-3 z-10 max-w-[calc(100%-24px)] rounded-2xl border border-paper/80 bg-paper/95 p-3 text-ink shadow-md sm:bottom-[112px] sm:left-5 sm:max-w-[330px]">
    <button onClick={onChallenges} aria-label="View daily challenges" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition hover:bg-gold/15"><Target size={19} className="shrink-0 text-teal" /><span className="flex-1 text-xs"><strong className="block">Daily challenges <span className="text-teal">{challenges.length ? `${completed}/3` : ''}</span></strong><span className="text-ink/60">{challenges.length ? completed === 3 ? 'All bonuses paid · see your victories' : `Day ${restaurant.state.day} · earn extra cash` : restaurant.state.phase === 'service' ? 'Fresh challenges start next service day' : 'Open the doors to reveal today’s goals'}</span></span><ChevronRight size={15} className="shrink-0" /></button>
    {away && <div className="mb-2 flex items-start gap-3"><div><h2 className="text-lg">While you were away</h2><p className="text-xs text-ink/65">{Math.max(1, Math.round(away.seconds / 60))} min at 1× · {away.days} days completed</p><p className="mt-1 text-sm font-extrabold text-teal">{away.served} served · {away.cashChange >= 0 ? '+' : ''}{money(away.cashChange)} balance</p><p className="mt-1 text-[10px] text-ink/60">Includes costs & repayments{away.challengeBonus > 0 ? `, plus ${money(away.challengeBonus)} in challenge bonuses` : ''}.</p></div><button aria-label="Dismiss offline summary" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-teal/10" onClick={() => restaurant.dismissAway()}><X size={17} /></button></div>}
    {latest && <button className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-teal/10 px-3 text-left" onClick={() => onReport(latest.day)} aria-label={`Read latest report: Day ${latest.day}`}><ReceiptText size={19} className="shrink-0 text-teal" /><span className="text-xs"><strong className="block">Day {latest.day} report · {latest.profit >= 0 ? '+' : ''}{money(latest.profit)}</strong><span className="text-ink/60">Saved in Ledger · {restaurant.paused ? 'service paused' : restaurant.state.phase === 'service' ? 'service continues' : 'ready when you are'}</span></span></button>}
  </section>;
}
