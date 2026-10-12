import { DAY_LENGTH, DISHES, type Dish, type RestaurantState } from './types';

/** Cosmetic street furniture; outside the road, park paths and editable terrace. */
export const BULLETIN = { x: -3.1, z: 23.6, ground: -1.04, width: 3.8, pageSeconds: 8 } as const;
export interface BulletinNotice { id: string; label: string; title: string; detail: string; }
export interface BulletinReadout {
  name: string; day: number; guests: number; seated: number; status: string;
  notices: BulletinNotice[];
}

/** A read-only view of actual guests and achieved events. Never fabricates promotions or scheduled events. */
export function readBulletin(state: RestaurantState, paused: boolean): BulletinReadout {
  const closing = state.phase === 'service' && state.elapsed >= DAY_LENGTH;
  const status = state.phase === 'report' ? 'CLOSED' : state.phase === 'planning' ? 'BEFORE SERVICE' : paused ? 'PAUSED' : closing ? 'LAST ORDERS' : 'OPEN NOW';
  const notices: BulletinNotice[] = [];
  if (closing) notices.push({ id: 'closing', label: 'SERVICE UPDATE', title: 'Last orders', detail: 'Finishing meals for our remaining guests.' });
  else if (state.phase === 'report') notices.push({ id: 'closed', label: `DAY ${state.day} COMPLETE`, title: 'See you next time', detail: `${state.totals.served} guests served this service.` });
  else if (state.day === 1) notices.push({ id: 'opening', label: 'SPECIAL OCCASION', title: 'Grand opening', detail: state.phase === 'planning' ? 'Our first service opens when you are ready.' : 'Our very first service. Welcome, neighbors!' });
  else notices.push({ id: 'service', label: `DAY ${state.day}`, title: state.phase === 'planning' ? 'See you at 17:00' : 'Welcome, neighbors', detail: state.phase === 'planning' ? 'Getting the rooftop ready for a new service.' : 'Good food. Great company.' });
  if (state.expanded) notices.push({ id: 'expanded', label: 'ROOFTOP NEWS', title: 'More room for you', detail: 'Our expanded terrace is part of the neighborhood.' });
  if (state.lifetimeServed >= 5) notices.push({ id: 'milestone', label: 'CELEBRATING TOGETHER', title: `${state.lifetimeServed} guests served`, detail: 'A little rooftop. So many good meals.' });
  for (const dish of Object.keys(DISHES) as Dish[]) {
    if (state.menu[dish].enabled) notices.push({ id: dish, label: 'ON THE MENU', title: DISHES[dish].name, detail: `$${state.menu[dish].price} · Made with love on the rooftop.` });
  }
  return {
    name: state.name, day: state.day, guests: state.guests.length,
    seated: state.guests.filter(guest => guest.stage !== 'arriving' && guest.stage !== 'leaving').length,
    status, notices,
  };
}

/** Slow, bounded page rotation. The caller supplies the shared lifecycle-aware city clock. */
export function bulletinPage(seconds: number, count: number): number {
  return count > 0 && Number.isFinite(seconds) ? Math.floor(Math.max(0, seconds) / BULLETIN.pageSeconds) % count : 0;
}
