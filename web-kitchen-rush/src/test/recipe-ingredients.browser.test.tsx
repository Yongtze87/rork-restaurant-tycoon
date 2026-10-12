import { render } from 'vitest-browser-react';
import { RecipeIngredients } from '@/components/RecipeIngredients';
import { Briefing, GameHUD } from '@/components/KitchenUI';
import { KitchenEngine } from '@/game/engine';
import { RECIPES } from '@/game/config';
import type { Recipe } from '@/game/types';

const expected: Record<Recipe, string[]> = {
  salad: ['Chopped lettuce', 'Chopped tomato'],
  burger: ['Chopped lettuce', 'Chopped tomato', 'Grilled patty', 'Bun'],
};

test.each(['salad', 'burger'] as const)('%s shows precisely its required ingredients as accessible icons', async recipe => {
  const screen = await render(<RecipeIngredients recipe={recipe} compact />);
  const list = screen.getByRole('list', { name: `${RECIPES[recipe].name} ingredients` });
  expect(list.getByRole('listitem').all()).toHaveLength(RECIPES[recipe].parts.length);
  expect(list.getByRole('img').all().map(icon => icon.element().getAttribute('aria-label'))).toEqual(expected[recipe]);
  for (const name of expected[recipe]) await expect.element(list.getByRole('img', { name, exact: true })).toBeVisible();
  expect(list.element().querySelector('p')).toBeNull();
  expect(list.element().querySelectorAll('svg title')).toHaveLength(expected[recipe].length);
});

test('live orders replace text recipes while preserving dish art and patience', async () => {
  const game = new KitchenEngine(); game.start(false);
  game.state.orders = [
    { id: 1, recipe: 'salad', remaining: 40, duration: 60 },
    { id: 2, recipe: 'burger', remaining: 12, duration: 60 },
  ];
  const screen = await render(<GameHUD state={game.state} />);
  const orders = screen.getByRole('region', { name: 'Active orders' });
  expect(orders.getByRole('article').all()).toHaveLength(2);
  for (const recipe of ['salad', 'burger'] as const) {
    await expect.element(orders.getByRole('img', { name: RECIPES[recipe].name, exact: true })).toBeVisible();
    expect(orders.getByRole('list', { name: `${RECIPES[recipe].name} ingredients` }).getByRole('img').all()).toHaveLength(expected[recipe].length);
  }
  await expect.element(orders.getByRole('progressbar', { name: 'Rooftop burger patience' })).toHaveAttribute('value', '12');
  expect(orders.element().textContent).not.toContain('Lettuce · Tomato');
  expect(orders.element().textContent).not.toContain('Bun · Patty');
});

test('briefing uses the same ingredient icons without removing cooking instructions', async () => {
  const game = new KitchenEngine();
  const screen = await render(<Briefing state={game.state} go={() => {}} start={() => {}} />);
  const recipes = screen.getByRole('region', { name: 'Recipes' });
  for (const recipe of ['salad', 'burger'] as const) {
    expect(recipes.getByRole('list', { name: `${RECIPES[recipe].name} ingredients` }).getByRole('img').all()).toHaveLength(expected[recipe].length);
  }
  expect(recipes.element().textContent).toContain('Chop');
  expect(recipes.element().textContent).toContain('Grill');
  expect(recipes.element().textContent).toContain('Serve');
  await expect.element(screen.getByRole('button', { name: 'Start shift', exact: true })).toBeVisible();
});
