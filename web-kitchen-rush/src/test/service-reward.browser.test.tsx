import { render } from 'vitest-browser-react';
import { createRef } from 'react';
import { ServiceRewardPopup } from '@/components/ServiceRewardPopup';
import { GameHUD } from '@/components/KitchenUI';
import { KitchenEngine } from '@/game/engine';
import { RECIPES } from '@/game/config';
import type { ServiceReward } from '@/game/service-reward';
import '@/index.css';

it('keeps the success announcement accessible without covering rewards, and retains other warnings', async () => {
  const game = new KitchenEngine(); game.start();
  game.state.chefs[0].held = { kind: 'plate', parts: [...RECIPES.salad.parts] };
  game.interact(game.state.chefs[0], game.state.stations.find(st => st.kind === 'serve')!);
  const screen = await render(<GameHUD state={{ ...game.state }} />);
  const status = screen.getByRole('status');
  await expect.element(status).toHaveTextContent('Beautifully served! +50 +20 tip');
  await expect.element(status).toHaveClass('sr-only');
  expect(status.element().getBoundingClientRect().width).toBe(1);
  game.say('No matching order. Keep the dish for the next guest.');
  await screen.rerender(<GameHUD state={{ ...game.state }} />);
  await expect.element(status).not.toHaveClass('sr-only');
  await expect.element(status).toHaveTextContent('No matching order');
  expect(status.element().getBoundingClientRect().width).toBeGreaterThan(100);
});

const reward: ServiceReward = { id: 1, orderId: 7, chefId: 0, recipe: 'salad', points: 50, tip: 20, total: 70, x: 6.4, z: 0, slot: 0, startedAt: 0 };

it('renders the real total and included tip without introducing a new currency or duplicate announcement', async () => {
  const ref = createRef<HTMLDivElement>();
  await render(<ServiceRewardPopup ref={ref} reward={reward} />);
  expect(ref.current?.textContent).toBe('+70incl. +20 tip');
  expect(ref.current?.getAttribute('aria-hidden')).toBe('true');
  expect(ref.current?.querySelectorAll('button, [tabindex], [role="status"]')).toHaveLength(0);
  expect(getComputedStyle(ref.current!).pointerEvents).toBe('none');
  expect(ref.current?.getAttribute('data-service-reward')).toBe('1');
});

it('keeps independent totals, including a zero-tip delivery', async () => {
  const first = createRef<HTMLDivElement>(), second = createRef<HTMLDivElement>();
  await render(<><ServiceRewardPopup ref={first} reward={reward} /><ServiceRewardPopup ref={second} reward={{ ...reward, id: 2, chefId: 1, tip: 0, total: 50, slot: 1 }} /></>);
  expect(first.current?.textContent).toBe('+70incl. +20 tip');
  expect(second.current?.textContent).toBe('+50incl. +0 tip');
  expect(second.current?.getAttribute('data-chef')).toBe('1');
});
