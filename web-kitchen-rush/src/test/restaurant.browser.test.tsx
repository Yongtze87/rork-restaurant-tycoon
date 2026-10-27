import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { money } from '@/management/format';
import type { Report } from '@/management/types';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div data-testid="mock-scene">Restaurant world</div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
afterEach(async () => { vi.restoreAllMocks(); await page.viewport(1280, 800); });

it('opens the management entry, with no direct character controls', async () => {
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByRole('navigation', { name: 'Restaurant management' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Open restaurant/ })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Hold to work' })).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Team', exact: true }).click();
  await screen.getByRole('button', { name: /Hire chef/ }).click();
  expect(restaurant.state.staff).toHaveLength(3);
  await expect.element(screen.getByRole('heading', { name: 'Nerin chef' })).toBeVisible();
});
it('charges only confirmed placements and supports keyboard cancellation', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: /Sea anemone/ }).click();
  expect(restaurant.state.cash).toBe(1250);
  await screen.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(restaurant.state.cash).toBe(1185);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: /Sea anemone/ }).click();
  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByRole('region', { name: 'Furniture placement' })).not.toBeInTheDocument();
  expect(restaurant.state.cash).toBe(1185);
});
it('freezes business changes during service and has no speed or pause controls', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: /Open restaurant/ }).click();
  await expect.element(screen.getByText('0 served')).toBeVisible();
  expect(document.querySelector('[aria-label="3x speed"],[aria-label="Pause service"]')).toBeNull(); expect(restaurant.speed).toBe(1);
  await screen.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: 'Raise Kelp salad price' })).toBeDisabled();
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: /Coral table/ })).toBeDisabled();
});
it('ignores the global pause shortcut while recovering offline progress', async () => {
  const screen = await render(<ManagementGame />); restaurant.open(); restaurant.catchingUp = true; restaurant.notify();
  await expect.element(screen.getByRole('progressbar', { name: 'Offline progress' })).toBeVisible();
  await userEvent.keyboard(' '); expect(restaurant.paused).toBe(false);
  restaurant.catchingUp = false; restaurant.notify();
});
it('keeps every navigation control and all top metrics inside a 320px phone', async () => {
  await page.viewport(320, 740);
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  for (const button of document.querySelectorAll('nav[aria-label="Restaurant management"] button')) { const rect = button.getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(320); }
  const cash = screen.getByTestId('cash').element().getBoundingClientRect(); expect(cash.right).toBeLessThan(320);
  await expect.element(screen.getByRole('button', { name: /Coral table/ })).toBeVisible();
});
it('renames with validation and requires explicit confirmation before reset', async () => {
  const screen = await render(<><ManagementGame /><Toaster /></>);
  await screen.getByRole('button', { name: 'Restaurant settings' }).click();
  await screen.getByLabelText('Restaurant name').fill('Juniper & Friends');
  await screen.getByRole('button', { name: 'Save', exact: true }).click(); expect(restaurant.state.name).toBe('Juniper & Friends');
  await screen.getByRole('button', { name: 'Start a new restaurant', exact: true }).click();
  expect(restaurant.state.name).toBe('Juniper & Friends');
  await screen.getByRole('button', { name: 'Keep my restaurant' }).click(); expect(restaurant.state.name).toBe('Juniper & Friends');
});
it('shows real closing numbers and pays milestones only once', async () => {
  const screen = await render(<ManagementGame />);
  restaurant.open(); for (let i = 0; i < 2500 && restaurant.state.day === 1; i++) restaurant.update(.1);
  expect(restaurant.state.phase).toBe('service'); expect(restaurant.state.day).toBe(2);
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Read latest report: Day 1' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Day 1 summary' })).toBeVisible();
  const report = restaurant.state.history[0];
  await expect.element(screen.getByTestId('report-revenue')).toHaveTextContent(money(report.revenue + report.tips));
  await expect.element(screen.getByTestId('report-labor')).toHaveTextContent(money(report.wages));
  await expect.element(screen.getByTestId('report-profit')).toHaveTextContent(money(report.profit));
  await expect.element(screen.getByRole('table', { name: 'Day 1 income and expenses' })).toBeInTheDocument();
  const clock = restaurant.state.clock; restaurant.update(.1); expect(restaurant.state.clock).toBeGreaterThan(clock);
  await screen.getByRole('button', { name: 'Back to ledger' }).click();
  const before = restaurant.state.cash;
  await screen.getByRole('button', { name: 'Collect reward', exact: false }).first().click();
  expect(restaurant.state.cash).toBe(before + 180);
  await expect.element(screen.getByRole('button', { name: 'Collected', exact: false }).first()).toBeDisabled();
});

