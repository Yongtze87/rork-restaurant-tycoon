import { KitchenEngine } from '@/game/engine';
import { RECIPES } from '@/game/config';
import { MAX_SERVICE_REWARDS, SERVICE_REWARD_SECONDS, sampleServiceReward } from '@/game/service-reward';
import type { Item, Recipe } from '@/game/types';

let game: KitchenEngine;
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  game = new KitchenEngine(); game.start();
});
afterEach(() => vi.unstubAllGlobals());
const hatch = () => game.state.stations.find(st => st.kind === 'serve')!;
function deliver(recipe: Recipe = 'salad', chefId = 0): void {
  const chef = game.state.chefs[chefId];
  chef.held = { kind: 'plate', parts: [...RECIPES[recipe].parts] };
  game.interact(chef, hatch());
}
function tick(seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += .02) game.update(Math.min(.02, seconds - t), []);
}

it.each(['salad', 'burger'] as const)('captures the exact %s award, including patience and combo tip, without changing service', recipe => {
  game.state.combo = 2; game.state.penalties = 20; game.state.score = -20;
  const order = game.state.orders.find(o => o.recipe === recipe)!;
  order.remaining = order.duration * .5;
  const score = game.state.score; const chef = game.state.chefs[0]; const position = [chef.x, chef.z];
  deliver(recipe);
  expect(game.serviceRewards).toHaveLength(1);
  expect(game.serviceRewards[0]).toMatchObject({ orderId: order.id, chefId: 0, recipe, total: RECIPES[recipe].points + 20, points: RECIPES[recipe].points, tip: 20, startedAt: 0, x: hatch().x, z: hatch().z, slot: 0 });
  expect(game.serviceRewards[0].total).toBe(game.state.score - score);
  expect(game.state.served).toBe(1); expect(game.state.combo).toBe(3);
  expect(game.state.returns).toEqual([7]); expect(chef.held).toBeNull();
  expect([chef.x, chef.z]).toEqual(position);
  expect(game.dining.guests.find(g => g.id === order.id)?.outcome).toBe('served');
  game.interact(chef, hatch()); expect(game.serviceRewards).toHaveLength(1);
});

it.each<Item | null>([null, { kind: 'plate', parts: [] }, { kind: 'plate', parts: ['lettuce:chopped'] }, { kind: 'patty', state: 'burnt' }])('never rewards unfinished or invalid delivery: %j', item => {
  game.state.chefs[0].held = item; game.interact(game.state.chefs[0], hatch());
  expect(game.serviceRewards).toHaveLength(0); expect(game.state.score).toBe(0);
});

it('does not reward a wrong order, a burning hatch, a timeout or ordinary food placement', () => {
  game.state.orders = game.state.orders.filter(o => o.recipe === 'burger'); deliver();
  hatch().fire = 1; deliver('burger'); hatch().fire = 0;
  game.interact(game.state.chefs[0], game.state.stations.find(st => st.kind === 'counter')!);
  game.state.orders.forEach(o => { o.remaining = .01; }); tick(.02);
  expect(game.serviceRewards).toHaveLength(0); expect(game.state.score).toBe(-20);
});

it('keeps both chefs and exact order IDs separate on same-frame matching deliveries', () => {
  game.select(0, 'coop'); game.start();
  game.state.orders[1].recipe = 'salad';
  const st = hatch();
  game.state.chefs.forEach((chef, i) => Object.assign(chef, { x: st.x - 1.3, z: st.z + (i ? .1 : -.1), facing: Math.PI / 2, held: { kind: 'plate', parts: [...RECIPES.salad.parts] } }));
  const pick = { x: 0, y: 0, pick: true, work: false, dash: false };
  game.update(.02, [pick, pick]);
  expect(game.serviceRewards.map(r => [r.chefId, r.orderId, r.slot, r.total])).toEqual([[0, 1, 0, 70], [1, 2, 1, 75]]);
  expect(game.state.score).toBe(145); expect(game.state.returns).toHaveLength(2);
  expect(new Set(game.serviceRewards.map(r => r.id)).size).toBe(2);
  const captured = { ...game.serviceRewards[0] }; deliver('burger', 1);
  expect(game.serviceRewards[0]).toEqual(captured);
});

