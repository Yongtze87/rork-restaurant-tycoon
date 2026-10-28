import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { DailyChallenges } from '@/management/DailyChallenges';
import { GuestSatisfactionBar } from '@/management/GuestSatisfactionBar';
import { challengeObjective, challengeBonus } from '@/management/daily-challenges';
import type { DailyChallenge } from '@/management/types';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div>Restaurant world</div> }));
/** Unfolds the today chip if it is folded. */
const showToday = async () => { const chip = document.querySelector<HTMLElement>('[aria-label^="Show today"]'); if (chip) chip.click(); };
beforeEach(async () => { localStorage.removeItem('vast-ocean-updates-open'); restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
afterEach(() => { vi.restoreAllMocks(); });

it.each([320, 390, 1280])('opens daily challenges at %spx without overflow or pausing service', async width => {
  await page.viewport(width, 800); const screen = await render(<ManagementGame />);
  await showToday(); await screen.getByRole('button', { name: 'View daily challenges' }).click();
  await expect.element(screen.getByRole('region', { name: 'Today’s challenges' })).toHaveTextContent('Open the restaurant');
  await screen.getByRole('button', { name: 'Close', exact: true }).click();
  await screen.getByRole('button', { name: /Open restaurant/ }).click();
  await showToday(); await screen.getByRole('button', { name: 'View daily challenges' }).click();
  const board = screen.getByRole('region', { name: 'Today’s challenges' });
  for (const c of restaurant.state.dailyChallenges) {
    const progress = board.getByRole('progressbar', { name: challengeObjective(c) });
    expect(progress.element().getAttribute('max')).toBe(String(c.target));
    expect(progress.element().getAttribute('value')).toBe('0');
  }
  const rect = board.element().getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
  expect(board.element().scrollWidth).toBeLessThanOrEqual(board.element().clientWidth);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  const clock = restaurant.state.clock; restaurant.update(.1); expect(restaurant.state.clock).toBeGreaterThan(clock); expect(restaurant.paused).toBe(false);
  await screen.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: 'View daily challenges' })).toBeVisible();
});
it('shows earned payouts and archives progress without a collect action or paying twice', async () => {
  const screen = await render(<ManagementGame />); restaurant.open();
  restaurant.state.dailyChallenges = [
    { day: 1, kind: 'served', dish: null, target: 1, progress: 0, reward: 50, rewarded: false },
    { day: 1, kind: 'dish', dish: 'salad', target: 100, progress: 0, reward: 60, rewarded: false },
    { day: 1, kind: 'dish', dish: 'burger', target: 100, progress: 0, reward: 65, rewarded: false },
  ];
  for (let i = 0; i < 800 && !restaurant.state.lifetimeChallengeBonus; i++) restaurant.update(.1);
  await showToday(); await screen.getByRole('button', { name: 'View daily challenges' }).click();
  const board = screen.getByRole('region', { name: 'Today’s challenges' });
  await expect.element(board).toHaveTextContent('Paid +$50'); await expect.element(board).toHaveTextContent('1/3 completed');
  await expect.element(board.getByRole('button', { name: /Collect/ })).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Close', exact: true }).click();
  // A shift ends: the board belongs to the real day, so nothing expires and nothing is paid twice.
  const before = restaurant.state.cash, shifts = restaurant.state.history.length;
  for (let i = 0; i < 2600 && restaurant.state.history.length === shifts; i++) restaurant.update(.1);
  expect(restaurant.state.lifetimeChallengeBonus).toBe(50); expect(restaurant.state.dailyChallenges[0].rewarded).toBe(true);
  await showToday(); await screen.getByRole('button', { name: 'View daily challenges' }).click();
  await expect.element(screen.getByRole('region', { name: 'Today’s challenges' })).toHaveTextContent('1/3 completed');
  expect(before).toBeGreaterThan(0);
  expect(challengeBonus(restaurant.state.dailyChallenges)).toBe(50);
});
it('explains migration when an old service has no board', async () => {
  restaurant.open(); restaurant.state.dailyChallenges = []; restaurant.state.elapsed = 151;
  const screen = await render(<ManagementGame />); await showToday(); await screen.getByRole('button', { name: 'View daily challenges' }).click();
  await expect.element(screen.getByRole('region', { name: 'Today’s challenges' })).toHaveTextContent('New challenges arrive at midnight');
});
it('uses static readable completed, expired and zero-progress states', async () => {
  const challenges: DailyChallenge[] = [
    { day: 1, kind: 'special', dish: null, target: 10, progress: 10, rewarded: true, reward: 85 },
    { day: 1, kind: 'revenue', dish: null, target: 350, progress: 201, rewarded: false, reward: 75 },
    { day: 1, kind: 'dish', dish: 'sushi', target: 8, progress: 0, rewarded: false, reward: 70 },
  ];
  const screen = await render(<DailyChallenges challenges={challenges} day={1} archived />);
  await expect.element(screen.getByRole('progressbar', { name: 'Serve 10 star guests' })).toHaveValue(10);
  await expect.element(screen.getByText('Paid +$85', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('$201 / $350', { exact: true })).toBeVisible();
  await expect.element(screen.getByRole('progressbar', { name: 'Sell 8 plates of sea-grape sushi' })).toHaveValue(0);
  await expect.element(screen.getByRole('heading', { name: 'Sea-grape sushi fans' })).toBeVisible();
  expect(screen.container.querySelectorAll('[class*="animate-"]').length).toBe(0);
});
it('identifies a star guest accessibly inside the existing pointer-transparent satisfaction meter', async () => {
  const screen = await render(<GuestSatisfactionBar id={20} value={75} mood="content" stage="waiting" special />);
  const meter = screen.getByRole('meter', { name: 'Guest 20 satisfaction' });
  await expect.element(meter).toHaveAttribute('data-special', 'true');
  await expect.element(meter).toHaveAttribute('aria-valuetext', '75% — Comfortable. Waiting to order. Star guest — counts toward today’s challenge when served.');
  expect(getComputedStyle(meter.element()).pointerEvents).toBe('none');
  expect(meter.element().getBoundingClientRect().width).toBeLessThanOrEqual(64);
});
