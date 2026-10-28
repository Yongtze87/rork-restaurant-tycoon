import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import ManagementGame from '@/management/ManagementGame';
import { restaurant } from '@/management/engine';
import { capacity, comfort, SAVE_KEY, type Furniture, type Point } from '@/management/types';
import '@/index.css';
import { onDay } from './calendar-helpers';

vi.mock('@/management/RestaurantScene', () => ({ default: ({ draft, onTile }: { draft: Furniture | null; onTile: (point: Point) => void }) => <div data-testid="interiors-scene" data-draft={draft?.kind ?? ''}><button onClick={() => onTile({ x: 5, z: 4 })}>Occupied tile</button><button onClick={() => onTile({ x: 0, z: 7 })}>Free tile</button></div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
afterEach(() => { vi.restoreAllMocks(); });

it('filters the catalog and shows real prices, included chairs and placed counts', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await expect.element(screen.getByRole('region', { name: 'Interior store' })).toBeVisible();
  await screen.getByRole('button', { name: 'Dining', exact: true }).click();
  const table = screen.getByRole('button', { name: 'Preview Coral table · $180' });
  await expect.element(table).toHaveTextContent('+2 seats');
  await expect.element(table).toHaveTextContent('×3');
  await expect.element(screen.getByRole('button', { name: /Preview Sea anemone/ })).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Decor', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: /Preview Sea anemone/ })).toHaveTextContent('+6 cozy');
  await expect.element(screen.getByRole('button', { name: /Preview Glow-jelly lantern/ })).toHaveTextContent('×1');
  await expect.element(screen.getByRole('button', { name: /Preview Kelp screen/ })).toHaveTextContent('$80');
  await screen.getByRole('button', { name: 'Kitchen', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: /Preview Kelp counter/ })).toHaveTextContent('Kelp dishes');
  await expect.element(screen.getByRole('button', { name: /Preview Vent grill/ })).toHaveTextContent('$360');
  expect(restaurant.state.cash).toBe(1250);
});

it.each([320, 390, 1280])('previews, cancels and buys a table without overflow or overlapping the scene at %spx', async width => {
  await page.viewport(width, 740); const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  const store = screen.getByRole('region', { name: 'Interior store' }).element(), tray = store.getBoundingClientRect();
  expect(tray.left).toBeGreaterThanOrEqual(0); expect(tray.right).toBeLessThanOrEqual(width);
  expect(screen.getByTestId('restaurant-scene').element().getBoundingClientRect().bottom).toBeLessThanOrEqual(tray.top);
  const firstCard = screen.getByRole('button', { name: /Preview Coral table/ }).element().getBoundingClientRect();
  expect(firstCard.top).toBeGreaterThan(tray.top); expect(firstCard.bottom).toBeLessThanOrEqual(tray.bottom); expect(firstCard.left).toBeGreaterThanOrEqual(0);
  for (const button of store.querySelectorAll('button')) { const rect = button.getBoundingClientRect(); expect(rect.height).toBeGreaterThanOrEqual(40); }
  await screen.getByRole('button', { name: /Preview Coral table/ }).click();
  expect(restaurant.state.cash).toBe(1250);
  await expect.element(screen.getByTestId('purchase-budget')).toHaveTextContent('After purchase: $1,070');
  await expect.element(screen.getByTestId('purchase-budget')).toHaveTextContent('Keeps $120 for the next payroll');
  const inspector = screen.getByRole('region', { name: 'Furniture placement' }).element();
  expect(inspector.scrollWidth).toBeLessThanOrEqual(inspector.clientWidth);
  expect(screen.getByTestId('restaurant-scene').element().getBoundingClientRect().bottom).toBeLessThanOrEqual(inspector.getBoundingClientRect().top);
  for (const button of inspector.querySelectorAll('button')) { const rect = button.getBoundingClientRect(); expect(rect.right).toBeLessThanOrEqual(width); expect(rect.height).toBeGreaterThanOrEqual(44); expect(rect.width).toBeGreaterThanOrEqual(44); }
  await screen.getByRole('button', { name: 'Cancel placement' }).click();
  expect(restaurant.state.cash).toBe(1250);
  await screen.getByRole('button', { name: /Preview Coral table/ }).click();
  await screen.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(restaurant.state.cash).toBe(1070); expect(capacity(restaurant.state)).toBe(8);
  expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).furniture).toHaveLength(9);
  expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).cash).toBe(1070);
  await expect.element(screen.getByRole('button', { name: /Preview Coral table/ })).toHaveTextContent('×4');
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
});

