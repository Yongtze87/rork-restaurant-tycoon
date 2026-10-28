import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { INGREDIENTS } from '@/management/types';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div>Restaurant world</div> }));
beforeEach(async () => { localStorage.removeItem('vast-ocean-updates-open'); restaurant.reset(); restaurant.welcome(); await page.viewport(390, 844); });

it('shows the season on the chip and in the Menu, with auto price, season notes and the change counter', async () => {
  restaurant.open(); restaurant.update(.1);
  const season = restaurant.state.season!, name = INGREDIENTS[season.group].season, dish = season.group === 'kelp' ? 'salad' : 'burger';
  season.notes[dish] = { sold: 12, walked: 3 }; restaurant.state.pricing.changes[dish] = 2; restaurant.notify();
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByRole('button', { name: /Show today/ })).toHaveTextContent(name);
  await screen.getByRole('button', { name: /Show today/ }).click();
  await screen.getByRole('button', { name: `${name}: open the menu` }).click();
  await expect.element(screen.getByTestId('season-banner')).toHaveTextContent(name);
  await expect.element(screen.getByTestId('season-banner')).toHaveTextContent(/Demand looks (strong|mild)/);
  expect(document.body.textContent).not.toContain(String(Math.round(season.stretch * 100)) + '%');
  await expect.element(screen.getByTestId(`price-notes-${dish}`)).toHaveTextContent('This season: 12 sold · 3 walked away over the price');
  await expect.element(screen.getByTestId(`price-notes-${dish}`)).toHaveTextContent('Price changed 2/2 today');
  await screen.getByRole('switch', { name: 'Auto price' }).click();
  expect(restaurant.state.pricing.auto).toBe(true);
  expect(restaurant.state.menu[dish].price).toBeGreaterThan(dish === 'salad' ? 24 : 38);
  await expect.element(screen.getByText('In season').first()).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});
