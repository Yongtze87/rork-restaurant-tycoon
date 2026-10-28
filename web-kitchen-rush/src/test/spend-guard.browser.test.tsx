import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import ManagementGame from '@/management/ManagementGame';
import { restaurant } from '@/management/engine';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div>Restaurant world</div> }));
vi.mock('@/management/TownScene', () => ({ default: () => <div data-testid="town-view" /> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(390, 844); });

it('asks before a purchase that leaves too little to open, counting the new wage', async () => {
  restaurant.state.cash = 250; restaurant.notify();
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Team', exact: true }).click();
  await expect.element(screen.getByTestId('safe-to-spend')).toHaveTextContent('$130');
  await screen.getByRole('button', { name: /Hire chef/ }).click();
  const dialog = screen.getByRole('alertdialog');
  await expect.element(dialog).toHaveTextContent('Hiring a chef costs $150 and adds $34/shift in wages.');
  await expect.element(screen.getByTestId('spend-after')).toHaveTextContent('$100');
  await expect.element(screen.getByTestId('spend-reserve')).toHaveTextContent('$154');
  await screen.getByRole('button', { name: 'Keep my cash' }).click();
  expect(restaurant.state.cash).toBe(250); expect(restaurant.state.staff).toHaveLength(2);
  await screen.getByRole('button', { name: /Hire chef/ }).click();
  await screen.getByRole('button', { name: 'Spend anyway' }).click();
  expect(restaurant.state.cash).toBe(100); expect(restaurant.state.staff).toHaveLength(3);
});

it('buys straight away when enough is left to open', async () => {
  restaurant.state.cash = 400; restaurant.notify();
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Team', exact: true }).click();
  await screen.getByRole('button', { name: /Hire server/ }).click();
  expect(restaurant.state.cash).toBe(250); expect(restaurant.state.staff).toHaveLength(3);
  await expect.element(screen.getByRole('alertdialog')).not.toBeInTheDocument();
});

it('asks before a town purchase that dips into the next payroll', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  const chip = screen.getByRole('button', { name: /Unlock plot · \$/ }).first();
  const price = Number(chip.element().textContent!.replace(/[^0-9]/g, ''));
  restaurant.state.cash = price + 50; restaurant.notify();
  await chip.click(); await screen.getByRole('button', { name: /^Unlock · \$/ }).click();
  await expect.element(screen.getByRole('alertdialog')).toHaveTextContent('Unlocking this plot costs');
  await screen.getByRole('button', { name: 'Keep my cash' }).click();
  expect(restaurant.state.cash).toBe(price + 50);
});
