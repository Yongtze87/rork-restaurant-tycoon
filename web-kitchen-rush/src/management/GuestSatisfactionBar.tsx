import { memo } from 'react';
import { Frown, Meh, Smile, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GuestMood } from './satisfaction';
import type { Guest } from './types';

const stages: Record<Guest['stage'], string> = {
  arriving: 'Arriving', waiting: 'Waiting to order', cooking: 'Meal being prepared',
  ready: 'Waiting for delivery', delivering: 'Meal on the way', eating: 'Enjoying their meal', leaving: 'Leaving',
};
const moods: Record<GuestMood, string> = { content: 'Comfortable', uneasy: 'Getting impatient', unhappy: 'Unhappy', served: 'Happily served' };

/** Compact, non-interactive meter; only simulation updates change its fill. */
export const GuestSatisfactionBar = memo(function GuestSatisfactionBar({ id, value, mood, stage, special = false, reaction = 'fair' }: {
  id: number; value: number; mood: GuestMood; stage: Guest['stage']; special?: boolean; /** How the price felt: a bargain (green $) or pricey (red $). */ reaction?: Guest['reaction'];
}) {
  const Face = mood === 'unhappy' ? Frown : mood === 'uneasy' ? Meh : Smile;
  return <div role="meter" aria-label={`Guest ${id} satisfaction`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
    aria-valuetext={`${value}% — ${moods[mood]}. ${stages[stage]}.${special ? ' Star guest — counts toward today’s challenge when served.' : ''}${reaction === 'bargain' ? ' Thinks the price is a bargain.' : reaction === 'pricey' ? ' Finds the price steep.' : ''}`}
    data-special={special} data-reaction={reaction} data-guest-id={id} data-mood={mood} data-stage={stage}
    className="pointer-events-none flex h-5 w-14 select-none items-center gap-1 rounded-full border border-ink/20 bg-paper px-1 shadow-sm sm:h-6 sm:w-16">
    <Face aria-hidden="true" strokeWidth={2.5} className={cn('size-3 shrink-0 sm:size-3.5', mood === 'unhappy' ? 'text-danger' : mood === 'uneasy' ? 'fill-gold text-ink' : mood === 'served' ? 'fill-gold text-teal' : 'text-teal')} />
    <svg aria-hidden="true" viewBox="0 0 100 12" preserveAspectRatio="none" className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full sm:h-2">
      <rect width="100" height="12" className="fill-ink/15" />
      <rect data-testid="satisfaction-fill" width={value} height="12" className={mood === 'unhappy' ? 'fill-danger' : mood === 'uneasy' ? 'fill-gold' : 'fill-teal'} />
    </svg>
    {reaction !== 'fair' && <span aria-hidden="true" className={cn('shrink-0 font-display text-[10px] font-extrabold leading-none', reaction === 'bargain' ? 'text-teal' : 'text-danger')}>$</span>}
    {special && <Star aria-hidden="true" className="size-2.5 shrink-0 fill-gold text-ink" strokeWidth={1.5} />}
  </div>;
});
