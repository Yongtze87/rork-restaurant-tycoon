import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div>Restaurant world</div> }));
beforeEach(async () => { localStorage.removeItem('vast-ocean-updates-open'); restaurant.reset(); restaurant.welcome(); await page.viewport(390, 844); });

it('starts as a small chip, unfolds into today’s card, folds back and remembers it', async () => {
  restaurant.open(); const screen = await render(<ManagementGame />);
  const chip = screen.getByRole('button', { name: /Show today: challenges 0 of 3/ });
  await expect.element(chip).toBeVisible();
  expect(chip.element().getBoundingClientRect().height).toBeLessThanOrEqual(48);
  await expect.element(screen.getByRole('region', { name: 'Business updates' })).not.toBeInTheDocument();
  await chip.click();
  const card = screen.getByRole('region', { name: 'Business updates' });
  await expect.element(card.getByRole('button', { name: 'View daily challenges' })).toBeVisible();
  await expect.element(card.getByRole('button', { name: 'View today’s takings' })).toHaveTextContent('0 served');
  expect(localStorage.getItem('vast-ocean-updates-open')).toBe('1');
  await screen.getByRole('button', { name: 'Hide today’s updates' }).click();
  await expect.element(screen.getByRole('button', { name: /Show today/ })).toBeVisible();
  expect(localStorage.getItem('vast-ocean-updates-open')).toBe('0');
  expect(document.body.textContent).not.toMatch(/Day \d/);
});

it('welcomes the owner back once with what the crew did', async () => {
  restaurant.awaySummary = { seconds: 150, days: 1, served: 23, cashChange: 560, challengeBonus: 230, capped: true };
  const screen = await render(<ManagementGame />);
  const dialog = screen.getByRole('dialog', { name: 'Welcome back' });
  await expect.element(dialog).toHaveTextContent('23');
  await expect.element(dialog).toHaveTextContent('+$560');
  await expect.element(dialog).toHaveTextContent('one full shift');
  await screen.getByRole('button', { name: 'Back to the reef' }).click();
  expect(restaurant.awaySummary).toBeNull();
  await expect.element(screen.getByRole('dialog', { name: 'Welcome back' })).not.toBeInTheDocument();
});
