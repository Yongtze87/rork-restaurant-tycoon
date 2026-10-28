import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { money } from '@/management/format';
import '@/index.css';

vi.mock('@/management/RestaurantScene', async importOriginal => ({ ...(await importOriginal<object>()), default: () => <div>Restaurant world</div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(390, 844); });

it('shows the last shift’s takings and profit, with a receipt on tap', async () => {
  const s = restaurant.state; restaurant.open();
  for (let i = 0; i < 4000 && !s.history.length; i++) restaurant.update(.1);
  const last = s.history[0], takings = last.revenue + last.tips + last.branch;
  const screen = await render(<ManagementGame />);
  const chip = screen.getByTestId('shift-chip');
  await expect.element(chip).toHaveTextContent('Last shift'); await expect.element(chip).toHaveTextContent(money(takings));
  await chip.click();
  await expect.element(screen.getByText('Food sales')).toBeVisible(); await expect.element(screen.getByText('Profit')).toBeVisible();
  const rect = chip.element().getBoundingClientRect(); expect(rect.right).toBeLessThanOrEqual(390);
});
