/** Real calendar days on the player's clock: daily challenges, the tide, the gift and the Ledger follow these. */
const pad = (n: number) => String(n).padStart(2, '0');
/** "2027-01-15" for the local date of a timestamp. */
export const localDateKey = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** Whole days since 1970-01-01 for a date key, independent of time zone. */
export const dateNumber = (key: string): number => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86_400_000); };
const keyOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
/** The date of the restaurant's n-th calendar day (1 = the day it started). */
export const dateOfDay = (start: string, index: number): string => keyOf(dateNumber(start) + index - 1);
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Today", "Yesterday" or "Mon 27 Oct". */
export function dateLabel(key: string, today: string): string {
  const diff = dateNumber(today) - dateNumber(key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = new Date(dateNumber(key) * 86_400_000);
  return `${weekdays[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
/** Day of the month, for chart ticks. */
export const dayOfMonth = (key: string): string => String(new Date(dateNumber(key) * 86_400_000).getUTCDate());
/** Names for the restaurant's n-th calendar day, relative to today, and short chart ticks. */
export function dayNames(calendar: { date: string; start: string }): { label: (day: number) => string; tick: (day: number) => string } {
  if (!calendar.start) return { label: day => `Day ${day}`, tick: String };
  return { label: day => dateLabel(dateOfDay(calendar.start, day), calendar.date), tick: day => dayOfMonth(dateOfDay(calendar.start, day)) };
}