it('uses real cash shortfalls and warns before spending into the next payroll without silently blocking the purchase', async () => {
  restaurant.state.cash = 200;
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  const grill = screen.getByRole('button', { name: /Preview Vent grill/ });
  await expect.element(grill).toBeDisabled(); await expect.element(grill).toHaveTextContent('Need $160 more');
  await screen.getByRole('button', { name: /Preview Coral table/ }).click();
  await expect.element(screen.getByTestId('purchase-budget')).toHaveTextContent('After purchase: $20');
  await expect.element(screen.getByTestId('purchase-budget')).toHaveTextContent('Below the $120 for the next payroll');
  await screen.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.element(screen.getByRole('alertdialog')).toHaveTextContent('A coral table costs $180.');
  expect(restaurant.state.cash).toBe(200);
  await screen.getByRole('button', { name: 'Spend anyway' }).click();
  expect(restaurant.state.cash).toBe(20); expect(restaurant.open()).toContain('Keep $120');
});

it('never charges for invalid placement or escape, and disables confirm if the balance changes', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: /Preview Sea anemone/ }).click();
  await screen.getByRole('button', { name: 'Occupied tile' }).click();
  await expect.element(screen.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
  expect(restaurant.state.cash).toBe(1250);
  await screen.getByRole('button', { name: 'Free tile' }).click();
  restaurant.state.cash = 30; restaurant.notify();
  await expect.element(screen.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
  await userEvent.keyboard('{Escape}'); expect(restaurant.state.cash).toBe(30); expect(restaurant.state.furniture).toHaveLength(8);
});

it('selects actual owned pieces, moves for free and refunds exactly 70% on sale', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: /Room/ }).click();
  await screen.getByRole('button', { name: 'Decor', exact: true }).click();
  await screen.getByRole('button', { name: 'Edit Sea anemone at column 1, row 1' }).click();
  await screen.getByRole('button', { name: 'Move', exact: true }).click();
  await expect.element(screen.getByTestId('purchase-budget')).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Free tile' }).click();
  await screen.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(restaurant.state.cash).toBe(1250); expect(restaurant.state.furniture.find(f => f.id === 6)).toMatchObject({ x: 0, z: 7 });
  await screen.getByRole('button', { name: 'Edit Sea anemone at column 1, row 8' }).click();
  await screen.getByRole('button', { name: 'Sell Sea anemone for $45' }).click(); expect(restaurant.state.furniture.some(f => f.id === 6)).toBe(true);
  await screen.getByRole('button', { name: 'Confirm: sell for $45' }).click();
  expect(restaurant.state.cash).toBe(1295); expect(restaurant.state.furniture.some(f => f.id === 6)).toBe(false);
  expect(restaurant.incomeReceipts[restaurant.incomeReceipts.length - 1].source).toBe('sale');
});

it('buys and places while guests are in, without pausing or closing', async () => {
  const screen = await render(<ManagementGame />); restaurant.open();
  for (let i = 0; i < 700; i++) restaurant.update(.1);
  expect(restaurant.state.guests.length).toBeGreaterThan(0);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: 'Decor', exact: true }).click();
  const before = restaurant.state.cash, cozy = comfort(restaurant.state);
  await screen.getByRole('button', { name: /Preview Glow-jelly lantern/ }).click();
  await screen.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(restaurant.state.cash).toBe(before - 110); expect(comfort(restaurant.state)).toBe(cozy + 8);
  expect(restaurant.state.phase).toBe('service'); expect(restaurant.paused).toBe(false);
  const clock = restaurant.state.clock; restaurant.update(.1); expect(restaurant.state.clock).toBeGreaterThan(clock);
});

it('opens Interiors from a real daily receipt without spending or rewriting profit', async () => {
  const names = onDay(2, [{ challenges: [], day: 1, revenue: 300, tips: 20, ingredients: 90, wages: 60, rent: 30, debtPayment: 0, profit: 140, served: 10, missed: 2, full: 0, rating: 4, tide: 'calm', branch: 0 }]);
  const screen = await render(<ManagementGame />); restaurant.open();
  await screen.getByRole('button', { name: 'Ledger', exact: true }).click();
  await screen.getByRole('button', { name: `View ${names.label(1)} summary` }).click();
  const before = JSON.stringify(restaurant.state);
  await screen.getByRole('button', { name: 'Shop interiors', exact: true }).click();
  await expect.element(screen.getByRole('region', { name: 'Interior store' })).toBeVisible();
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  expect(JSON.stringify(restaurant.state)).toBe(before); expect(restaurant.paused).toBe(false);
});
