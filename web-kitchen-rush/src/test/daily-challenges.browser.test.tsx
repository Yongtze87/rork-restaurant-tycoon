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
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
afterEach(() => { vi.restoreAllMocks(); });

it.each([320, 390, 1280])('opens daily challenges at %spx without overflow or pausing service', async width => {
  await page.viewport(width, 800); const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'View daily challenges' }).click();
  await expect.element(screen.getByRole('region', { name: 'Day 1 challenges' })).toHaveTextContent('Open the restaurant');
  await screen.getByRole('button', { name: /Open restaurant/ }).click();
  await screen.getByRole('button', { name: 'View daily challenges' }).click();
  const board = screen.getByRole('region', { name: 'Day 1 challenges' });
  for (const c of restaurant.state.dailyChallenges) {
    const progress = board.getByRole('progressbar', { name: challengeObjective(c) });
    expect(progress.element().getAttribute('max')).toBe(String(c.target));
    expect(progress.element().getAttribute('value')).toBe('0');
  }
  const rect = board.element().getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
  expect(board.element().scrollWidth).toBeLessThanOrEqual(board.element().clientWidth);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  const clock = restaurant.state.clock; restaurant.update(.1); expect(restaurant.state.clock).toBeGreaterThan(clock); expect(restaurant.paused).toBe(false);
  await screen.getByRole('button', { name: 'Close panel' }).click();
  await expect.element(screen.getByRole('button', { name: 'View daily challenges' })).toBeVisible();
});
it('shows earned payouts and archives progress without a collect action or paying twice', async () => {
  const screen = await render(<ManagementGame />); restaurant.open();
  restaurant.state.dailyChallenges = [
    { day: 1, kind: 'served', target: 1, progress: 0, reward: 50, rewarded: false },
    { day: 1, kind: 'salad', target: 100, progress: 0, reward: 60, rewarded: false },
    { day: 1, kind: 'burger', target: 100, progress: 0, reward: 65, rewarded: false },
  ];
  for (let i = 0; i < 800 && !restaurant.state.lifetimeChallengeBonus; i++) restaurant.update(.1);
  await screen.getByRole('button', { name: 'View daily challenges' }).click();
  const board = screen.getByRole('region', { name: 'Day 1 challenges' });
  await expect.element(board).toHaveTextContent('Paid +$50'); await expect.element(board).toHaveTextContent('1/3 completed');
  await expect.element(board.getByRole('button')).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Close panel' }).click();
  for (let i = 0; i < 2600 && restaurant.state.day === 1; i++) restaurant.update(.1);
  const before = restaurant.state.cash;
  await screen.getByRole('button', { name: 'Read latest report: Day 1' }).click();
  await expect.element(screen.getByTestId('report-challenge-bonus')).toHaveTextContent('+$50');
  await expect.element(screen.getByRole('region', { name: 'Day 1 challenges' })).toHaveTextContent('Expired');
  await screen.getByRole('button', { name: 'Back to ledger' }).click(); expect(restaurant.state.cash).toBe(before);
  await expect.element(screen.getByRole('region', { name: 'Day 2 challenges' })).toBeVisible();
  expect(challengeBonus(restaurant.state.dailyChallenges)).toBe(0);
});
it('explains migration when an old service has no board', async () => {
  restaurant.open(); restaurant.state.dailyChallenges = []; restaurant.state.elapsed = 151;
  const screen = await render(<ManagementGame />); await screen.getByRole('button', { name: 'View daily challenges' }).click();
  await expect.element(screen.getByRole('region', { name: 'Day 1 challenges' })).toHaveTextContent('start next service day');
});
it('uses static readable completed, expired and zero-progress states', async () => {
  const challenges: DailyChallenge[] = [
    { day: 1, kind: 'special', target: 10, progress: 10, rewarded: true, reward: 85 },
    { day: 1, kind: 'revenue', target: 350, progress: 201, rewarded: false, reward: 75 },
    { day: 1, kind: 'salad', target: 8, progress: 0, rewarded: false, reward: 70 },
  ];
  const screen = await render(<DailyChallenges challenges={challenges} day={1} archived />);
  await expect.element(screen.getByRole('progressbar', { name: 'Serve 10 star guests' })).toHaveValue(10);
  await expect.element(screen.getByText('Paid +$85', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('$201 / $350', { exact: true })).toBeVisible();
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
