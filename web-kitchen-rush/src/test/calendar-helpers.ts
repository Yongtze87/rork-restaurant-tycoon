import { dateOfDay, dayNames, localDateKey } from '@/management/calendar';
import { restaurant } from '@/management/engine';
import type { Report } from '@/management/types';

/** Puts the restaurant on its n-th real day (today), with the given past days as receipts. Returns how days are named. */
export function onDay(index: number, reports: Report[] = []) {
  const today = localDateKey(Date.now()), start = dateOfDay(today, 2 - index);
  Object.assign(restaurant.state.calendar, { date: today, start, index });
  restaurant.state.days = reports.map(report => ({ ...report, date: dateOfDay(start, report.day), shifts: 1 }));
  restaurant.notify();
  return dayNames(restaurant.state.calendar);
}
