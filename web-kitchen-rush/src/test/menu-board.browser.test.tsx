import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { MenuBoard } from '@/components/MenuBoard';
import { GameHUD } from '@/components/KitchenUI';
import { KitchenEngine } from '@/game/engine';
import { KitchenInput } from '@/game/input';
import { RECIPES } from '@/game/config';
import type { Order, Recipe } from '@/game/types';
import '@/index.css';

beforeEach(async () => { await page.viewport(1280, 800); });

const orders: Order[] = [
  { id: 1, recipe: 'salad', remaining: 70, duration: 100 },
  { id: 2, recipe: 'salad', remaining: 40, duration: 100 },
  { id: 3, recipe: 'burger', remaining: 15, duration: 100 },
];

test('lists the actual dishes, ingredients, preparation and base points even without tickets', async () => {
  const screen = await render(<MenuBoard orders={[]} practice={false} />);
  const board = screen.getByRole('complementary', { name: 'Kitchen menu' });
  for (const recipe of Object.keys(RECIPES) as Recipe[]) {
    const dish = board.getByRole('article', { name: RECIPES[recipe].name });
    await expect.element(dish.getByRole('heading')).toHaveTextContent(RECIPES[recipe].name);
    await expect.element(dish.getByText(`${RECIPES[recipe].points} base pts`)).toBeVisible();
    expect(dish.getByRole('list').getByRole('img').all()).toHaveLength(RECIPES[recipe].parts.length);
    await expect.element(dish.getByText('No orders', { exact: true })).toBeVisible();
  }
  await expect.element(board.getByRole('article', { name: 'Rooftop burger' }).getByText('Chop + grill', { exact: false })).toBeVisible();
  await expect.element(board.getByRole('article', { name: 'Garden salad' }).getByText('ChopPlateServe', { exact: true })).toBeVisible();
});

test('counts multiple matching tickets and updates after serve, timeout and restart', async () => {
  const game = new KitchenEngine(); game.start(); game.state.orders = orders.map(order => ({ ...order })); game.state.nextId = 4;
  const screen = await render(<GameHUD state={{ ...game.state }} />);
  const board = screen.getByRole('complementary', { name: 'Kitchen menu' });
  const salad = board.getByRole('article', { name: 'Garden salad' });
  await expect.element(salad.getByText('2 ordered')).toBeVisible();
  const chef = game.state.chefs[0]; chef.held = { kind: 'plate', parts: [...RECIPES.salad.parts] };
  game.interact(chef, game.state.stations.find(station => station.kind === 'serve')!);
  await screen.rerender(<GameHUD state={{ ...game.state }} />);
  await expect.element(salad.getByText('1 ordered')).toBeVisible();
  game.state.orders.forEach(order => { order.remaining = .01; }); game.update(.02, []);
  await screen.rerender(<GameHUD state={{ ...game.state }} />);
  expect(game.state.missed).toBe(2);
  expect(game.state.orders.every(order => order.id >= 4)).toBe(true);
  for (const recipe of Object.keys(RECIPES) as Recipe[]) {
    const count = game.state.orders.filter(order => order.recipe === recipe).length;
    await expect.element(board.getByRole('article', { name: RECIPES[recipe].name }).getByText(count ? `${count} ordered` : 'No orders', { exact: true })).toBeVisible();
  }
  game.start(); await screen.rerender(<GameHUD state={{ ...game.state }} />);
  expect(board.getByText('1 ordered', { exact: true }).all()).toHaveLength(2);
});

test.each([0, 1, 2])('keeps the full cookable menu in shift %i and practice', async level => {
  const game = new KitchenEngine(); game.state.level = level; game.start(true);
  const screen = await render(<GameHUD state={game.state} />);
  const board = screen.getByRole('complementary', { name: 'Kitchen menu' });
  expect(board.getByRole('article').all()).toHaveLength(2);
  await expect.element(board.getByText('Practice any dish. Serve at the right hatch.')).toBeVisible();
  await expect.element(board.getByRole('article', { name: 'Garden salad' }).getByText('1 ordered')).toBeVisible();
  await expect.element(board.getByRole('article', { name: 'Rooftop burger' }).getByText('No orders')).toBeVisible();
});

test('collapses and opens with the keyboard without triggering a chef dash or pausing', async () => {
  const onPause = vi.fn(); const input = new KitchenInput(() => true, onPause);
  try {
    const screen = await render(<MenuBoard orders={orders} practice={false} />);
    await screen.getByRole('button', { name: 'Hide kitchen menu' }).click();
    const show = screen.getByRole('button', { name: 'Show kitchen menu' });
    await expect.element(show).toHaveAttribute('aria-expanded', 'false');
    show.element().focus();
    await userEvent.keyboard(' ');
    await expect.element(screen.getByRole('button', { name: 'Hide kitchen menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(input.read()[0].dash).toBe(false); expect(onPause).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    await expect.element(show).toBeVisible();
    await expect.element(show).toHaveFocus();
    await userEvent.keyboard('w');
    expect(input.keys.has('KeyW')).toBe(false);
    await userEvent.keyboard(' ');
    expect(input.read()[0].dash).toBe(true);
    await expect.element(show).toHaveAttribute('aria-expanded', 'false');
    await show.click();
    await userEvent.keyboard(' ');
    expect(input.read()[0].dash).toBe(true);
    await expect.element(screen.getByRole('button', { name: 'Hide kitchen menu' })).toHaveAttribute('aria-expanded', 'true');
  } finally { input.dispose(); }
});

test.each([320, 390])('starts compact at %ipx, expands within the viewport and preserves tickets', async width => {
  await page.viewport(width, 844);
  const game = new KitchenEngine(); game.start();
  const screen = await render(<GameHUD state={game.state} />);
  const show = screen.getByRole('button', { name: 'Show kitchen menu' });
  await expect.element(show).toHaveAttribute('aria-expanded', 'false');
  await show.click();
  const board = screen.getByRole('complementary', { name: 'Kitchen menu' });
  const rect = board.element().getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
  expect(rect.top).toBeGreaterThan(screen.getByRole('region', { name: 'Active orders' }).element().getBoundingClientRect().bottom);
  expect(rect.bottom).toBeLessThan(844 - 260);
  expect(board.element().scrollWidth).toBeLessThanOrEqual(board.element().clientWidth);
  await expect.element(board.getByRole('article', { name: 'Rooftop burger' })).toBeVisible();
  await screen.getByRole('button', { name: 'Hide kitchen menu' }).click();
  expect(game.state.paused).toBe(false); expect(game.state.time).toBe(180);
});

test('switching to a short screen collapses the menu and keeps expanded content scrollable', async () => {
  const screen = await render(<MenuBoard orders={orders} practice={false} />);
  await page.viewport(844, 390);
  await screen.getByRole('button', { name: 'Show kitchen menu' }).click();
  const board = screen.getByRole('complementary', { name: 'Kitchen menu' });
  expect(board.element().getBoundingClientRect().bottom).toBeLessThan(390);
  const content = board.element().querySelector('[data-state="open"][id]')!;
  expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
});
