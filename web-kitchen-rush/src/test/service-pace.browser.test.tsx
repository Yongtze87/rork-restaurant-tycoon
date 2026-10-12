import { render } from 'vitest-browser-react';
import { vi } from 'vitest';
import { Briefing, GameHUD } from '@/components/KitchenUI';
import { KitchenEngine } from '@/game/engine';
import { RECIPES, SHIFTS } from '@/game/config';
import type { Mode } from '@/game/types';
import '@/index.css';

it.each(['solo', 'coop'] as const)('%s briefing and ticket bars use each selected shift’s actual pacing', async (mode: Mode) => {
  const game = new KitchenEngine();
  game.state.mode = mode;
  const begin = vi.fn();
  const screen = await render(<Briefing state={{ ...game.state }} go={() => {}} start={begin} />);
  for (let level = 0; level < SHIFTS.length; level++) {
    game.state.level = level;
    const pace = SHIFTS[level].service[mode];
    await screen.rerender(<Briefing state={{ ...game.state }} go={() => {}} start={begin} />);
    const note = screen.getByRole('note', { name: 'Service pace' });
    await expect.element(note).toHaveTextContent(`Arrivals every ${pace.arrivalSeconds}s · Guests wait ${pace.patienceSeconds}s`);
    await expect.element(note).toHaveTextContent('Up to 4 open orders. Fast service brings guests sooner.');
    await expect.element(note).toHaveTextContent('Practice has no time limits.');
    await screen.getByRole('button', { name: 'Start shift', exact: true }).click();
    expect(begin).toHaveBeenLastCalledWith(false);
    await screen.getByRole('button', { name: 'Practice first', exact: true }).click();
    expect(begin).toHaveBeenLastCalledWith(true);
    game.start();
    for (let frame = 0; frame < 100; frame++) game.update(.02, []);
    await screen.rerender(<GameHUD state={{ ...game.state }} />);
    for (const recipe of ['salad', 'burger'] as const) {
      const bar = screen.getByRole('progressbar', { name: `${RECIPES[recipe].name} patience` });
      await expect.element(bar).toHaveAttribute('max', String(pace.patienceSeconds));
      expect(Number(bar.element().getAttribute('value'))).toBeCloseTo(pace.patienceSeconds - 2);
    }
  }
});

it('updates the briefing timings immediately when switching modes', async () => {
  const game = new KitchenEngine(); game.state.level = 2;
  const screen = await render(<Briefing state={{ ...game.state }} go={() => {}} start={() => {}} />);
  const note = screen.getByRole('note', { name: 'Service pace' });
  await expect.element(note).toHaveTextContent('Arrivals every 17s · Guests wait 70s');
  game.state.mode = 'coop';
  await screen.rerender(<Briefing state={{ ...game.state }} go={() => {}} start={() => {}} />);
  await expect.element(note).toHaveTextContent('Arrivals every 12s · Guests wait 55s');
});
