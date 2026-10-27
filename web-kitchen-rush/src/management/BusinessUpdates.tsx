import { ReceiptText, Target, ChevronRight, X } from 'lucide-react';
import { OFFLINE_SERVICE_HOURS, restaurant } from './engine';
import { money } from './format';
import { TideCard } from './TideCard';

/** Quiet, dismissible business updates; opening a receipt never pauses the restaurant. */
export function BusinessUpdates({ onReport, onChallenges }: { onReport: (day: number) => void; onChallenges: () => void }) {
  const away = restaurant.awaySummary, reports = restaurant.state.history;
  const latest = reports[reports.length - 1];
  const challenges = restaurant.state.dailyChallenges, completed = challenges.filter(c => c.rewarded).length;
  return <section aria-label="Business updates" className="absolute bottom-2 left-2 z-10 w-[min(300px,calc(100%-16px))] rounded-xl border border-teal/25 bg-paper/85 p-1 text-ink backdrop-blur sm:left-3">
    <button data-tutorial="challenges" onClick={onChallenges} aria-label="View daily challenges" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left transition hover:bg-gold/15"><Target size={16} className="shrink-0 text-teal" /><span className="flex-1 text-[11px] leading-tight"><strong className="block">Daily challenges <span className="text-teal">{challenges.length ? `${completed}/3` : ''}</span></strong><span className="text-ink/60">{challenges.length ? completed === 3 ? 'All bonuses paid · see your victories' : `Day ${restaurant.state.day} · earn extra cash` : restaurant.state.phase === 'service' ? 'Fresh challenges start next service day' : 'Open the doors to reveal today’s goals'}</span></span><ChevronRight size={15} className="shrink-0" /></button>
    <TideCard tide={restaurant.state.tide} day={restaurant.state.day} />
    {away && <div className="mb-1 flex items-start gap-2 px-2"><div><h2 className="text-sm">While you were away</h2><p className="text-[11px] text-ink/65">{Math.max(1, Math.round(away.seconds / 60))} min · {away.days} days completed</p>{away.capped && <p className="mt-1 text-[11px] text-gold">Offline service stops after {OFFLINE_SERVICE_HOURS} hours. Buildings kept going.</p>}<p className="mt-0.5 text-xs font-extrabold text-teal">{away.served} served · {away.cashChange >= 0 ? '+' : ''}{money(away.cashChange)} balance</p><p className="mt-1 text-[10px] text-ink/60">Includes costs & repayments{away.challengeBonus > 0 ? `, plus ${money(away.challengeBonus)} in challenge bonuses` : ''}.</p></div><button aria-label="Dismiss offline summary" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-teal/10" onClick={() => restaurant.dismissAway()}><X size={17} /></button></div>}
    {latest && <button className="flex min-h-11 w-full items-center gap-2 rounded-lg bg-teal/10 px-2 text-left" onClick={() => onReport(latest.day)} aria-label={`Read latest report: Day ${latest.day}`}><ReceiptText size={16} className="shrink-0 text-teal" /><span className="text-[11px] leading-tight"><strong className="block">Day {latest.day} report · {latest.profit >= 0 ? '+' : ''}{money(latest.profit)}</strong><span className="text-ink/60">Saved in Ledger · {restaurant.state.phase === 'service' ? 'service continues' : 'ready when you are'}</span></span></button>}
  </section>;
}
