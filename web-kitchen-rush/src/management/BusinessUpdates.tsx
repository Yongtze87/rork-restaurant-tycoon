import { useState } from 'react';
import { ChevronDown, ChevronRight, ReceiptText, Target, Waves } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { restaurant } from './engine';
import { money } from './format';
import { TideCard, TideIcon } from './TideCard';
import { TIDES } from './tides';
import { Stat } from './GameWindow';

const KEY = 'vast-ocean-updates-open';
const remembered = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** Today at a glance: a small chip over the scene that unfolds into challenges, the tide and today's takings. */
export function BusinessUpdates({ onLedger }: { onLedger: () => void }) {
  const [open, setOpen] = useState<boolean>(remembered);
  const toggle = (next: boolean) => { setOpen(next); try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* storage blocked: just this session */ } };
  const s = restaurant.state, challenges = s.dailyChallenges, done = challenges.filter(c => c.rewarded).length, today = restaurant.todayTotals();
  if (!open) return <button type="button" onClick={() => toggle(true)} aria-expanded="false" aria-label={`Show today: challenges ${challenges.length ? `${done} of 3` : 'not started'}, ${TIDES[s.tide].name}`} className="absolute bottom-2 left-2 z-10 flex min-h-11 max-w-[calc(100%-16px)] items-center gap-2 rounded-full border border-teal/25 bg-paper/85 px-3 text-[11px] font-extrabold backdrop-blur sm:left-3">
    <span data-tutorial="challenges" className="flex items-center gap-1"><Target size={14} className="text-teal" aria-hidden="true" />{challenges.length ? `${done}/3` : '—'}</span>
    <span className="h-4 w-px bg-ink/15" aria-hidden="true" />
    <span data-tutorial="tide" className="flex min-w-0 items-center gap-1"><TideIcon tide={s.tide} size={14} className="shrink-0 text-violet" /><span className="truncate">{TIDES[s.tide].name}</span></span>
  </button>;
  return <section aria-label="Business updates" className="absolute bottom-2 left-2 z-10 w-[min(300px,calc(100%-16px))] rounded-xl border border-teal/25 bg-paper/90 p-1 text-ink backdrop-blur sm:left-3">
    <div className="flex items-center justify-between pl-2"><h2 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/55">Today</h2><button type="button" onClick={() => toggle(false)} aria-label="Hide today’s updates" className="grid size-9 place-items-center rounded-full hover:bg-ink/5"><ChevronDown size={16} /></button></div>
    <button data-tutorial="challenges" onClick={onLedger} aria-label="View daily challenges" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left transition hover:bg-gold/15"><Target size={16} className="shrink-0 text-teal" /><span className="flex-1 text-[11px] leading-tight"><strong className="block">Challenges <span className="text-teal">{challenges.length ? `${done}/3` : ''}</span></strong><span className="text-ink/60">{challenges.length ? done === 3 ? 'All done · new ones at midnight' : 'Earn extra cash today' : 'Open the doors to start'}</span></span><ChevronRight size={15} className="shrink-0" /></button>
    <TideCard tide={s.tide} />
    <button type="button" onClick={onLedger} aria-label="View today’s takings" className="flex min-h-11 w-full items-center gap-2 rounded-lg bg-teal/10 px-2 text-left"><ReceiptText size={16} className="shrink-0 text-teal" /><span className="flex-1 text-[11px] leading-tight"><strong className="block">{today.served} served · {money(today.revenue + today.tips + today.branch)} in</strong><span className="text-ink/60">Today so far</span></span><ChevronRight size={15} className="shrink-0" /></button>
  </section>;
}

/** Shown once on return: what the crew did while you were away. */
export function WelcomeBack() {
  const away = restaurant.awaySummary;
  if (!away || restaurant.catchingUp) return null;
  const hours = away.seconds / 3600, time = hours >= 1 ? `${Math.round(hours * 10) / 10} h` : `${Math.max(1, Math.round(away.seconds / 60))} min`;
  return <Dialog open onOpenChange={next => { if (!next) restaurant.dismissAway(); }}>
    <DialogContent className="w-[calc(100%-24px)] max-w-sm gap-3 rounded-2xl border-teal/30 bg-paper p-4 text-ink">
      <DialogTitle className="flex items-center gap-2 font-display text-xl"><Waves size={20} className="text-teal" aria-hidden="true" />Welcome back</DialogTitle>
      <DialogDescription className="text-xs text-ink/65">Your crew kept the doors open for {time}{away.capped ? ', one full shift: the most they work without you' : ''}. Building timers kept running.</DialogDescription>
      <div className="grid grid-cols-3 gap-2"><Stat label="Served" value={away.served} /><Stat label="Cash" value={`${away.cashChange >= 0 ? '+' : ''}${money(away.cashChange)}`} tone={away.cashChange >= 0 ? 'teal' : 'danger'} /><Stat label="Challenge bonus" value={money(away.challengeBonus)} tone="gold" /></div>
      <p className="text-[11px] text-ink/55">Cash includes wages, rent and repayments.</p>
      <button type="button" onClick={() => restaurant.dismissAway()} className="game-button game-button-primary min-h-11 text-sm">Back to the reef</button>
    </DialogContent>
  </Dialog>;
}
