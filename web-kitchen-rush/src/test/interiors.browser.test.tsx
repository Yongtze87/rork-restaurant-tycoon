import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import ManagementGame from '@/management/ManagementGame';
import { restaurant } from '@/management/engine';
import { capacity, comfort, SAVE_KEY, type Furniture, type Point } from '@/management/types';
import { money } from '@/management/format';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: ({ draft, onTile }: { draft: Furniture | null; onTile: (point: Point) => void }) => <div data-testid="interiors-scene" data-draft={draft?.kind ?? ''}><button onClick={() => onTile({ x: 5, z: 4 })}>Occupied tile</button><button onClick={() => onTile({ x: 0, z: 7 })}>Free tile</button></div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
afterEach(() => { vi.restoreAllMocks(); });

it('filters the catalog and shows real prices, included chairs, footprints and placed counts', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Interiors', exact: true })).toBeVisible();
  await expect.element(screen.getByTestId('interiors-cash')).toHaveTextContent('$1,250');
  await screen.getByRole('button', { name: 'Dining', exact: true }).click();
  const table = screen.getByRole('button', { name: 'Preview Coral table · $180' });
  await expect.element(table).toHaveTextContent('Table + 2 shell seats included');
  await expect.element(table).toHaveTextContent('2 × 2 tiles · 3 placed');
  await expect.element(screen.getByRole('button', { name: /Preview Sea anemone/ })).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Decor', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: /Preview Sea anemone/ })).toHaveTextContent('+6 atmosphere');
  await expect.element(screen.getByRole('button', { name: /Preview Glow-jelly lantern/ })).toHaveTextContent('1 × 1 tiles · 1 placed');
  await expect.element(screen.getByRole('button', { name: /Preview Kelp screen/ })).toHaveTextContent('$80');
  await screen.getByRole('button', { name: 'Kitchen', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: /Preview Kelp counter/ })).toHaveTextContent('Prepares kelp salads');
  await expect.element(screen.getByRole('button', { name: /Preview Vent grill/ })).toHaveTextContent('$360');
  expect(restaurant.state.cash).toBe(1250);
});

it.each([320, 390, 1280])('previews, cancels and buys a table without overflow or overlapping the scene at %spx', async width => {
  await page.viewport(width, 740); const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  const store = screen.getByRole('region', { name: 'Interior store' }).element();
  expect(store.scrollWidth).toBeLessThanOrEqual(store.clientWidth);
  const firstCard = screen.getByRole('button', { name: /Preview Coral table/ }).element().getBoundingClientRect();
  const panel = screen.getByRole('complementary', { name: 'Interiors' }).element().getBoundingClientRect();
  expect(firstCard.top).toBeGreaterThan(panel.top); expect(firstCard.bottom).toBeLessThanOrEqual(panel.bottom);
  for (const button of store.querySelectorAll('button')) { const rect = button.getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width); expect(rect.height).toBeGreaterThanOrEqual(44); }
  await screen.getByRole('button', { name: /Preview Coral table/ }).click();
  expect(restaurant.state.cash).toBe(1250);
  await expect.element(screen.getByTestId('purchase-budget')).toHaveTextContent('After purchase: $1,070');
  await expect.element(screen.getByTestId('purchase-budget')).toHaveTextContent('Keep $120 to reopen');
  const inspector = screen.getByRole('region', { name: 'Furniture placement' }).element();
  expect(inspector.scrollWidth).toBeLessThanOrEqual(inspector.clientWidth);
  expect(screen.getByTestId('restaurant-scene').element().getBoundingClientRect().bottom).toBeLessThanOrEqual(inspector.getBoundingClientRect().top);
  for (const button of inspector.querySelectorAll('button')) { const rect = button.getBoundingClientRect(); expect(rect.right).toBeLessThanOrEqual(width); expect(rect.height).toBeGreaterThanOrEqual(44); expect(rect.width).toBeGreaterThanOrEqual(44); }
  await screen.getByRole('button', { name: 'Cancel placement' }).click();
  expect(restaurant.state.cash).toBe(1250);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: /Preview Coral table/ }).click();
  await screen.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(restaurant.state.cash).toBe(1070); expect(capacity(restaurant.state)).toBe(8);
  expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).furniture).toHaveLength(9);
  expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).cash).toBe(1070);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: /Preview Coral table/ })).toHaveTextContent('4 placed');
  await expect.element(screen.getByTestId('interiors-cash')).toHaveTextContent('$1,070');
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
});

