import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import ManagementGame from '@/management/ManagementGame';
import { restaurant } from '@/management/engine';
import { WeeklyRevenue } from '@/management/WeeklyRevenue';
import { freshTotals, type Report } from '@/management/types';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div>Restaurant world</div> }));
const receipt = (day: number, revenue = day <= 7 ? 100 : 150, tips = 10): Report => ({ ...freshTotals(), day, revenue, tips, wages: 60, rent: 30, debtPayment: 0, profit: revenue + tips - 90, rating: 4, challenges: [], tide: 'calm', branch: 0 });
const history = (count = 10): Report[] => Array.from({ length: count }, (_, i) => receipt(i + 1));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
afterEach(() => vi.restoreAllMocks());

it.each([320, 390, 768, 1280])('shows the weekly chart immediately in Ledger at %spx with usable controls and no overlap', async width => {
  await page.viewport(width, 800); restaurant.state.history = history(); restaurant.state.day = 11;
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Ledger', exact: true }).click();
  const panel = screen.getByRole('complementary', { name: 'The owner’s ledger' }).element();
  const chart = screen.getByTestId('revenue-chart').element().getBoundingClientRect();
  const bounds = panel.getBoundingClientRect();
  expect(chart.top).toBeGreaterThan(bounds.top); expect(chart.bottom).toBeLessThanOrEqual(bounds.bottom);
  expect(chart.left).toBeGreaterThanOrEqual(bounds.left); expect(chart.right).toBeLessThanOrEqual(bounds.right);
  const section = screen.getByRole('region', { name: 'Weekly revenue' }).element();
  expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  if (width < 1024) {
    expect(screen.getByTestId('restaurant-scene').element().getBoundingClientRect().bottom).toBeLessThanOrEqual(bounds.top);
    expect(bounds.bottom).toBeLessThanOrEqual(screen.getByText('Saved on this device', { exact: true }).element().getBoundingClientRect().top);
  }
  for (const control of section.querySelectorAll('button,select')) {
    const rect = control.getBoundingClientRect(); expect(rect.height).toBeGreaterThanOrEqual(44); expect(rect.width).toBeGreaterThanOrEqual(44);
  }
  await expect.element(screen.getByTestId('revenue-week-total')).toHaveTextContent('$480');
  await expect.element(screen.getByTestId('revenue-comparison')).toHaveTextContent('+$150 · +45.5%');
  await screen.getByRole('button', { name: 'Previous revenue week' }).click();
  await expect.element(screen.getByTestId('revenue-week-label')).toHaveTextContent('Days 1–7');
  await expect.element(screen.getByTestId('revenue-week-total')).toHaveTextContent('$770');
  await expect.element(screen.getByRole('button', { name: 'Previous revenue week' })).toBeDisabled();
  await screen.getByRole('button', { name: 'Next revenue week' }).click();
  await expect.element(screen.getByRole('button', { name: 'Next revenue week' })).toBeDisabled();
});

it('opens a selected receipt with exact sales/tips and does not pause, spend or change archived reports', async () => {
  restaurant.state.history = history(); restaurant.state.day = 11; restaurant.open();
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Ledger', exact: true }).click();
  const before = JSON.stringify(restaurant.state), cash = restaurant.state.cash;
  await screen.getByRole('combobox', { name: 'Explore a day' }).selectOptions('8');
  await expect.element(screen.getByTestId('revenue-day-detail')).toHaveTextContent('Day 8: $150 sales + $10 tips.');
  expect(screen.container.querySelector('[data-revenue-day="8"] circle')).not.toBeNull();
  await screen.getByRole('button', { name: 'Open Day 8 revenue receipt' }).click();
  await expect.element(screen.getByRole('dialog')).toBeVisible();
  expect(JSON.stringify(restaurant.state)).toBe(before); expect(restaurant.state.cash).toBe(cash); expect(restaurant.paused).toBe(false);
  await screen.getByRole('button', { name: 'Back to ledger' }).click();
  const clock = restaurant.state.clock; restaurant.update(.1); expect(restaurant.state.clock).toBeGreaterThan(clock);
});

