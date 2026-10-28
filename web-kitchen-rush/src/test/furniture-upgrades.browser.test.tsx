import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import ManagementGame from '@/management/ManagementGame';
import { restaurant } from '@/management/engine';
import { CATALOG, furnitureUpgradeCost } from '@/management/types';
import { money } from '@/management/format';
import '@/index.css';

vi.mock('@/management/RestaurantScene', async importOriginal => ({
  ...await importOriginal<typeof import('@/management/RestaurantScene')>(),
  default: ({ building, onSelect }: { building: boolean; onSelect: (id: number) => void }) => <div data-testid="upgrade-scene" data-building={building}><button onClick={() => onSelect(3)}>Select existing table</button></div>,
}));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });

const table = () => restaurant.state.furniture.find(f => f.id === 3)!;

it('upgrades a selected table from the inspector with the real cost and next effect', async () => {
  const screen = await render(<ManagementGame />), cost = furnitureUpgradeCost('table', 2);
  await screen.getByRole('button', { name: 'Select existing table' }).click();
  const inspector = screen.getByRole('region', { name: 'Furniture placement' });
  await expect.element(inspector.getByTestId('furniture-level')).toHaveTextContent('Lv 1');
  await expect.element(inspector.getByTestId('furniture-upgrade')).toHaveTextContent('Next: Tips +3% · +1 atmosphere');
  await inspector.getByRole('button', { name: `Upgrade Coral table to level 2 for ${money(cost)}` }).click();
  expect(table().level).toBe(2); expect(restaurant.state.cash).toBe(1250 - cost);
  await expect.element(inspector.getByTestId('furniture-level')).toHaveTextContent('Lv 2');
  await expect.element(inspector.getByTestId('furniture-upgrade')).toHaveTextContent('Next: Tips +3% → +6% · +1 atmosphere');
  await expect.element(inspector.getByRole('button', { name: /Upgrade Coral table to level 3/ })).toHaveTextContent(`Upgrade · ${money(furnitureUpgradeCost('table', 3))}`);
  await expect.element(screen.getByTestId('upgrade-scene')).toHaveAttribute('data-building', 'true');
});

it('disables the upgrade with the reason when cash is short or at the highest level', async () => {
  restaurant.state.cash = 100; restaurant.notify();
  const screen = await render(<ManagementGame />), cost = furnitureUpgradeCost('table', 2);
  await screen.getByRole('button', { name: 'Select existing table' }).click();
  const button = screen.getByRole('button', { name: /Upgrade Coral table to level 2/ });
  await expect.element(button).toBeDisabled();
  await expect.element(screen.getByTestId('furniture-upgrade')).toHaveTextContent(`Need ${money(cost - 100)} more.`);
  expect(table().level).toBe(1); expect(restaurant.state.cash).toBe(100);
  table().level = 15; restaurant.state.cash = 100_000; restaurant.notify();
  await expect.element(screen.getByRole('button', { name: 'Fully upgraded' })).toBeDisabled();
  await expect.element(screen.getByTestId('furniture-upgrade')).toHaveTextContent('Fully upgraded');
});

it('shows each piece’s level in the room list', async () => {
  table().level = 7; restaurant.notify();
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: /Room/ }).click();
  const item = screen.getByRole('button', { name: 'Edit Coral table at column 2, row 5' });
  await expect.element(item).toHaveTextContent('Lv 7');
  await expect.element(item).toHaveTextContent(`Sells ${money(Math.floor(CATALOG.table.price * .7))}`);
  await expect.element(screen.getByRole('button', { name: 'Edit Sea anemone at column 1, row 1' })).toHaveTextContent('Lv 1');
});

it.each([320, 390])('keeps the upgrade controls inside the inspector at %spx', async width => {
  await page.viewport(width, 740);
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Select existing table' }).click();
  const region = screen.getByRole('region', { name: 'Furniture placement' }).element(), rect = region.getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
  expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
  expect(screen.getByTestId('restaurant-scene').element().getBoundingClientRect().bottom).toBeLessThanOrEqual(rect.top + 1);
  const upgrade = screen.getByRole('button', { name: /Upgrade Coral table/ }).element().getBoundingClientRect();
  expect(upgrade.height).toBeGreaterThanOrEqual(44); expect(upgrade.right).toBeLessThanOrEqual(width); expect(upgrade.bottom).toBeLessThanOrEqual(rect.bottom);
});
