import { useSyncExternalStore } from 'react';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { HomeScreen, ResultsScreen } from '@/components/KitchenUI';
import { engine } from '@/game/engine';
import { loadProgress } from '@/game/storage';
import '@/index.css';

beforeEach(() => {
  localStorage.removeItem('kitchen-rush-progress-v1');
  engine.state.progress = { solo: [0, 0, 0], coop: [0, 0, 0] };
  engine.state.progressSaveFailed = false;
  engine.select(0, 'solo'); engine.setPhase('menu');
});
afterEach(async () => { vi.restoreAllMocks(); localStorage.removeItem('kitchen-rush-progress-v1'); await page.viewport(1280, 800); });

function HomeHarness() {
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  return <HomeScreen state={state} go={() => {}} start={() => {}} />;
}

it('shows an empty invitation, then switches saved high scores with the play mode', async () => {
  const screen = await render(<HomeHarness />);
  const record = screen.getByRole('region', { name: 'High score', exact: true });
  await expect.element(record).toHaveTextContent('Set your first record');
  engine.state.progress = { solo: [500, 1250, 700], coop: [1750, 900, 0] }; engine.notify();
  await expect.element(record).toHaveTextContent('1,250 pts');
  await expect.element(record).toHaveTextContent('Dinner Rush');
  await screen.getByRole('radio', { name: 'Couch co-op', exact: true }).click();
  await expect.element(record).toHaveTextContent('High Score · Couch co-op');
  await expect.element(record).toHaveTextContent('1,750 pts');
  await expect.element(record).toHaveTextContent('Golden Hour');
  await screen.getByRole('radio', { name: 'Solo', exact: true }).click();
  await expect.element(record).toHaveTextContent('1,250 pts');
  await screen.getByRole('button', { name: 'Last Call', exact: true }).click();
  await expect.element(record).toHaveTextContent('1,250 pts');
});

it('displays the completed best after returning home, with honest storage failure and retry', async () => {
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  engine.start(); engine.state.score = 760; engine.finish();
  const results = await render(<ResultsScreen state={engine.getSnapshot()} start={() => {}} go={() => {}} />);
  await expect.element(results.getByRole('status')).toHaveTextContent('session only');
  await expect.element(results.getByText('NEW BEST', { exact: true })).toBeVisible();
  await results.unmount();
  engine.setPhase('menu');
  const screen = await render(<HomeHarness />);
  await expect.element(screen.getByRole('region', { name: 'High score', exact: true })).toHaveTextContent('760 pts');
  await expect.element(screen.getByRole('status')).toHaveTextContent('Browser storage is unavailable');
  expect(screen.getByText('High scores saved on this browser').query()).toBeNull();
  save.mockRestore();
  await screen.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect.element(screen.getByText('High scores saved on this browser')).toBeVisible();
  expect(screen.getByRole('status').query()).toBeNull();
  expect(loadProgress().solo[0]).toBe(760);
});

it.each([320, 390, 768, 1280])('keeps the high-score plaque within the %spx screen without covering play controls', async width => {
  await page.viewport(width, 844);
  engine.state.progress = { solo: [1250, 0, 0], coop: [0, 0, 0] }; engine.notify();
  const screen = await render(<HomeHarness />);
  const record = screen.getByRole('region', { name: 'High score', exact: true });
  await expect.element(record).toHaveTextContent('1,250 pts');
  const bounds = record.element().getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(width);
  expect(record.element().scrollWidth).toBeLessThanOrEqual(record.element().clientWidth);
  for (const button of [screen.getByRole('button', { name: 'Let’s cook' }), screen.getByRole('radio', { name: 'Solo', exact: true }), screen.getByRole('button', { name: 'Golden Hour', exact: true })]) {
    const rect = button.element().getBoundingClientRect();
    expect(bounds.left < rect.right && bounds.right > rect.left && bounds.top < rect.bottom && bounds.bottom > rect.top).toBe(false);
  }
});