it('uses real cash shortfalls and warns before spending the opening reserve without silently blocking the purchase', async () => {
  restaurant.state.cash = 200;
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  const grill = screen.getByRole('button', { name: /Preview Vent grill/ });
  await expect.element(grill).toBeDisabled(); await expect.element(grill).toHaveTextContent('Need $160 more');
  await screen.getByRole('button', { name: /Preview Coral table/ }).click();
  await expect.element(screen.getByTestId('purchase-budget')).toHaveTextContent('After purchase: $20');
  await expect.element(screen.getByTestId('purchase-budget')).toHaveTextContent('Below opening reserve');
  await screen.getByRole('button', { name: 'Confirm', exact: true }).click();
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
  await screen.getByRole('button', { name: /In your room/ }).click();
  await screen.getByRole('button', { name: 'Decor', exact: true }).click();
  await screen.getByRole('button', { name: 'Edit Sea anemone at column 1, row 1' }).click();
  await screen.getByRole('button', { name: 'Move', exact: true }).click();
  await expect.element(screen.getByTestId('purchase-budget')).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Free tile' }).click();
  await screen.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(restaurant.state.cash).toBe(1250); expect(restaurant.state.furniture.find(f => f.id === 6)).toMatchObject({ x: 0, z: 7 });
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: /In your room/ }).click();
  await screen.getByRole('button', { name: 'Edit Sea anemone at column 1, row 8' }).click();
  await screen.getByRole('button', { name: 'Sell Sea anemone for $45' }).click();
  expect(restaurant.state.cash).toBe(1295); expect(restaurant.state.furniture.some(f => f.id === 6)).toBe(false);
  expect(restaurant.incomeReceipts[restaurant.incomeReceipts.length - 1].source).toBe('sale');
});

it('browses without pausing, then drains real guests before editing and spending earnings', async () => {
  const screen = await render(<ManagementGame />); restaurant.open();
  for (let i = 0; i < 700; i++) restaurant.update(.1);
  expect(restaurant.state.guests.length).toBeGreaterThan(0);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: 'Decor', exact: true }).click();
  await expect.element(screen.getByRole('button', { name: /Preview Glow-jelly lantern/ })).toBeDisabled();
  const clock = restaurant.state.clock; restaurant.update(.1); expect(restaurant.state.clock).toBeGreaterThan(clock); expect(restaurant.paused).toBe(false);
  await screen.getByRole('button', { name: 'Close for renovation' }).click();
  expect(restaurant.state.guests.length).toBeGreaterThan(0); expect(restaurant.state.phase).toBe('service');
  await expect.element(screen.getByRole('button', { name: 'Renovation queued' })).toBeDisabled();
  for (let i = 0; i < 2000 && restaurant.state.phase === 'service'; i++) restaurant.update(.1);
  expect(restaurant.state.phase).toBe('planning'); expect(restaurant.state.guests).toHaveLength(0);
  const before = restaurant.state.cash, cozy = comfort(restaurant.state);
  await screen.getByRole('button', { name: /Preview Glow-jelly lantern/ }).click();
  await screen.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(restaurant.state.cash).toBe(before - 110); expect(comfort(restaurant.state)).toBe(cozy + 8);
});

it('opens Interiors from a real daily receipt without closing, spending or rewriting profit', async () => {
  const screen = await render(<ManagementGame />); restaurant.open();
  for (let i = 0; i < 2600 && restaurant.state.day === 1; i++) restaurant.update(.1);
  await screen.getByRole('button', { name: 'Read latest report: Day 1' }).click();
  const before = JSON.stringify(restaurant.state);
  await screen.getByRole('button', { name: 'Shop interiors', exact: true }).click();
  await expect.element(screen.getByRole('heading', { name: 'Interiors', exact: true })).toBeVisible();
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  await expect.element(screen.getByTestId('interiors-cash')).toHaveTextContent(money(restaurant.state.cash));
  expect(JSON.stringify(restaurant.state)).toBe(before); expect(restaurant.paused).toBe(false); expect(restaurant.state.renovation).toBe(false);
});
