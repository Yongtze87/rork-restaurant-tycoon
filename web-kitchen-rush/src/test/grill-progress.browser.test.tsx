import { render } from 'vitest-browser-react';
import { GrillProgress } from '@/components/GrillProgress';
import { GRILL_COOK_SECONDS, makeStations } from '@/game/config';
import { KitchenEngine } from '@/game/engine';
import type { Station } from '@/game/types';

function grill(): Station {
  return { ...makeStations(0).find(station => station.kind === 'grill')!, item: { kind: 'patty', state: 'raw' } };
}

test('shows remaining seconds from placement through cooking and ready', async () => {
  const game = new KitchenEngine();
  game.start(true);
  const station = game.state.stations.find(st => st.kind === 'grill')!;
  station.item = { kind: 'patty', state: 'raw' };
  const screen = await render(<GrillProgress station={station} />);
  const bar = screen.getByRole('progressbar', { name: 'Grill cooking time remaining' });
  await expect.element(bar).toHaveAttribute('value', String(GRILL_COOK_SECONDS));
  await expect.element(screen.getByText('5.0s')).toBeVisible();

  for (let i = 0; i < 50; i++) game.update(.05, []);
  await screen.rerender(<GrillProgress station={station} />);
  expect(Number(bar.element().getAttribute('value'))).toBeCloseTo(2.5);
  await expect.element(screen.getByText('2.5s')).toBeVisible();

  game.pause(true);
  const pausedHeat = station.heat;
  for (let i = 0; i < 100; i++) game.update(.05, []);
  await screen.rerender(<GrillProgress station={station} />);
  expect(station.heat).toBe(pausedHeat);
  await expect.element(screen.getByText('2.5s')).toBeVisible();

  game.pause(false);
  for (let i = 0; i < 51; i++) game.update(.05, []);
  await screen.rerender(<GrillProgress station={station} />);
  await expect.element(screen.getByText('READY!')).toBeVisible();
  await expect.element(bar).not.toBeInTheDocument();

  game.interact(game.state.chefs[0], station);
  await screen.rerender(<GrillProgress station={station} />);
  await expect.element(screen.getByText('READY!')).not.toBeInTheDocument();
  await expect.element(bar).not.toBeInTheDocument();
});

test('hides stale timers for empty grills and resets for the next patty', async () => {
  const station = grill();
  station.item = null;
  station.heat = 12;
  const screen = await render(<GrillProgress station={station} />);
  await expect.element(screen.getByRole('progressbar')).not.toBeInTheDocument();
  station.item = { kind: 'patty', state: 'raw' };
  station.heat = 0;
  await screen.rerender(<GrillProgress station={station} />);
  await expect.element(screen.getByText('5.0s')).toBeVisible();
});

test('keeps separate countdowns for simultaneous grills', async () => {
  const first = grill();
  const second = { ...grill(), id: 'second-grill', heat: 3 };
  const screen = await render(<><GrillProgress station={first} /><GrillProgress station={second} /></>);
  expect(screen.getByRole('progressbar').all()).toHaveLength(2);
  await expect.element(screen.getByText('5.0s')).toBeVisible();
  await expect.element(screen.getByText('2.0s')).toBeVisible();
});

test('replaces the countdown with warnings, even after extinguishing resets heat', async () => {
  const station = grill();
  station.item = { kind: 'patty', state: 'burnt' };
  station.heat = 21;
  station.fire = 1;
  const screen = await render(<GrillProgress station={station} />);
  await expect.element(screen.getByText('FIRE!')).toBeVisible();
  await expect.element(screen.getByRole('progressbar')).not.toBeInTheDocument();
  station.fire = 0;
  station.heat = 0;
  await screen.rerender(<GrillProgress station={station} />);
  await expect.element(screen.getByText('BURNT')).toBeVisible();
  await expect.element(screen.getByText('FIRE!')).not.toBeInTheDocument();
});
