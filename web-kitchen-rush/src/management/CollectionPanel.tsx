import { Check, Gem, Waves } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { ACHIEVEMENTS, FAMILIES, FAMILY_IDS, isClaimable, isClaimed, progress, visibleSteps, type Achievement } from './collections';
import type { RestaurantState } from './types';
import { SmallButton, type Action } from './Panels';

const count = (n: number) => n.toLocaleString('en-US');
/** Long-term achievements, grouped by family. Every number is read from the simulation's save. */
export function CollectionPanel({ state, action }: { state: RestaurantState; action: Action }) {
  const claimed = ACHIEVEMENTS.filter(a => isClaimed(state, a)).length;
  return <div className="space-y-5">
    <p className="text-sm text-ink/65">Long-term goals that pay out pearls. Try every dish, building, zone and tide. <span className="font-bold text-ink">{claimed}/{ACHIEVEMENTS.length} collected.</span></p>
    {FAMILY_IDS.map(family => {
      const all = ACHIEVEMENTS.filter(a => a.family === family), done = all.filter(a => isClaimed(state, a)).length, ready = all.filter(a => isClaimable(state, a)).length;
      return <section key={family} aria-label={FAMILIES[family].name} className="space-y-2">
        <div className="flex items-end justify-between gap-2"><div className="min-w-0"><h3 className="text-base leading-tight">{FAMILIES[family].name}</h3><p className="text-xs text-ink/60">{FAMILIES[family].description}</p></div>
          <p className="shrink-0 text-xs font-bold tabular-nums text-ink/70">{ready > 0 && <span className="mr-2 rounded-full bg-violet px-2 py-0.5 text-abyss">{ready} ready</span>}{done}/{all.length}</p></div>
        {visibleSteps(state, family).map(a => <AchievementCard key={a.chain} state={state} item={a} action={action} />)}
      </section>;
    })}
  </div>;
}
function AchievementCard({ state, item, action }: { state: RestaurantState; item: Achievement; action: Action }) {
  const value = progress(state, item), done = isClaimed(state, item), ready = isClaimable(state, item);
  return <div role="group" aria-label={item.title} className={cn('rounded-xl border p-3', ready ? 'border-violet/60 bg-violet/15' : 'border-ink/10 bg-ink/[.04]', done && 'opacity-70')}>
    <div className="flex items-start justify-between gap-2"><h4 className="min-w-0 font-display text-base leading-tight">{item.title}</h4>
      <span className="flex shrink-0 items-center gap-1 text-xs font-extrabold text-violet" aria-label={`Reward: ${item.reward.pearls} pearls${item.reward.tideCharms ? ` and ${item.reward.tideCharms} Tide charm` : ''}`}><Gem size={13} aria-hidden="true" />{item.reward.pearls}{item.reward.tideCharms > 0 && <><Waves size={13} className="ml-1 text-gold" aria-hidden="true" />{item.reward.tideCharms}</>}</span></div>
    <p className="my-1 text-xs text-ink/60">{item.text}</p>
    {item.steps > 1 && <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-ink/60"><span className="flex gap-0.5" aria-hidden="true">{Array.from({ length: item.steps }, (_, i) => <span key={i} className={cn('size-2 rounded-full', i < item.step - 1 || done ? 'bg-gold' : 'bg-ink/20')} />)}</span>Tier {item.step} of {item.steps}</p>}
    <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><progress aria-label={`${item.title} progress`} value={value} max={item.target} className="h-1.5" /><p className="mt-1 text-[11px] tabular-nums text-ink/60">{count(value)}/{count(item.target)}</p></div>
      {done ? <span className="flex min-h-11 shrink-0 items-center gap-1 text-xs font-extrabold text-teal"><Check size={15} aria-hidden="true" />Collected</span>
        : ready && <SmallButton className="shrink-0 border-violet/60 bg-violet text-abyss hover:bg-violet/80" label={`Collect ${item.title}`} onClick={() => { const error = restaurant.claimAchievement(item.id); if (error) action(error); else toast.success(restaurant.event); }}><Gem size={15} aria-hidden="true" />Collect</SmallButton>}
    </div>
  </div>;
}