it('only active player input emits rewards and practice works across all three shifts', () => {
  for (const level of [0, 1, 2]) {
    game.state.level = level; game.start(true);
    const st = hatch(); Object.assign(game.state.chefs[1], { x: st.x - 1.3, z: st.z, held: { kind: 'plate', parts: [...RECIPES.salad.parts] } });
    game.update(.02, [{ x: 0, y: 0, pick: false, work: false, dash: false }, { x: 0, y: 0, pick: true, work: false, dash: false }]);
    expect(game.serviceRewards).toHaveLength(0);
    deliver(); deliver('burger');
    expect(game.serviceRewards.map(r => r.total)).toEqual([70, 105]);
    expect(game.state.time).toBe(180);
  }
});

it('freezes, resumes, expires and preserves the seven-second dirty return', () => {
  deliver(); tick(.25); const reward = game.serviceRewards[0];
  const pose = sampleServiceReward(reward, game.state.elapsed, false);
  game.pause(true); tick(5);
  expect(game.serviceRewards).toEqual([reward]); expect(sampleServiceReward(reward, game.state.elapsed, false)).toEqual(pose);
  game.pause(false); tick(SERVICE_REWARD_SECONDS);
  expect(game.serviceRewards).toHaveLength(0); expect(game.state.dirty).toBe(0);
  tick(5); expect(game.state.dirty).toBe(1);
});

it('clears cues on restart, navigation, layout selection and results without reusing IDs', () => {
  deliver(); const id = game.serviceRewards[0].id;
  game.start(); expect(game.serviceRewards).toHaveLength(0); deliver(); expect(game.serviceRewards[0].id).toBeGreaterThan(id);
  game.setPhase('menu'); expect(game.serviceRewards).toHaveLength(0);
  game.start(); deliver(); game.select(0, 'coop'); expect(game.serviceRewards).toHaveLength(0);
  game.start(); deliver(); game.finish(); expect(game.serviceRewards).toHaveLength(0);
});

it('caps rapid deliveries without dropping scores or overlapping slots', () => {
  game.start(true); deliver();
  for (let i = 0; i < 30; i++) deliver('burger');
  expect(game.serviceRewards).toHaveLength(MAX_SERVICE_REWARDS);
  expect(new Set(game.serviceRewards.map(r => r.slot)).size).toBe(MAX_SERVICE_REWARDS);
  expect(new Set(game.serviceRewards.map(r => r.id)).size).toBe(MAX_SERVICE_REWARDS);
  expect(game.state.served).toBe(31);
  expect(game.state.score).toBe(game.state.orderPoints + game.state.tips);
});

it('pops, rises and fades deterministically, with a stationary reduced-motion alternative', () => {
  deliver(); const reward = game.serviceRewards[0];
  expect(sampleServiceReward(reward, .16, false).scale).toBeGreaterThan(1);
  expect(sampleServiceReward(reward, .32, false).scale).toBe(1);
  expect(sampleServiceReward(reward, .8, false).y).toBeLessThan(sampleServiceReward(reward, .2, false).y);
  expect(sampleServiceReward(reward, 1.6, false).opacity).toBeLessThan(1);
  for (const t of [.01, .4, 1.7]) expect(sampleServiceReward(reward, t, true)).toEqual({ y: 0, scale: 1, opacity: 1, glint: 0 });
  for (const reduced of [false, true]) for (const t of [-1, SERVICE_REWARD_SECONDS, 20]) expect(sampleServiceReward(reward, t, reduced).opacity).toBe(0);
});
