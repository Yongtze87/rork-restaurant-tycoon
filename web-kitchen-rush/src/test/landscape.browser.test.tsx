import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div>Restaurant world</div> }));
vi.mock('@/management/TownScene', () => ({ default: () => <div data-testid="town-view" /> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(844, 390); });

it('uses a side rail and side panels on a phone held sideways, keeping most of the height for the scene', async () => {
  const screen = await render(<ManagementGame />);
  const nav = screen.getByRole('navigation', { name: 'Restaurant management' }).element().getBoundingClientRect();
  expect(nav.left).toBeLessThan(20); expect(nav.width).toBeLessThan(90); expect(nav.height).toBeGreaterThan(250);
  const scene = () => screen.getByTestId('restaurant-scene').element().getBoundingClientRect();
  expect(scene().height).toBeGreaterThan(330); expect(scene().left).toBeGreaterThanOrEqual(nav.right);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  const tray = screen.getByRole('region', { name: 'Interior store' }).element().getBoundingClientRect();
  expect(tray.width).toBeLessThanOrEqual(330); expect(tray.right).toBeLessThanOrEqual(844); expect(scene().right).toBeLessThanOrEqual(tray.left + 1);
  expect(scene().height).toBeGreaterThan(330);
  for (const button of document.querySelectorAll('nav[aria-label="Restaurant management"] button')) { const r = button.getBoundingClientRect(); expect(r.bottom).toBeLessThanOrEqual(390); expect(r.height).toBeGreaterThanOrEqual(44); }
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(844);
});
