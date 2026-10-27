import { Check, Flame, Leaf, Sparkles, Star, Target, Timer, Users, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { challengeBonus, challengeObjective, challengeTitle } from './daily-challenges';
import { DISHES } from './types';
import { money } from './format';
import type { DailyChallenge } from './types';

const icons = { special: Star, served: Users, quick: Timer, revenue: Wallet, tips: Sparkles };
const iconFor = (c: DailyChallenge) => c.kind === 'dish' ? (c.dish && DISHES[c.dish].station === 'grill' ? Flame : Leaf) : icons[c.kind];

/** Read-only challenge board: real service credits rewards automatically, including offline. */
export function DailyChallenges({ challenges, day, archived = false, pendingUntilTomorrow = false }: { challenges: readonly DailyChallenge[]; day: number; archived?: boolean; pendingUntilTomorrow?: boolean }) {
  const bonus = challengeBonus(challenges), done = challenges.filter(c => c.rewarded).length;
  return <section aria-label={`Day ${day} challenges`} className="mb-3 rounded-2xl border border-gold/50 bg-gold/10 p-3">
    <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-teal"><Target size={15} />Daily challenges</span><span className="rounded-full bg-paper px-2 py-1 text-[10px] font-extrabold">Day {day}</span></div>
    <h3 className="mt-2 text-base">{archived ? 'The day’s little victories' : 'A little extra ambition'}</h3>
    {!challenges.length ? <p className="mt-2 text-xs leading-relaxed text-ink/65">{pendingUntilTomorrow ? 'Your saved service is already underway. Three fresh challenges will start next service day; today’s progress is unchanged.' : 'Open the restaurant to reveal 3 random challenges, chosen for your menu. Rewards are added automatically when you complete them.'}</p> : <>
      <p className="mb-3 mt-1 text-xs leading-relaxed text-ink/65">{archived ? 'Final progress. Unfinished challenges expired at closing.' : 'Finish before this service day ends. Rewards are paid automatically, even offline.'}</p>
      <ul className="space-y-2">{challenges.map(challenge => {
        const Icon = iconFor(challenge), objective = challengeObjective(challenge);
        const currency = challenge.kind === 'revenue' || challenge.kind === 'tips';
        return <li key={`${challenge.day}-${challenge.kind}-${challenge.dish}`} className={cn('rounded-xl border p-3', challenge.rewarded ? 'border-teal/20 bg-teal/5' : 'border-ink/10 bg-paper/80')}>
          <div className="flex items-start gap-2"><span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', challenge.rewarded ? 'bg-teal text-paper' : 'bg-gold/25 text-ink')}>{challenge.rewarded ? <Check size={17} /> : <Icon size={17} />}</span><div className="min-w-0 flex-1"><h4 className="text-sm font-extrabold">{challengeTitle(challenge)}</h4><p className="mt-0.5 text-[11px] leading-relaxed text-ink/65">{objective}</p></div></div>
          <progress aria-label={objective} value={challenge.progress} max={challenge.target} className="mt-3 h-1.5" />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] font-extrabold"><span className="tabular-nums text-ink/60">{currency ? money(challenge.progress) : challenge.progress} / {currency ? money(challenge.target) : challenge.target}</span><span className={challenge.rewarded ? 'text-teal' : 'text-ink/70'}>{challenge.rewarded ? `Paid +${money(challenge.reward)}` : archived ? 'Expired' : `Reward +${money(challenge.reward)}`}</span></div>
        </li>;
      })}</ul>
      <p role={archived ? undefined : 'status'} aria-live={archived ? undefined : 'polite'} className="mt-3 flex flex-wrap justify-between gap-1 text-xs font-extrabold text-teal"><span>{done}/3 completed</span><span>{money(bonus)} bonus paid</span></p>
      {!archived && <p className="mt-2 text-[10px] leading-relaxed text-ink/65"><Star className="mr-1 inline size-3 fill-gold text-ink" aria-hidden="true" />Gold-star guests are special customers. Only paid meals count. New challenges arrive next service day; progress does not carry over.</p>}
    </>}
  </section>;
}
