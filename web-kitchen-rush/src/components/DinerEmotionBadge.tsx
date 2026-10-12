import { Angry, Smile } from 'lucide-react';
import type { Ref } from 'react';

/** Readable at phone scale; the scene supplies the state, accessible label and simulation-driven pose. */
export function DinerEmotionBadge({ guestId, ref }: { guestId: number; ref?: Ref<HTMLDivElement> }) {
  return <div ref={ref} hidden role="img" aria-label="Guest expression" data-diner-emotion={guestId} data-emotion="none" className="group pointer-events-none relative size-8 origin-bottom select-none sm:size-9">
    <span aria-hidden="true" className="absolute -bottom-0.5 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-paper" />
    <span aria-hidden="true" className="relative flex size-full items-center justify-center rounded-full border-[3px] border-paper bg-gold text-ink shadow-[0_2px_4px_#233D3B55] group-data-[emotion=angry]:bg-tomato group-data-[emotion=angry]:text-paper">
      <Smile strokeWidth={2.5} className="size-6 group-data-[emotion=angry]:hidden sm:size-7" />
      <Angry strokeWidth={2.5} className="hidden size-6 group-data-[emotion=angry]:block sm:size-7" />
    </span>
  </div>;
}
