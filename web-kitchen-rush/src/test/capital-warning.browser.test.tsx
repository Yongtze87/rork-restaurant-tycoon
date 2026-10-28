import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
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

it.each([[320, 568], [390, 844], [768, 800], [1280, 800]])('keeps the red alert, controls and every menu reachable at %s×%s', async (width, height) => {
  await page.viewport(width, height); lowFunds();
  const screen = await render(<ManagementGame />);
  const alert = screen.getByRole('region', { name: 'Cash safety warning' });
  await expect.element(alert).toBeVisible();
  const bounds = alert.element().getBoundingClientRect();
  expect(getComputedStyle(alert.element()).backgroundColor).toBe('rgb(255, 84, 104)');
  expect(bounds.top).toBeGreaterThan(screen.getByTestId('cash-register').element().getBoundingClientRect().bottom);
  expect(screen.getByTestId('restaurant-scene').element().getBoundingClientRect().top).toBeGreaterThanOrEqual(bounds.bottom);
  reachable(alert.getByRole('button', { name: 'Finances' }).element());
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  const tray = screen.getByRole('region', { name: 'Interior store' }).element().getBoundingClientRect();
  expect(tray.top).toBeGreaterThanOrEqual(bounds.bottom);
  expect(tray.bottom).toBeLessThanOrEqual(screen.getByRole('navigation', { name: 'Restaurant management' }).element().getBoundingClientRect().top);
  reachable(alert.getByRole('button', { name: 'Finances' }).element());
  await screen.getByRole('button', { name: 'Close build menu' }).click();
  for (const tab of ['Team', 'Menu', 'Ledger']) {
    await screen.getByRole('button', { name: tab, exact: true }).click();
    const dialog = screen.getByRole('dialog').element(), box = dialog.getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(0); expect(box.bottom).toBeLessThanOrEqual(height); expect(box.right).toBeLessThanOrEqual(width);
    reachable(screen.getByRole('button', { name: 'Close', exact: true }).element());
    expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
    await screen.getByRole('button', { name: 'Close', exact: true }).click();
  }
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  expect(restaurant.paused).toBe(false); expect(restaurant.state.cash).toBe(110);
});

it('appears on a live cash drop, updates actual numbers without repeating the live announcement and clears on recovery/reset', async () => {
  restaurant.open(); const screen = await render(<ManagementGame />);
  await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
  restaurant.state.cash = 110; restaurant.notify();
  await expect.element(screen.getByTestId('capital-warning-balance')).toHaveTextContent('Cash $110 · Next payroll $90');
  const text = screen.getByRole('alert').element().textContent;
  restaurant.state.cash = 100; restaurant.notify();
  await expect.element(screen.getByTestId('capital-warning-balance')).toHaveTextContent('Cash $100');
  expect(screen.getByRole('alert').element().textContent).toBe(text);
  const clock = restaurant.state.clock; restaurant.update(.1); expect(restaurant.state.clock).toBeGreaterThan(clock);
  restaurant.state.cash = 121; restaurant.notify(); await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
  restaurant.state.cash = -10; restaurant.notify(); await expect.element(screen.getByRole('heading', { name: 'Payroll at risk' })).toBeVisible();
  restaurant.reset(); await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
});

it('opens the finances from the alert, where the recovery loan clears it, and never closes the restaurant', async () => {
  lowFunds(); const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Finances' }).click();
  const ledger = screen.getByRole('dialog', { name: 'Ledger' });
  await expect.element(ledger.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
  await ledger.getByRole('button', { name: 'Take loan' }).click();
  expect(restaurant.state.cash).toBe(710); expect(restaurant.state.debt).toBe(600); expect(restaurant.state.phase).toBe('service');
  await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
});

it('shows the warning only after offline replay, with the current balance', async () => {
  lowFunds(0); restaurant.catchingUp = true;
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByTestId('capital-warning')).not.toBeInTheDocument();
  restaurant.catchingUp = false; restaurant.notify();
  await expect.element(screen.getByTestId('capital-warning-balance')).toHaveTextContent('Cash $0 · Next payroll $90');
});
