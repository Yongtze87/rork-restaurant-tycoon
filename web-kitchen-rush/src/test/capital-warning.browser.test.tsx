import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import ManagementGame from '@/management/ManagementGame';
import { restaurant } from '@/management/engine';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div>Restaurant world</div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
afterEach(() => vi.restoreAllMocks());
function lowFunds(cash = 110) { restaurant.open(); restaurant.state.cash = cash; restaurant.notify(); }
function reachable(element: Element) {
  const b = element.getBoundingClientRect();
  expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
  expect(element.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2))).toBe(true);
}

it.each([[320, 568], [390, 844], [768, 800], [1280, 800]])('keeps the red alert, controls and all management panels reachable at %s×%s', async (width, height) => {
  await page.viewport(width, height); lowFunds();
  const screen = await render(<ManagementGame />);
  const alert = screen.getByRole('region', { name: 'Cash safety warning' });
  await expect.element(alert).toBeVisible();
  const bounds = alert.element().getBoundingClientRect();
  expect(getComputedStyle(alert.element()).backgroundColor).toBe('rgb(255, 84, 104)');
  expect(bounds.top).toBeGreaterThan(screen.getByTestId('cash-register').element().getBoundingClientRect().bottom);
  expect(screen.getByTestId('restaurant-scene').element().getBoundingClientRect().top).toBeGreaterThanOrEqual(bounds.bottom);
  reachable(alert.getByRole('button', { name: 'Close for renovation' }).element());
  reachable(screen.getByRole('button', { name: 'Pause service' }).element());
  for (const tab of ['Build', 'Team', 'Menu', 'Ledger']) {
    await screen.getByRole('button', { name: tab, exact: true }).click();
    const panel = screen.getByRole('complementary').element(), box = panel.getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(bounds.bottom);
    expect(box.bottom).toBeLessThanOrEqual(screen.getByRole('navigation', { name: 'Restaurant management' }).element().getBoundingClientRect().top);
    reachable(screen.getByRole('button', { name: 'Close panel', exact: true }).element());
    reachable(alert.getByRole('button', { name: 'Close for renovation' }).element());
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
    await screen.getByRole('button', { name: 'Close panel', exact: true }).click();
  }
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  expect(restaurant.paused).toBe(false); expect(restaurant.state.cash).toBe(110);
});

it('appears on a live cash drop, updates actual numbers without repeating the live announcement and clears on recovery/reset', async () => {
  restaurant.open(); const screen = await render(<ManagementGame />);
  await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
  restaurant.state.cash = 110; restaurant.notify();
  await expect.element(screen.getByTestId('capital-warning-balance')).toHaveTextContent('Cash $110 · Closing bills $90');
  const text = screen.getByRole('alert').element().textContent;
  restaurant.state.cash = 100; restaurant.notify();
  await expect.element(screen.getByTestId('capital-warning-balance')).toHaveTextContent('Cash $100');
  expect(screen.getByRole('alert').element().textContent).toBe(text);
  const clock = restaurant.state.clock; restaurant.update(.1); expect(restaurant.state.clock).toBeGreaterThan(clock);
  restaurant.state.cash = 121; restaurant.notify(); await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
  restaurant.state.cash = -10; restaurant.notify(); await expect.element(screen.getByRole('heading', { name: 'Closing bills at risk' })).toBeVisible();
  restaurant.reset(); await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
});

it('closes with one keyboard action, does not charge immediately or unpause, and offers an explicit resume', async () => {
  lowFunds(); restaurant.pause(true); const screen = await render(<ManagementGame />);
  const button = screen.getByRole('button', { name: 'Close for renovation', exact: true }).element() as HTMLButtonElement;
  button.focus(); await userEvent.keyboard('{Enter}');
  expect(restaurant.state.renovation).toBe(true); expect(restaurant.state.cash).toBe(110); expect(restaurant.paused).toBe(true);
  await expect.element(screen.getByRole('heading', { name: 'Closing for renovation' })).toBeVisible();
  await screen.getByRole('button', { name: 'Resume to finish closing' }).click();
  expect(restaurant.paused).toBe(false);
  restaurant.update(.1);
  await expect.element(screen.getByRole('heading', { name: 'Low reopening funds' })).toBeVisible();
  expect(restaurant.state.phase).toBe('planning'); expect(restaurant.state.cash).toBe(20); expect(restaurant.state.history).toHaveLength(1);
  await screen.getByRole('button', { name: 'Review finances' }).click();
  await expect.element(screen.getByRole('complementary', { name: 'The owner’s ledger' })).toBeVisible();
  await screen.getByRole('button', { name: /Take recovery loan/ }).click();
  await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
  expect(restaurant.state.cash).toBe(620); expect(restaurant.state.debt).toBe(600);
});

it('keeps the queued status if cash recovers while remaining guests finish and does not reopen automatically', async () => {
  restaurant.open(); for (let i = 0; i < 200; i++) restaurant.update(.1);
  restaurant.state.cash = 110; const screen = await render(<ManagementGame />);
  const before = restaurant.state.guests.map(g => g.id);
  await screen.getByRole('button', { name: 'Close for renovation', exact: true }).click();
  expect(restaurant.state.guests.map(g => g.id)).toEqual(before);
  restaurant.state.cash = 500; restaurant.notify();
  await expect.element(screen.getByText('Renovation queued', { exact: true })).toBeVisible();
  for (let i = 0; i < 1000 && restaurant.state.phase === 'service'; i++) restaurant.update(.1);
  expect(restaurant.state.phase).toBe('planning');
  await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
});

it('shows the current closed warning after offline replay, rather than intermediate balances', async () => {
  lowFunds(0); restaurant.catchingUp = true;
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
  restaurant.catchingUp = false; restaurant.closeEarly(); restaurant.update(.1);
  await expect.element(screen.getByTestId('capital-warning-balance')).toHaveTextContent('Cash -$90 · Daily bills $90');
  expect(restaurant.state.phase).toBe('planning');
});
