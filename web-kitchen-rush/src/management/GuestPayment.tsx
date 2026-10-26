import { useLayoutEffect, useRef } from 'react';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { DollarBill } from './DollarBill';
import { money } from './format';
import type { CashReceipt } from './cash-feedback';

/** A guest-linked receipt shares its layout box with the meter, so crowded labels still separate. */
export function GuestPayment({ receipt, age, paused, speed }: { receipt: CashReceipt; age: number; paused: boolean; speed: number }) {
  const element = useRef<HTMLDivElement>(null), reduced = useReducedMotionQuery();
  useLayoutEffect(() => {
    // Keep CSS interpolation in lockstep with simulation time, including pause and 1×/2×/3×.
    const sync = () => {
      for (const animation of element.current?.getAnimations() ?? []) {
        animation.currentTime = Math.max(0, age * 1000); animation.playbackRate = speed;
        if (paused) animation.pause(); else animation.play();
      }
    };
    sync(); reduced.addEventListener('change', sync);
    return () => reduced.removeEventListener('change', sync);
  }, [age, paused, speed, reduced]);
  return <div className="pointer-events-none flex h-[64px] items-end justify-center pb-1" aria-hidden="true">
    <div ref={element} data-testid="guest-payment" data-receipt-id={receipt.id} data-guest-id={receipt.guestId} className="flex animate-guest-payment flex-col items-center rounded-xl border-2 border-paper bg-teal px-2 py-1 text-paper shadow-[0_3px_0_#0B0A24,0_0_14px_#4DF0FF66] motion-reduce:animate-none">
      <div className="flex items-center gap-1.5"><DollarBill /><span className="font-display text-xl leading-tight tabular-nums text-abyss">+{money(receipt.amount)}</span></div>
      <span className="text-[9px] font-extrabold leading-tight text-abyss/75">{receipt.tip ? `incl. ${money(receipt.tip)} tip` : 'Paid. Thank you!'}</span>
    </div>
  </div>;
}