it('keeps the challenge shortcut at the top and the normal Ledger tab focused on revenue', async () => {
  await page.viewport(390, 800); const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'View daily challenges' }).click();
  const panel = screen.getByRole('complementary', { name: 'The owner’s ledger' }).element();
  const board = screen.getByRole('region', { name: 'Day 1 challenges' }).element().getBoundingClientRect();
  expect(board.top - panel.getBoundingClientRect().top).toBeLessThan(100);
  await screen.getByRole('button', { name: 'Close panel' }).click();
  await screen.getByRole('button', { name: 'Ledger', exact: true }).click();
  expect(screen.getByRole('region', { name: 'Weekly revenue' }).element().getBoundingClientRect().top - screen.getByRole('complementary', { name: 'The owner’s ledger' }).element().getBoundingClientRect().top).toBeLessThan(100);
});

it('shows empty, zero-sales and trimmed-history states truthfully', async () => {
  const screen = await render(<WeeklyRevenue history={[]} onReport={vi.fn()} />);
  await expect.element(screen.getByTestId('revenue-week-total')).toHaveTextContent('—');
  await expect.element(screen.getByText(/Finish a service day/)).toBeVisible();
  expect(screen.container.querySelectorAll('[data-revenue="pending"]').length).toBe(7);
  await screen.rerender(<WeeklyRevenue history={[receipt(1, 0, 0)]} onReport={vi.fn()} />);
  await expect.element(screen.getByTestId('revenue-week-total')).toHaveTextContent('$0');
  expect(screen.container.querySelectorAll('[data-revenue="0"]').length).toBe(1);
  await screen.rerender(<WeeklyRevenue history={Array.from({ length: 20 }, (_, i) => receipt(i + 11))} onReport={vi.fn()} />);
  for (let i = 0; i < 3; i++) await screen.getByRole('button', { name: 'Previous revenue week' }).click();
  await expect.element(screen.getByText('Saved-day subtotal · meal sales + tips')).toBeVisible();
  expect(screen.container.querySelectorAll('[data-revenue="unavailable"]').length).toBe(3);
  await expect.element(screen.getByTestId('revenue-comparison')).toHaveTextContent('Not enough saved days');
});

it('follows new closing receipts, retains a browsed week, and recovers from reset or history eviction', async () => {
  const onReport = vi.fn(); const screen = await render(<WeeklyRevenue history={history(7)} onReport={onReport} />);
  await screen.rerender(<WeeklyRevenue history={history(8)} onReport={onReport} />);
  await expect.element(screen.getByTestId('revenue-week-label')).toHaveTextContent('Week 2');
  await screen.getByRole('button', { name: 'Previous revenue week' }).click();
  await screen.rerender(<WeeklyRevenue history={history(9)} onReport={onReport} />);
  await expect.element(screen.getByTestId('revenue-week-label')).toHaveTextContent('Week 1');
  await screen.rerender(<WeeklyRevenue history={Array.from({ length: 20 }, (_, i) => receipt(i + 21))} onReport={onReport} />);
  await expect.element(screen.getByTestId('revenue-week-label')).toHaveTextContent('Week 3');
  await screen.rerender(<WeeklyRevenue history={[]} onReport={onReport} />);
  await expect.element(screen.getByTestId('revenue-week-total')).toHaveTextContent('—');
});

it('keeps native select keyboard interaction from pausing service', async () => {
  restaurant.state.history = history(); restaurant.state.day = 11; restaurant.open();
  const screen = await render(<ManagementGame />); await screen.getByRole('button', { name: 'Ledger', exact: true }).click();
  const select = screen.getByRole('combobox', { name: 'Explore a day' }).element();
  (select as HTMLSelectElement).focus();
  await userEvent.keyboard(' '); await userEvent.keyboard('{Escape}');
  expect(restaurant.paused).toBe(false);
  await expect.element(screen.getByRole('region', { name: 'Weekly revenue' })).toBeVisible();
});
