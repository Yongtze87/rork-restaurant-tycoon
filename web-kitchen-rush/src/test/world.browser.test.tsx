import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { branchIn, plotsIn } from '@/management/town';
import { put } from './town-helpers';
import { regionCenter } from '@/management/world';
import '@/index.css';
import { dateOfDay, localDateKey } from '@/management/calendar';

vi.mock('@/management/RestaurantScene', async importOriginal => ({ ...(await importOriginal<object>()), default: () => <div>Restaurant world</div> }));
vi.mock('@/management/TownScene', () => ({ default: () => <div data-testid="town-view">World scene</div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
const inside = (element: Element, width: number) => { const rect = element.getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width); expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width); };

it.each([320, 1280])('claims a region from the town panel and starts its branch restaurant, inside a %spx screen', async width => {
  await page.viewport(width, 760);
  restaurant.state.town.zones.push('reef'); restaurant.state.cash = 20_000; restaurant.notify();
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  await expect.element(screen.getByTestId('region-name')).toHaveTextContent('Home Reef');
  await screen.getByRole('button', { name: /All plots/ }).click(); await screen.getByRole('tab', { name: 'Regions' }).click();
  const regions = screen.getByRole('region', { name: 'Regions' });
  await expect.element(regions).toHaveTextContent('0 fame');
  const lagoon = regions.getByRole('button', { name: 'Glasswater Lagoon, Calm lagoon, 1 of 5 stars, claim for $2,500' });
  await expect.element(regions.getByRole('button', { name: /Bluefall Trench, Open trench, 3 of 5 stars, claim for \$9,300/ })).toBeInTheDocument();
  inside(regions.element(), width);
  await lagoon.click();
  const details = screen.getByRole('region', { name: 'Region details' });
  await expect.element(details.getByRole('heading', { name: 'Glasswater Lagoon', exact: true })).toBeVisible();
  await expect.element(details.getByRole('img', { name: 'Difficulty 1 of 5' })).toBeVisible();
  await expect.element(details).toHaveTextContent('Good for: An easy, cheap start; any building.');
  await expect.element(details.getByRole('list', { name: 'Upsides' })).toHaveTextContent('Building 12% cheaper here');
  await expect.element(details.getByRole('list', { name: 'Downsides' })).toHaveTextContent('Branch earns 9% less');
  await expect.element(details.getByRole('group', { name: 'Fame milestones' })).toHaveTextContent('Branch at level 6');
  inside(details.element(), width);
  await details.getByRole('button', { name: 'Claim · $2,500' }).click();
  expect(restaurant.state.ocean.regions).toEqual(['0,1']); expect(restaurant.state.cash).toBe(17_500);
  expect(plotsIn(restaurant.state.town, '0,1')).toHaveLength(49);
  await expect.element(details).toHaveTextContent('1/49');
  await details.getByRole('button', { name: 'Build a branch restaurant' }).click();
  const empty = screen.getByRole('region', { name: 'Empty plot' });
  await expect.element(empty).toHaveTextContent('Glasswater Lagoon · Calm lagoon');
  await expect.element(empty.getByRole('heading', { name: 'Branch restaurant', exact: true })).toBeVisible();
  await empty.getByRole('button', { name: 'Place' }).first().click();
  await screen.getByRole('region', { name: 'Place branch restaurant' }).getByRole('button', { name: /Build ·/ }).click();
  expect(branchIn(restaurant.state.town, '0,1')).toMatchObject({ kind: 'branch', job: { kind: 'build' } });
  await expect.element(screen.getByTestId('branch-income')).toHaveTextContent('Opens when built: $');
  inside(screen.getByRole('region', { name: 'Branch restaurant' }).element(), width);
  // Back on the list, the plots are grouped by region.
  await screen.getByRole('button', { name: 'Back to town' }).click();
  await screen.getByRole('button', { name: /All plots/ }).click();
  await expect.element(screen.getByRole('group', { name: 'Glasswater Lagoon plots' })).toHaveTextContent('Branch restaurant · building');
  await expect.element(screen.getByRole('group', { name: 'Home Reef plots' })).toHaveTextContent('Restaurant · Lv 1');
});

it('shows why a region cannot be claimed yet and keeps the old ocean map and compass out', async () => {
  const screen = await render(<ManagementGame />);
  expect(document.querySelector('[aria-label^="Ocean map"]')).toBeNull();
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  await expect.element(screen.getByRole('group', { name: 'The Ocean' })).not.toBeInTheDocument();
  await screen.getByRole('button', { name: /All plots/ }).click(); await screen.getByRole('tab', { name: 'Regions' }).click();
  const regions = screen.getByRole('region', { name: 'Regions' });
  await regions.getByRole('button', { name: /Kelpwood Hollow, Kelp forest, 2 of 5 stars, After the Coral Reef/ }).click();
  const details = screen.getByRole('region', { name: 'Region details' });
  await expect.element(details.getByRole('list', { name: 'Upsides' })).toHaveTextContent('Kelp farms 55% stronger here');
  await expect.element(details.getByRole('button', { name: 'Not yet' })).toBeDisabled();
  await expect.element(details.getByText('Reach the Coral Reef at home to claim regions this far out.')).toBeVisible();
  expect(restaurant.state.ocean.regions).toEqual([]);
});

it('pays a finished branch at closing and shows it as branch income on the receipt and in the Ledger', async () => {
  const s = restaurant.state; s.town.zones.push('reef'); s.cash = 30_000; restaurant.claimRegion('1,-1');
  const c = regionCenter(1, -1); put(s.town, 'branch', c.x, c.z, 5); s.cash = 3000;
  const income = restaurant.branchTotal(); expect(income).toBeGreaterThan(100);
  restaurant.open(); for (let i = 0; i < 3000 && !s.history.length; i++) restaurant.update(.25);
  restaurant.pause(true);
  expect(s.history[0].branch).toBe(income); expect(s.calendar.totals.branch).toBe(income);
  // Midnight passes: the day, with its branch income, becomes a receipt in the Ledger.
  const yesterday = dateOfDay(localDateKey(Date.now()), 0); Object.assign(s.calendar, { date: yesterday, start: yesterday, index: 1 }); restaurant.update(.1);
  expect(s.days).toHaveLength(1); expect(s.days[0].branch).toBe(income);
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Ledger' }).click();
  const summaries = screen.getByRole('region', { name: 'Daily summaries' });
  await summaries.getByRole('button', { name: 'View Yesterday summary' }).click();
  const receipt = screen.getByRole('table', { name: 'Yesterday income and expenses' });
  await expect.element(receipt.getByRole('row', { name: new RegExp(`Branch income \\$${income}`) })).toBeVisible();
});