it.each([320, 1280])('keeps the ocean soundtrack and view controls on screen without changing saves at %spx', async width => {
  await page.viewport(width, 800);
  const screen = await render(<ManagementGame />);
  for (const name of ['Zoom in', 'Zoom out', 'Reset view']) { const rect = screen.getByRole('button', { name }).element().getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width); }
  await screen.getByRole('button', { name: 'Restaurant settings' }).click();
  const before = JSON.stringify(restaurant.state), toggle = screen.getByRole('switch', { name: 'Ocean soundtrack' });
  await expect.element(toggle).toHaveAttribute('aria-checked', String(restaurant.state.music));
  await expect.element(screen.getByRole('switch', { name: 'City traffic' })).not.toBeInTheDocument();
  const rect = toggle.element().getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
  expect(JSON.stringify(restaurant.state)).toBe(before);
});

const sampleReport: Report = { challenges: [], day: 1, revenue: 300, tips: 20, ingredients: 90, wages: 60, rent: 30, debtPayment: 0, profit: 140, served: 10, missed: 2, rating: 4, tide: 'calm', branch: 0 };
it('reopens a saved daily summary without changing money, wages or the current day', async () => {
  restaurant.state.history = [{ ...sampleReport }]; restaurant.state.day = 2;
  restaurant.train(10);
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Ledger', exact: true }).click();
  const summary = screen.getByRole('button', { name: 'View Day 1 summary' });
  await expect.element(summary).toHaveTextContent('Total revenue$320');
  await expect.element(summary).toHaveTextContent('Labor costs$60');
  const before = JSON.stringify(restaurant.state);
  await summary.click();
  await expect.element(screen.getByRole('heading', { name: 'Day 1 summary' })).toBeVisible();
  await expect.element(screen.getByTestId('report-labor')).toHaveTextContent('$60');
  await screen.getByRole('button', { name: 'Back to ledger' }).click();
  expect(JSON.stringify(restaurant.state)).toBe(before);
  await summary.click();
  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  expect(restaurant.state.day).toBe(2);
});
it('keeps ongoing service running while reviewing history', async () => {
  restaurant.state.history = [{ ...sampleReport }]; restaurant.state.day = 2;
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: /Open restaurant/ }).click();
  await screen.getByRole('button', { name: 'Ledger', exact: true }).click();
  await screen.getByRole('button', { name: 'View Day 1 summary' }).click();
  expect(restaurant.paused).toBe(false);
  await screen.getByRole('button', { name: 'Back to ledger' }).click();
  expect(restaurant.paused).toBe(false);
  const clock = restaurant.state.clock; restaurant.update(.1); expect(restaurant.state.clock).toBeGreaterThan(clock);
});
it.each([[240, 'higher'], [40, 'lower'], [140, 'unchanged']])('compares a %s profit with the previous day as %s', async (profit, direction) => {
  restaurant.state.history = [{ ...sampleReport }, { ...sampleReport, day: 2, profit: Number(profit) }];
  restaurant.state.day = 3;
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Read latest report: Day 2' }).click();
  await expect.element(screen.getByTestId('report-comparison')).toHaveTextContent(String(direction));
  await expect.element(screen.getByTestId('report-comparison')).toHaveTextContent('Day 1');
  if (direction !== 'unchanged') await expect.element(screen.getByTestId('report-comparison')).toHaveTextContent('$100');
});
it('shows a loss and no invented margin for early closing without sales', async () => {
  restaurant.open(); restaurant.closeEarly(); restaurant.update(.1);
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Read latest report: Day 1' }).click();
  await expect.element(screen.getByTestId('report-revenue')).toHaveTextContent('$0');
  await expect.element(screen.getByTestId('report-profit')).toHaveTextContent('-$90');
  await expect.element(screen.getByText('Loss', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('No sales today · margin unavailable')).toBeVisible();
  await expect.element(screen.getByTestId('report-comparison')).toHaveTextContent('Your first service day');
});
it.each([320, 390, 768])('keeps the report and next-day action usable at %spx, with scrollable details', async width => {
  await page.viewport(width, 740);
  restaurant.state.history = [{ ...sampleReport, debtPayment: 30, profit: 110 }]; restaurant.state.day = 2;
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Read latest report: Day 1' }).click();
  const dialog = screen.getByRole('dialog');
  await expect.element(dialog).toBeVisible();
  const bounds = dialog.element().getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(width);
  expect(bounds.top).toBeGreaterThanOrEqual(0); expect(bounds.bottom).toBeLessThanOrEqual(740);
  const scroll = screen.getByTestId('report-scroll').element();
  expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  const button = screen.getByRole('button', { name: 'Back to ledger' }).element().getBoundingClientRect();
  expect(button.bottom).toBeLessThan(740); expect(button.height).toBeGreaterThanOrEqual(44);
  scroll.scrollTop = scroll.scrollHeight;
  await expect.element(screen.getByRole('rowheader', { name: 'Loan repayment' })).toBeVisible();
  await screen.getByRole('button', { name: 'Back to ledger' }).click();
  expect(restaurant.state.day).toBe(2);
  await screen.getByRole('button', { name: 'View Day 1 summary' }).click();
  await expect.element(screen.getByTestId('report-profit')).toHaveTextContent('$110');
});
