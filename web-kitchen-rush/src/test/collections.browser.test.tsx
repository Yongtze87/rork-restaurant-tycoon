import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div>Restaurant world</div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });

it.each([320, 1280])('badges the Ledger when rewards are ready and collects them from the Collection view (%spx)', async width => {
  await page.viewport(width, 740);
  const screen = await render(<><ManagementGame /><Toaster /></>), ledger = screen.getByRole('button', { name: 'Ledger', exact: true });
  await expect.element(ledger).toBeVisible();
  await expect.element(screen.getByTestId('ledger-badge')).not.toBeInTheDocument();
  restaurant.state.collections.served.salad = 12; restaurant.state.town.zones.push('reef'); restaurant.notify();
  await expect.element(screen.getByTestId('ledger-badge')).toHaveTextContent('2');
  await expect.element(ledger).toHaveAccessibleDescription('2 rewards to collect');
  await ledger.click();
  await screen.getByRole('button', { name: 'Collection: 0 of 51 rewards earned, 2 ready' }).click();
  const dishes = screen.getByRole('region', { name: 'Dish mastery' }), salad = dishes.getByRole('group', { name: 'Kelp salad · Bronze' });
  await expect.element(salad).toHaveTextContent('10/10');
  await expect.element(dishes.getByRole('group', { name: 'Vent-seared fish cake · Bronze' })).toHaveTextContent('0/10');
  await expect.element(dishes.getByRole('group', { name: 'Vent-seared fish cake · Bronze' }).getByRole('button')).not.toBeInTheDocument();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  const pearls = restaurant.state.town.pearls;
  await salad.getByRole('button', { name: 'Collect Kelp salad · Bronze' }).click();
  expect(restaurant.state.town.pearls).toBe(pearls + 3);
  await expect.element(screen.getByRole('region', { name: /Notifications/ }).getByText('Achievement: Kelp salad · Bronze. +3 pearls.')).toBeVisible();
  await expect.element(dishes.getByRole('group', { name: 'Kelp salad · Silver' })).toHaveTextContent('12/50');
  await expect.element(screen.getByTestId('ledger-badge')).toHaveTextContent('1');
  const reef = screen.getByRole('region', { name: 'Explorer' }).getByRole('group', { name: 'Coral Reef' });
  await reef.getByRole('button', { name: 'Collect Coral Reef' }).click();
  expect(restaurant.state.town.pearls).toBe(pearls + 18); expect(restaurant.state.collections.claimed).toEqual(['dish-salad-bronze', 'zone-reef']);
  await expect.element(screen.getByRole('region', { name: 'Explorer' }).getByRole('group', { name: 'Twilight Zone' })).toHaveTextContent('Tier 2 of 3');
  await expect.element(screen.getByTestId('ledger-badge')).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: 'Ledger', exact: true })).not.toHaveAccessibleDescription('2 rewards to collect');
});

it('shows a finished chain as collected and keeps the overview with milestones', async () => {
  const screen = await render(<ManagementGame />);
  restaurant.state.town.zones.push('reef', 'twilight', 'abyss'); restaurant.state.collections.claimed.push('zone-reef', 'zone-twilight', 'zone-abyss'); restaurant.notify();
  await screen.getByRole('button', { name: 'Ledger', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Little milestones' })).toBeVisible();
  await screen.getByRole('button', { name: 'Collection: 3 of 51 rewards earned' }).click();
  const abyss = screen.getByRole('region', { name: 'Explorer' }).getByRole('group', { name: 'Abyss' });
  await expect.element(abyss).toHaveTextContent('Collected'); await expect.element(abyss.getByRole('button')).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Back to ledger' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Little milestones' })).toBeVisible();
});
