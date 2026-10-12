import { KitchenEngine } from '@/game/engine';
import { KitchenInput } from '@/game/input';
import { sampleChefHop } from '@/game/chef-hop';

function key(type: 'keydown' | 'keyup', code: string, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true }));
}
function setup(coop = true) {
  const game = new KitchenEngine(); game.select(0, coop ? 'coop' : 'solo'); game.start(true);
  const input = new KitchenInput(() => game.state.phase === 'playing' && !game.state.paused, () => game.pause(!game.state.paused));
  const step = () => game.update(.02, input.read());
  return { game, input, step };
}

test('E/K hop independently once per key press, not on key repeat or held Work', () => {
  const { game, input, step } = setup();
  try {
    key('keydown', 'KeyE'); step(); expect(game.chefHops.has(0)).toBe(true); expect(game.chefHops.has(1)).toBe(false);
    key('keydown', 'KeyK'); step(); expect(game.chefHops.get(1)?.startedAt).toBe(.04);
    for (let i = 0; i < 30; i++) { key('keydown', 'KeyE', true); key('keydown', 'KeyK', true); step(); }
    expect(game.chefHops.size).toBe(0);
    key('keyup', 'KeyE'); key('keydown', 'KeyE'); step(); expect(game.chefHops.has(0)).toBe(true); expect(game.chefHops.has(1)).toBe(false);
    for (let i = 0; i < 30; i++) { key('keydown', 'KeyF', i > 0); key('keydown', 'KeyL', i > 0); step(); }
    expect(game.chefHops.size).toBe(0);
  } finally { input.dispose(); }
});

test('Escape pauses a hop; disabled input and blur leave no queued bounce', () => {
  const { game, input, step } = setup();
  try {
    key('keydown', 'KeyE'); step(); for (let i = 0; i < 5; i++) step();
    key('keydown', 'Escape'); const elapsed = game.state.elapsed;
    const height = sampleChefHop(game.chefHops.get(0), elapsed, false);
    key('keydown', 'KeyK'); for (let i = 0; i < 30; i++) step();
    expect(game.state.elapsed).toBe(elapsed); expect(sampleChefHop(game.chefHops.get(0), elapsed, false)).toBe(height);
    expect(game.chefHops.has(1)).toBe(false);
    key('keydown', 'Escape'); for (let i = 0; i < 30; i++) step(); expect(game.chefHops.size).toBe(0);
    key('keydown', 'KeyE'); window.dispatchEvent(new Event('blur')); step(); expect(game.chefHops.size).toBe(0);
  } finally { input.dispose(); }
});

test('touch pick is consumed once and never moves the inactive solo chef', () => {
  const { game, input, step } = setup(false);
  try {
    input.touch.pick = true; step(); expect(input.touch.pick).toBe(false);
    expect(game.chefHops.has(0)).toBe(true); expect(game.chefHops.has(1)).toBe(false);
    for (let i = 0; i < 30; i++) step(); expect(game.chefHops.size).toBe(0);
    input.touch.pick = true; step(); expect(game.chefHops.has(0)).toBe(true);
  } finally { input.dispose(); }
});
