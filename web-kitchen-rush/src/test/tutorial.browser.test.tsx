import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import { RestaurantEngine, restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { SAVE_KEY, createRestaurant, restaurantSchema, type RestaurantState } from '@/management/types';
import { currentStep } from '@/management/tutorial';
import '@/index.css';

vi.mock('@/management/RestaurantScene', async importOriginal => ({ ...(await importOriginal<object>()), default: () => <div>Restaurant world</div> }));
vi.mock('@/management/TownScene', () => ({ default: () => <div data-testid="town-view">Town map</div> }));
beforeEach(async () => { localStorage.removeItem(SAVE_KEY); restaurant.reset(); await page.viewport(1280, 800); });

const card = () => document.querySelector('[data-testid="tutorial"]');
const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** The step points at exactly this control, which is ringed, on screen and not covered by the card. */
async function pointsAt(target: string, width: number): Promise<HTMLElement> {
  let el: HTMLElement | null = null;
  await vi.waitFor(() => { el = document.querySelector<HTMLElement>(`[data-tutorial="${target}"][data-tutorial-highlight]`); expect(el).not.toBeNull(); });
  const box = card()!.getBoundingClientRect(), rect = el!.getBoundingClientRect();
  expect(overlaps(box, rect)).toBe(false);
  expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width);
  expect(rect.right).toBeLessThanOrEqual(width); expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
  return el!;
}
const tap = async (target: string, width: number) => userEvent.click(page.elementLocator(await pointsAt(target, width)));

it.each([[390, 844], [1280, 800]])('walks a new owner through the first session by doing each step (%spx)', async (width, height) => {
  await page.viewport(width, height);
  const screen = await render(<ManagementGame />);
  const coach = screen.getByTestId('tutorial');
  await expect.element(coach).toHaveTextContent('Welcome to the reef');
  await expect.element(coach).toHaveTextContent('The Mareen are a reef folk');
  expect(card()!.querySelector('[aria-live="polite"]')).not.toBeNull();
  await expect.element(screen.getByRole('list', { name: 'Step 1 of 8' })).toBeInTheDocument();
  await screen.getByRole('button', { name: /Let’s start/ }).click();

  // 2. Place a coral table: Build → preview → Confirm.
  await expect.element(coach).toHaveTextContent('Add a coral table');
  await tap('build-tab', width);
  await tap('buy-table', width);
  await expect.element(coach).toHaveTextContent('tap Confirm');
  await tap('confirm', width);
  expect(restaurant.state.cash).toBe(1250 - 180);

  // 3. Check the menu.
  await expect.element(coach).toHaveTextContent('Check your menu');
  await tap('menu-tab', width);
  await expect.element(coach).toHaveTextContent('These are your dishes and prices');
  await expect.element(screen.getByRole('button', { name: 'Raise Kelp salad price' })).toBeVisible();
  await screen.getByRole('button', { name: /Looks good/ }).click();

  // 4. Open and wait for the first guest to be served by the simulation.
  await expect.element(coach).toHaveTextContent('Open the doors');
  await tap('open-restaurant', width);
  await expect.element(coach).toHaveTextContent('Your first guest is on the way');
  expect(restaurant.state.phase).toBe('service');
  for (let i = 0; i < 3000 && restaurant.state.lifetimeServed < 1; i++) restaurant.update(.1);
  expect(restaurant.state.lifetimeServed).toBe(1);

  // 5. Visit the town and unlock a plot.
  await expect.element(coach).toHaveTextContent('Grow your town');
  await tap('town-tab', width);
  await expect.element(screen.getByTestId('town-view')).toBeVisible();
  await tap('plot-locked', width);
  await tap('unlock-plot', width);
  expect(restaurant.state.town.plots.filter(p => p.owned)).toHaveLength(2);

  // 6. Build on it and see the timer.
  await expect.element(coach).toHaveTextContent('Build something');
  await tap('build-building', width);
  await expect.element(screen.getByTestId('construction')).toHaveTextContent('Building');

  // 7. Use the free Current charm.
  await expect.element(coach).toHaveTextContent('See the timer?');
  const charms = restaurant.state.town.charms.current; expect(charms).toBeGreaterThanOrEqual(1);
  await tap('use-current', width);
  expect(restaurant.state.town.charms.current).toBe(charms - 1);
  expect(restaurant.state.town.plots.find(p => p.building && p.building !== 'restaurant')!.job).toBeNull();

  // 8. Wrap-up.
  await expect.element(coach).toHaveTextContent('You’re all set');
  await expect.element(coach).toHaveTextContent('levels 6 and 11 bring new looks');
  await pointsAt('pearl-shop', width);
  await screen.getByRole('button', { name: /Start my story/ }).click();
  await expect.element(coach).not.toBeInTheDocument();
  expect(restaurant.state.tutorial.done).toBe(true); expect(restaurant.state.welcomed).toBe(true);
  expect(document.querySelector('[data-tutorial-highlight]')).toBeNull();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
});

