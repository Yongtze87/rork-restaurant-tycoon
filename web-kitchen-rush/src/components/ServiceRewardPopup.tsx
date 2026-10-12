import { Coins, Sparkle } from 'lucide-react';
import type { Ref } from 'react';
import type { ServiceReward } from '@/game/service-reward';

/** Decorative reward; the existing service status announces the score and tip once. */
export function ServiceRewardPopup({ reward, ref }: { reward: ServiceReward; ref?: Ref<HTMLDivElement> }) {
  return <div ref={ref} aria-hidden="true" data-service-reward={reward.id} data-chef={reward.chefId} className="pointer-events-none relative w-32 select-none text-center opacity-0 will-change-[transform,opacity]">
    <div className="flex items-center justify-center gap-1.5 text-gold drop-shadow-[0_2px_0_#233D3B]">
      <Coins className="size-7 shrink-0 fill-gold stroke-ink stroke-[1.6]" />
      <span className="font-display text-[38px] font-bold leading-none tabular-nums [-webkit-text-stroke:3px_#233D3B] [paint-order:stroke_fill]">+{reward.total}</span>
    </div>
    <p className="mx-auto mt-1 w-fit whitespace-nowrap rounded-full border border-gold/60 bg-ink/95 px-2 py-0.5 text-[10px] font-extrabold leading-4 text-paper shadow-sm">incl. +{reward.tip} tip</p>
    <span data-reward-glints className="pointer-events-none absolute inset-0 motion-reduce:hidden">
      <Sparkle className="absolute -left-2 -top-2 size-4 fill-paper text-gold" />
      <Sparkle className="absolute -right-1 top-5 size-3 fill-gold text-paper" />
    </span>
  </div>;
}
