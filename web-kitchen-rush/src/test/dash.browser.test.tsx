import { render } from 'vitest-browser-react';
import { DashButton, DashStatus } from '@/components/DashStatus';
import { KitchenEngine } from '@/game/engine';
import { KitchenInput } from '@/game/input';

function press(code: string, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, bubbles: true, cancelable: true }));
}
function release(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

test('Space and J trigger separate chefs once per press, without key-repeat dashing', () => {
  const game = new KitchenEngine(); game.select(0, 'coop'); game.start(true);
  const input = new KitchenInput(() => !game.state.paused, () => game.pause(!game.state.paused));
  try {
    press('Space'); press('KeyJ');
    game.update(.02, input.read());
    expect(game.state.chefs.every(chef => chef.dash > 0)).toBe(true);
    for (let i = 0; i < 160; i++) {
      press('Space', true); press('KeyJ', true);
      game.update(.02, input.read());
    }
    expect(game.state.chefs.every(chef => chef.cooldown === 0)).toBe(true);
    release('Space'); press('Space');
    game.update(.02, input.read());
    expect(game.state.chefs[0].dash).toBeGreaterThan(0);
    expect(game.state.chefs[1].cooldown).toBe(0);
    press('Escape');
    const paused = { ...game.state.chefs[0] };
    press('Space'); game.update(.02, input.read());
    expect(game.state.chefs[0]).toEqual(paused);
    expect(input.keys.size).toBe(0);
  } finally { input.dispose(); }
});

test('dash meters show ready, bursting, recharge, and paused simulation time', async () => {
  const game = new KitchenEngine(); game.start(true);
  const chef = game.state.chefs[0];
  const screen = await render(<DashStatus chef={chef} paused={false} />);
  const meter = screen.getByRole('progressbar', { name: 'Chef 1 dash recharge' });
  await expect.element(screen.getByText('DASH READY')).toBeVisible();
  await expect.element(screen.getByText('SPACE')).toBeVisible();
  await expect.element(meter).toHaveAttribute('value', '3');
  game.update(.02, [{ x: 0, y: 0, pick: false, work: false, dash: true }]);
  await screen.rerender(<DashStatus chef={chef} paused={false} />);
  await expect.element(screen.getByText('DASHING')).toBeVisible();
  for (let i = 0; i < 49; i++) game.update(.02, []);
  await screen.rerender(<DashStatus chef={chef} paused={false} />);
  await expect.element(screen.getByText('2.0s RECHARGE')).toBeVisible();
  expect(Number(meter.element().getAttribute('value'))).toBeCloseTo(1);
  game.pause(true); const cooldown = chef.cooldown;
  for (let i = 0; i < 50; i++) game.update(.02, []);
  await screen.rerender(<DashStatus chef={chef} paused={true} />);
  await expect.element(screen.getByText('PAUSED')).toBeVisible();
  expect(chef.cooldown).toBe(cooldown);
  game.pause(false);
  for (let i = 0; i < 100; i++) game.update(.02, []);
  await screen.rerender(<DashStatus chef={chef} paused={false} />);
  await expect.element(screen.getByText('DASH READY')).toBeVisible();
  await expect.element(meter).toHaveAttribute('value', '3');
});

test('co-op meters expose each chef’s own recharge and key', async () => {
  const game = new KitchenEngine(); game.select(0, 'coop'); game.start(true);
  game.state.chefs[0].cooldown = 1.2;
  const screen = await render(<>{game.state.chefs.map(chef => <DashStatus key={chef.id} chef={chef} paused={false} />)}</>);
  await expect.element(screen.getByText('1.2s RECHARGE')).toBeVisible();
  await expect.element(screen.getByText('DASH READY')).toBeVisible();
  await expect.element(screen.getByText('J', { exact: true })).toBeVisible();
  expect(screen.getByRole('progressbar').all()).toHaveLength(2);
});

test('the touch button uses the same burst and disables until recharge finishes', async () => {
  const game = new KitchenEngine(); game.start(true);
  const input = new KitchenInput(() => !game.state.paused, () => {});
  const chef = game.state.chefs[0];
  try {
    const onDash = () => { input.touch.dash = true; game.update(.02, input.read()); };
    const screen = await render(<DashButton chef={chef} paused={false} onDash={onDash} />);
    await screen.getByRole('button', { name: 'Dash', exact: true }).click();
    expect(chef.dash).toBeGreaterThan(0);
    expect(input.read()[0].dash).toBe(false);
    await screen.rerender(<DashButton chef={chef} paused={false} onDash={onDash} />);
    await expect.element(screen.getByRole('button')).toBeDisabled();
    await expect.element(screen.getByText('Dash · 3.0s')).toBeVisible();
    for (let i = 0; i < 149; i++) game.update(.02, []);
    await screen.rerender(<DashButton chef={chef} paused={false} onDash={onDash} />);
    await expect.element(screen.getByRole('button', { name: 'Dash', exact: true })).toBeEnabled();
    await screen.rerender(<DashButton chef={chef} paused={true} onDash={onDash} />);
    await expect.element(screen.getByRole('button')).toBeDisabled();
  } finally { input.dispose(); }
});
