import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { TownPanel } from '@/management/TownPanel';
import { TOWN_SIZE, plotZone } from '@/management/town';
import '@/index.css';

vi.mock('@/management/RestaurantScene', async importOriginal => ({ ...(await importOriginal<object>()), default: () => <div>Restaurant world</div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
const C = Math.floor(TOWN_SIZE / 2);
function meetReef(): void {
  const s = restaurant.state; s.reputation = 3.9; s.cash = 7000;
  s.town.plots.filter(p => plotZone(p) === 'shallows' && !p.building && Math.abs(p.x - C) + Math.abs(p.z - C) === 1).forEach(p => Object.assign(p, { owned: true, building: 'garden', level: 1, job: null }));
  restaurant.notify();
}

it.each([320, 1280])('shows locked dishes greyed with their zone, and offers them once the zone is reached (%spx)', async width => {
  await page.viewport(width, 800); const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect.element(screen.getByRole('switch', { name: 'Offer Kelp salad' })).toBeChecked();
  await expect.element(screen.getByRole('switch', { name: 'Offer Vent-seared fish cake' })).toBeChecked();
  const locked = screen.getByRole('region', { name: 'Locked dishes' });
  await expect.element(locked.getByLabelText('Sea-grape sushi: unlocks in Coral Reef')).toHaveTextContent('Coral Reef');
  await expect.element(locked.getByLabelText('Abyssal ink noodles: unlocks in Abyss')).toBeVisible();
  await expect.element(screen.getByRole('switch', { name: 'Offer Sea-grape sushi' })).not.toBeInTheDocument();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  restaurant.state.town.zones.push('reef'); restaurant.notify();
  await screen.getByRole('switch', { name: 'Offer Sea-grape sushi' }).click();
  expect(restaurant.state.menu.sushi.enabled).toBe(true);
  await expect.element(screen.getByRole('button', { name: 'Raise Sea-grape sushi price' })).toBeEnabled();
  await expect.element(locked.getByLabelText('Sea-grape sushi: unlocks in Coral Reef')).not.toBeInTheDocument();
  await expect.element(locked.getByLabelText('Moon-jelly salad: unlocks in Twilight Zone')).toBeVisible();
});

it('shows each zone’s requirements with progress and reaches the Coral Reef from the town panel', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  await screen.getByRole('button', { name: /All plots/ }).click(); await screen.getByRole('tab', { name: 'Depth zones' }).click();
  const zones = screen.getByRole('region', { name: 'Depth zones' }), reef = zones.getByRole('group', { name: 'Coral Reef' });
  await expect.element(zones.getByText('Sunlit Shallows')).toBeVisible();
  await expect.element(reef).toHaveTextContent('Reputation 3.8 · now 3.5');
  await expect.element(reef).toHaveTextContent('4 buildings in town · 0/4');
  await expect.element(reef.getByLabelText('Not yet').first()).toBeVisible();
  await expect.element(reef.getByRole('button', { name: /Not ready yet/ })).toBeDisabled();
  await expect.element(zones.getByRole('group', { name: 'Twilight Zone' })).toHaveTextContent('Reach the Coral Reef');
  await expect.element(zones.getByRole('group', { name: 'Twilight Zone' }).getByRole('button')).not.toBeInTheDocument();
  meetReef();
  await expect.element(reef.getByLabelText('Not yet')).not.toBeInTheDocument();
  await reef.getByRole('button', { name: 'Reach Coral Reef · $5,000' }).click();
  expect(restaurant.state.town.zones).toEqual(['shallows', 'reef']); expect(restaurant.state.cash).toBe(2000);
  await expect.element(zones.getByText('Coral Reef', { exact: true })).toBeVisible();
  await expect.element(zones.getByRole('group', { name: 'Twilight Zone' }).getByRole('button', { name: /Not ready yet/ })).toBeDisabled();
});

it('explains why a plot in a locked zone cannot be unlocked, and keeps the zone list inside a 320px phone', async () => {
  await page.viewport(320, 740); const screen = await render(<ManagementGame />);
  restaurant.state.cash = 100_000; restaurant.unlockPlot(C + 1, C); restaurant.unlockPlot(C + 2, C);
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  await screen.getByRole('button', { name: /All plots/ }).click(); await screen.getByRole('tab', { name: 'Depth zones' }).click();
  const zones = screen.getByRole('region', { name: 'Depth zones' });
  await expect.element(zones).toBeVisible();
  const rect = zones.element().getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(320);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  const panel = await render(<TownPanel selected={{ x: C + 3, z: C }} onSelect={() => undefined} onEnterRestaurant={() => undefined} onShop={() => undefined} onOverview={() => undefined} action={() => undefined} />);
  const plot = panel.getByRole('region', { name: 'Locked plot' });
  await expect.element(plot).toHaveTextContent('Coral Reef');
  await expect.element(plot).toHaveTextContent('Reach the Coral Reef first.');
  await expect.element(plot.getByRole('button', { name: /Unlock ·/ })).not.toBeInTheDocument();
});
