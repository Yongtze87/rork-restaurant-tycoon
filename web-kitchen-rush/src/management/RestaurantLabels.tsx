import type { RefObject } from 'react';
import { ChefHat } from 'lucide-react';
import { GuestSatisfactionBar } from './GuestSatisfactionBar';
import { GuestPayment } from './GuestPayment';
import { RECEIPT_SECONDS, type CashReceipt } from './cash-feedback';
import { guestMood, guestSatisfaction } from './satisfaction';
import { guestPatienceSeconds, type RestaurantState } from './types';
import { TIDES } from './tides';

/** A shared registry keeps labels in the main DOM tree; the scene positions them every frame. */
export type LabelRegistry = RefObject<Map<string, HTMLDivElement>>;

/** DOM-owned labels clean up safely when guests leave, service closes, or the restaurant resets. */
export function RestaurantLabels({ state, labels, receipts = [], paused = false, speed = 1 }: { state: RestaurantState; labels: LabelRegistry; receipts?: readonly CashReceipt[]; paused?: boolean; speed?: number }) {
  const patience = guestPatienceSeconds(state, TIDES[state.tide].effects.patience);
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="restaurant-labels">
    {state.guests.map(guest => {
      const value = guestSatisfaction(guest, patience), id = `customer-${guest.id}`;
      const receipt = receipts.find(item => item.guestId === guest.id && item.source === 'service' && state.clock >= item.clock && state.clock - item.clock < RECEIPT_SECONDS);
      return <div key={id} ref={element => { if (element) labels.current.set(id, element); else labels.current.delete(id); }}
        className="pointer-events-none invisible absolute left-0 top-0 z-[2] flex w-max flex-col items-center">
        <span aria-hidden="true" data-label-line className="pointer-events-none absolute left-1/2 top-1/2 -z-10 w-px origin-top bg-teal/60" />
        {receipt && <GuestPayment key={receipt.id} receipt={receipt} age={state.clock - receipt.clock} paused={paused} speed={speed} />}
        <GuestSatisfactionBar special={guest.special} reaction={guest.reaction} id={guest.id} value={value} mood={guestMood(value, guest.stage, guest.happy)} stage={guest.stage} />
      </div>;
    })}
    {state.staff.filter(member => member.task === 'cooking').map(member => {
      const id = `employee-${member.id}`;
      return <div key={id} ref={element => { if (element) labels.current.set(id, element); else labels.current.delete(id); }}
        className="pointer-events-none invisible absolute left-0 top-0 z-[3] w-max">
        <div className="flex items-center gap-1 rounded-full border-2 border-paper bg-teal px-2 py-1 text-xs font-bold text-paper"><ChefHat size={12} aria-hidden="true" />{Math.max(1, Math.ceil(member.timer))}s</div>
      </div>;
    })}
  </div>;
}

