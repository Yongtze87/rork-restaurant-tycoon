import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { BUILDINGS, PARCEL, connected, isRoad, unlockCost } from '@/management/town';
import { C } from './town-helpers';
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
  const place = screen.getByRole('region', { name: 'Empty plot' }).getByRole('button', { name: 'Place' });
  await place.nth(3).click(); // kelp farm, fishery, homes, garden
  const draft = screen.getByRole('region', { name: 'Place glow garden' });
  await expect.element(draft.getByTestId('draft-status')).toHaveTextContent('Fits here');
  await draft.getByRole('button', { name: /Build ·/ }).click();
  const owned = restaurant.state.town.buildings.find(b => b.kind === 'garden')!;
  expect(owned.job?.kind).toBe('build'); expect(restaurant.state.cash).toBe(1250 - price - BUILDINGS.garden.buildCost);
  await expect.element(screen.getByTestId('construction')).toHaveTextContent('Building');
  await screen.getByRole('button', { name: /Current charm/ }).click();
  await vi.waitFor(() => expect(restaurant.lastCompletion?.text).toBe('Glow garden is built.'));
  expect(owned.job).toBeNull();
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

it('lays streets and single roads, warns about a building no road reaches, and moves it for free', async () => {
  const s = restaurant.state; s.cash = 50_000; restaurant.unlockPlot(C - 1, C); restaurant.unlockPlot(C - 2, C); s.cash = 5000; restaurant.notify();
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  // Two plots west of the restaurant, with no roads yet: a building there does not fit.
  await screen.getByRole('button', { name: /All plots/ }).click();
  await screen.getByRole('group', { name: 'Home Reef plots' }).getByRole('button', { name: 'Empty plot' }).first().click();
  await screen.getByRole('region', { name: 'Empty plot' }).getByRole('button', { name: 'Place' }).nth(2).click(); // homes
  const draft = screen.getByRole('region', { name: 'Place mareen homes' });
  await expect.element(draft.getByTestId('draft-status')).toHaveTextContent('Buildings need a road along one side.');
  await draft.getByRole('button', { name: /Lay this plot’s streets · 7 tiles · \$70/ }).click();
  expect(isRoad(s.town, (C - 2) * PARCEL + 3, C * PARCEL)).toBe(true); expect(s.cash).toBe(5000 - 70);
  await expect.element(draft.getByTestId('draft-status')).toHaveTextContent('Fits here');
  await draft.getByRole('button', { name: /Build ·/ }).click();
  // Its street does not reach the restaurant yet: the card says so.
  const homes = s.town.buildings.find(b => b.kind === 'homes')!; expect(connected(s.town, homes)).toBe(false);
  await expect.element(screen.getByTestId('no-road')).toHaveTextContent('No road joins this building to your restaurant');
  expect(restaurant.layStreets(C - 1, C)).toBeNull(); restaurant.notify();
  await expect.element(screen.getByTestId('no-road')).not.toBeInTheDocument(); expect(connected(s.town, homes)).toBe(true);
  // Moving is free; the building's own spot still fits.
  const cash = s.cash;
  await screen.getByRole('button', { name: 'Move mareen homes' }).click();
  const move = screen.getByRole('region', { name: 'Move mareen homes' });
  await expect.element(move.getByTestId('draft-status')).toHaveTextContent('Fits here');
  await move.getByRole('button', { name: 'Turn' }).click(); await move.getByRole('button', { name: 'Move here' }).click();
  expect(s.cash).toBe(cash);
  // The road tool.
  await screen.getByRole('button', { name: 'Back to town' }).click();
  await screen.getByRole('button', { name: 'Roads', exact: true }).click();
  await expect.element(screen.getByRole('region', { name: 'Road tool' })).toBeVisible();
  await screen.getByRole('button', { name: 'Done' }).click();
  await expect.element(screen.getByRole('region', { name: 'Town plots' })).toBeVisible();
});

it('shows atmosphere on a phone, pays debt with pearls and demolishes a town building for half its cost', async () => {
  await page.viewport(390, 844);
  const s = restaurant.state; s.debt = 100; s.town.pearls = 3; s.cash = 5000; restaurant.unlockPlot(C + 1, C);
  expect(restaurant.build('garden', (C + 1) * PARCEL, C * PARCEL)).toBeNull(); const garden = s.town.buildings[1]; garden.job = null; restaurant.notify();
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByTestId('atmosphere')).toHaveTextContent(/\d+%/);
  await screen.getByRole('button', { name: 'Ledger' }).click();
  const debt = screen.getByTestId('debt-card'); await expect.element(debt).toHaveTextContent('Debt $100');
  await debt.getByRole('button', { name: /Pay \$75 of debt with 3 pearls/ }).click();
  expect(s.debt).toBe(25); expect(s.town.pearls).toBe(0);
  await userEvent.keyboard('{Escape}');
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  await screen.getByRole('button', { name: /All plots/ }).click();
  await screen.getByRole('button', { name: 'Glow garden · Lv 1' }).click();
  const cash = s.cash, refund = restaurant.demolishRefund(garden.id); expect(refund).toBe(BUILDINGS.garden.buildCost / 2);
  await screen.getByRole('button', { name: /Demolish · \+\$125/ }).click();
  await screen.getByRole('button', { name: /Tap again: demolish for \$125/ }).click();
  expect(s.town.buildings).toHaveLength(1); expect(s.cash).toBe(cash + refund);
});