it.each([320, 1280])('skips from any step, never traps Escape, and keeps the game running (%spx)', async width => {
  await page.viewport(width, 740);
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: /Let’s start/ }).click();
  await expect.element(screen.getByTestId('tutorial')).toHaveTextContent('Add a coral table');
  expect(card()!.closest('[role="dialog"],[aria-modal]')).toBeNull();
  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByTestId('tutorial')).toBeVisible();
  await screen.getByRole('button', { name: 'Team', exact: true }).click(); // the game underneath still works
  await expect.element(screen.getByRole('button', { name: /Hire chef/ })).toBeVisible();
  await screen.getByRole('button', { name: 'Skip tutorial' }).click();
  await expect.element(screen.getByTestId('tutorial')).not.toBeInTheDocument();
  expect(restaurant.state.tutorial.done).toBe(true);
  expect(document.querySelector('[data-tutorial-highlight]')).toBeNull();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
});

it('skips ahead past steps the owner already did', async () => {
  const screen = await render(<ManagementGame />);
  expect(restaurant.place({ id: -1, kind: 'table', x: 0, z: 7, rotation: 0 })).toBeNull();
  expect(restaurant.open()).toBeNull();
  for (let i = 0; i < 3000 && restaurant.state.lifetimeServed < 1; i++) restaurant.update(.1);
  await expect.element(screen.getByTestId('tutorial')).toHaveTextContent('Welcome to the reef');
  await screen.getByRole('button', { name: /Let’s start/ }).click();
  await expect.element(screen.getByTestId('tutorial')).toHaveTextContent('Grow your town');
  expect(restaurant.state.tutorial.step).toBe(4);
});

it('shows no tutorial for an older save that already dismissed the welcome card', async () => {
  const legacy = JSON.parse(JSON.stringify(createRestaurant())); delete legacy.tutorial; legacy.welcomed = true;
  restaurant.state = restaurantSchema.parse(legacy) as RestaurantState; restaurant.notify();
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByText('Your next milestone')).toBeVisible();
  await expect.element(screen.getByTestId('tutorial')).not.toBeInTheDocument();
});

it('shows no tutorial after welcome(), as other tests set up', async () => {
  restaurant.welcome();
  const screen = await render(<ManagementGame />);
  await expect.element(screen.getByRole('button', { name: /Open restaurant/ })).toBeVisible();
  await expect.element(screen.getByTestId('tutorial')).not.toBeInTheDocument();
});

it('keeps tutorial progress across a reload', async () => {
  await page.viewport(390, 844);
  const first = await render(<ManagementGame />);
  await first.getByRole('button', { name: /Let’s start/ }).click();
  await first.getByRole('button', { name: 'Build', exact: true }).click();
  await first.getByRole('button', { name: /Preview Coral table/ }).click();
  await first.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.element(first.getByTestId('tutorial')).toHaveTextContent('Check your menu');
  await first.unmount();
  const reloaded = new RestaurantEngine({ getItem: key => localStorage.getItem(key), setItem: () => undefined });
  expect(reloaded.loadWarning).toBe('');
  expect(reloaded.state.tutorial).toEqual({ step: 2, done: false }); expect(currentStep(reloaded.state)).toBe(2);
  restaurant.state = reloaded.state; restaurant.notify();
  const second = await render(<ManagementGame />);
  await expect.element(second.getByTestId('tutorial')).toHaveTextContent('Check your menu');
});
