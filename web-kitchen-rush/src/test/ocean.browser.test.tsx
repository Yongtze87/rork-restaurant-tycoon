import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { FOUNDING_KEEPS, FOUNDING_RESETS, fameBonuses, regionAt } from '@/management/ocean';
import '@/index.css';

vi.mock('@/management/RestaurantScene', async importOriginal => ({ ...(await importOriginal<object>()), default: () => <div>Restaurant world</div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
const reachAbyss = () => { restaurant.state.town.zones.push('reef', 'twilight', 'abyss'); restaurant.state.town.pearls = 99; restaurant.notify(); };

it.each([320, 1280])('shows explored, foundable and fogged regions with their details, inside a %spx screen', async width => {
  await page.viewport(width, 760); const screen = await render(<ManagementGame />);
  await expect.element(screen.getByTestId('colony-name')).toHaveTextContent('Home Reef');
  await screen.getByRole('button', { name: 'Ocean map: Home Reef, colony 1' }).click();
  const dialog = screen.getByRole('dialog', { name: 'The Ocean' }), regions = dialog.getByRole('group', { name: 'Ocean regions' });
  await expect.element(regions.getByRole('button', { name: 'Home Reef, Home reef, 1 of 5 stars, your colony' })).toBeVisible();
  await expect.element(regions.getByRole('button', { name: /can be founded/ }).nth(7)).toBeInTheDocument();
  await expect.element(regions.getByRole('button', { name: 'Unexplored waters (2,2)' })).toBeInTheDocument();
  const rect = dialog.element().getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  // Keyboard: arrows move between regions; the details follow.
  regions.getByRole('button', { name: /your colony/ }).element().focus();
  await userEvent.keyboard('{ArrowRight}');
  const details = dialog.getByRole('region', { name: 'Region details' }), vents = regionAt(1, 0);
  await expect.element(details).toHaveTextContent('Ember Vents');
  expect(document.activeElement?.getAttribute('data-region')).toBe('1,0');
  await expect.element(details.getByRole('list', { name: 'Upsides' })).toHaveTextContent('Fish 22% cheaper');
  await expect.element(details.getByRole('list', { name: 'Downsides' })).toHaveTextContent('Guests 6% less patient');
  await expect.element(details).toHaveTextContent(`Founding here earns +${vents.fame} fame`);
  await expect.element(details.getByLabelText('Difficulty 2 of 5')).toBeVisible();
});

it('lets the owner look before the Abyss but locks founding with the reason', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  const card = screen.getByRole('group', { name: 'The Ocean' });
  await expect.element(card).toHaveTextContent('After the Abyss');
  await card.getByRole('button', { name: 'View the Ocean map' }).click();
  const dialog = screen.getByRole('dialog', { name: 'The Ocean' });
  await expect.element(dialog.getByRole('status')).toHaveTextContent('Reach the Abyss in Home Reef to found a new colony');
  await dialog.getByRole('button', { name: /Kelpwood Hollow/ }).click();
  await expect.element(dialog.getByRole('button', { name: 'Locked' })).toBeDisabled();
  await expect.element(dialog.getByText('Reach the Abyss in Home Reef first.')).toBeVisible();
  expect(restaurant.state.ocean.colonies).toHaveLength(1);
});

it('founds a new colony after confirming exactly what is kept and reset', async () => {
  reachAbyss(); const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Town', exact: true }).click();
  await screen.getByRole('group', { name: 'The Ocean' }).getByRole('button', { name: 'Choose a new colony' }).click();
  const dialog = screen.getByRole('dialog', { name: 'The Ocean' }), kelp = regionAt(0, -1);
  await dialog.getByRole('button', { name: /Kelpwood Hollow, Kelp forest/ }).click();
  await dialog.getByRole('button', { name: 'Found a colony in Kelpwood Hollow' }).click();
  const confirm = dialog.getByRole('group', { name: 'Confirm founding' });
  for (const item of FOUNDING_KEEPS) await expect.element(confirm.getByRole('list', { name: 'Kept' })).toHaveTextContent(item);
  for (const item of FOUNDING_RESETS) await expect.element(confirm.getByRole('list', { name: 'Reset' })).toHaveTextContent(item);
  const home = regionAt(0, 0).fame;
  await expect.element(confirm).toHaveTextContent(`Starting cash: $${(1250 + fameBonuses(home).startCash).toLocaleString('en-US')}`);
  await confirm.getByRole('button', { name: 'Not yet' }).click();
  expect(restaurant.state.ocean.colonies).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Found a colony in Kelpwood Hollow' }).click();
  await dialog.getByRole('button', { name: 'Yes, found Kelpwood Hollow' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'The Ocean' })).not.toBeInTheDocument();
  expect(restaurant.state.ocean.colonies.map(c => c.region)).toEqual(['0,0', '0,-1']); expect(restaurant.state.ocean.fame).toBe(home); expect(restaurant.state.ocean.colonies[1].fame).toBe(kelp.fame);
  expect(restaurant.state.town.pearls).toBe(99); expect(restaurant.state.town.zones).toEqual(['shallows']); expect(restaurant.state.day).toBe(1);
  await expect.element(screen.getByTestId('colony-name')).toHaveTextContent('Kelpwood Hollow');
  await expect.element(screen.getByText('Restaurant world')).toBeVisible();
});
