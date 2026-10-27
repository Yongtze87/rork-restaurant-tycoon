import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { BUILDINGS, plotAt, unlockCost } from '@/management/town';
import '@/index.css';

vi.mock('@/management/RestaurantScene', async importOriginal => ({ ...(await importOriginal<object>()), default: () => <div>Restaurant world</div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });

it('unlocks a plot, builds with a timer, and skips it with a charm', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  await expect.element(screen.getByTestId('town-view')).toBeVisible();
  const price = unlockCost(restaurant.state.town);
  await screen.getByRole('button', { name: `Unlock plot · $${price}` }).first().click();
  await screen.getByRole('button', { name: `Unlock · $${price}` }).click();
  expect(restaurant.state.cash).toBe(1250 - price);
  const build = screen.getByRole('region', { name: 'Empty plot' }).getByRole('button', { name: /Build ·/ });
  await build.nth(3).click(); // kelp farm, fishery, homes, garden
  const owned = restaurant.state.town.plots.find(p => p.building === 'garden')!;
  expect(owned.job?.kind).toBe('build'); expect(restaurant.state.cash).toBe(1250 - price - BUILDINGS.garden.buildCost);
  await expect.element(screen.getByTestId('construction')).toHaveTextContent('Building');
  await screen.getByRole('button', { name: /Current charm/ }).click();
  await vi.waitFor(() => expect(restaurant.lastCompletion?.text).toBe('Glow garden is built.'));
  expect(plotAt(restaurant.state.town, owned.x, owned.z)!.job).toBeNull();
  expect(restaurant.townEffects().arrivalBonus).toBeGreaterThan(0);
});

it('keeps the town tab, pearls and panel usable on a 320px phone and returns to the restaurant', async () => {
  await page.viewport(320, 740); const screen = await render(<ManagementGame />);
  for (const button of document.querySelectorAll('nav[aria-label="Restaurant management"] button')) { const rect = button.getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(320); }
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  await screen.getByRole('button', { name: /All plots/ }).click();
  await screen.getByRole('button', { name: 'Restaurant · Lv 1' }).click();
  await expect.element(screen.getByRole('button', { name: /Upgrade ·/ })).toBeVisible();
  await screen.getByRole('button', { name: 'Enter' }).click();
  await expect.element(screen.getByText('Restaurant world')).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
});

it('opens the pearl shop: earned-pearl items work, real-money packs are not sold yet', async () => {
  const screen = await render(<ManagementGame />);
  restaurant.state.town.pearls = 25; restaurant.notify();
  await screen.getByRole('button', { name: /Pearl shop: 25 pearls/ }).click();
  await expect.element(screen.getByRole('heading', { name: 'Pearl shop' })).toBeVisible();
  await expect.element(screen.getByText(/Pearl packs can’t be bought yet/)).toBeVisible();
  const charms = restaurant.state.town.charms.current;
  await screen.getByRole('button', { name: '20' }).click();
  expect(restaurant.state.town.charms.current).toBe(charms + 3); expect(restaurant.state.town.pearls).toBe(5);
  await expect.element(screen.getByRole('button', { name: '150' })).toBeDisabled();
  await userEvent.keyboard('{Escape}');
});
