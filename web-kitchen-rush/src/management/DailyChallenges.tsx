import { Check, Flame, Leaf, Sparkles, Star, Target, Timer, Users, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { challengeBonus, challengeObjective, challengeTitle } from './daily-challenges';
import { DISHES } from './types';
import { money } from './format';
import { Info } from './GameWindow';
import type { DailyChallenge } from './types';

const icons = { special: Star, served: Users, quick: Timer, revenue: Wallet, tips: Sparkles };
const iconFor = (c: DailyChallenge) => c.kind === 'dish' ? (c.dish && DISHES[c.dish].station === 'grill' ? Flame : Leaf) : icons[c.kind];

/** Read-only challenge board: real service credits rewards automatically, including offline. */
export function DailyChallenges({ challenges, day, archived = false, beforeOpening = false, title }: { challenges: readonly DailyChallenge[]; day: number; archived?: boolean; beforeOpening?: boolean; /** Defaults to “Day n challenges”. */ title?: string }) {
  const bonus = challengeBonus(challenges), done = challenges.filter(c => c.rewarded).length;
  return <section aria-label={title ?? `Day ${day} challenges`} className="mb-3 rounded-xl border border-gold/50 bg-gold/10 p-2.5">
    <div className="flex items-center gap-2"><Target size={15} className="shrink-0 text-teal" aria-hidden="true" /><h3 className="min-w-0 flex-1 font-display text-base leading-tight">{archived ? title ?? `Day ${day} challenges` : 'Today’s challenges'}</h3>
      {challenges.length > 0 && <span role={archived ? undefined : 'status'} aria-live={archived ? undefined : 'polite'} className="text-[11px] font-extrabold text-teal">{done}/3 completed · {money(bonus)} paid</span>}
      {!archived && <Info>Three new challenges every day at midnight, picked for your menu. Rewards are paid automatically, even while you are away; finish all three for a pearl and a Current charm. Gold-star guests are special customers; only paid meals count.</Info>}</div>
    {!challenges.length ? <p className="mt-1 text-xs text-ink/65">{archived ? 'No challenges that day.' : beforeOpening ? 'Open the restaurant to reveal three challenges.' : 'New challenges arrive at midnight.'}</p>
      : <ul className="mt-2 space-y-1.5">{challenges.map(challenge => {
        const Icon = iconFor(challenge), objective = challengeObjective(challenge), currency = challenge.kind === 'revenue' || challenge.kind === 'tips';
        return <li key={`${challenge.day}-${challenge.kind}-${challenge.dish}`} className={cn('flex items-center gap-2 rounded-lg p-2', challenge.rewarded ? 'bg-teal/10' : 'bg-paper/80')}>
          <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', challenge.rewarded ? 'bg-teal text-paper' : 'bg-gold/25 text-ink')}>{challenge.rewarded ? <Check size={15} /> : <Icon size={15} />}</span>
          <div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2"><h4 className="truncate text-xs font-extrabold">{challengeTitle(challenge)}</h4><span className={cn('shrink-0 text-[11px] font-extrabold', challenge.rewarded ? 'text-teal' : 'text-ink/70')}>{challenge.rewarded ? `Paid +${money(challenge.reward)}` : archived ? 'Expired' : `+${money(challenge.reward)}`}</span></div>
            <progress aria-label={objective} value={challenge.progress} max={challenge.target} className="mt-1 h-1.5" title={objective} />
            <p className="mt-0.5 text-[10px] tabular-nums text-ink/55">{currency ? money(challenge.progress) : challenge.progress} / {currency ? money(challenge.target) : challenge.target}</p></div>
        </li>;
      })}</ul>}
  </section>;
}
