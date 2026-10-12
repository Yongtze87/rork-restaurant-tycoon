import { describe, expect, it } from 'vitest';
import { KitchenEngine } from '@/game/engine';
import { MAX_ACTIVE_ORDERS, RECIPES, SHIFTS } from '@/game/config';
import type { Mode } from '@/game/types';

const cases = [
  { level: 0, mode: 'solo', arrival: 28, patience: 110 },
  { level: 1, mode: 'solo', arrival: 22, patience: 90 },
  { level: 2, mode: 'solo', arrival: 17, patience: 70 },
  { level: 0, mode: 'coop', arrival: 20, patience: 85 },
  { level: 1, mode: 'coop', arrival: 16, patience: 70 },
  { level: 2, mode: 'coop', arrival: 12, patience: 55 },
] satisfies { level: number; mode: Mode; arrival: number; patience: number }[];

function start(level: number, mode: Mode, practice = false): KitchenEngine {
  const game = new KitchenEngine();
  game.state.progress = { solo: [1000, 1000, 1000], coop: [1000, 1000, 1000] };
  game.select(level, mode); game.start(practice);
  return game;
}
function tick(game: KitchenEngine, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += .02) game.update(Math.min(.02, seconds - t), []);
}
function serveFirst(game: KitchenEngine): number {
  const order = game.state.orders[0];
  const chef = game.state.chefs[game.state.mode === 'coop' ? 1 : 0];
  chef.held = { kind: 'plate', parts: [...RECIPES[order.recipe].parts] };
  game.interact(chef, game.state.stations.find(st => st.kind === 'serve')!);
  return order.id;
}

describe.each(cases)('$mode shift $level service pacing', ({ level, mode, arrival, patience }) => {
  it('uses the configured patience and interval from the first scheduled arrival onwards', () => {
    const game = start(level, mode);
    expect(game.state.orders.map(o => [o.recipe, o.duration, o.remaining])).toEqual([
      ['salad', patience, patience], ['burger', patience, patience],
    ]);
    expect(game.state.nextOrder).toBe(arrival);
    tick(game, arrival - .02); expect(game.state.orders).toHaveLength(2);
    tick(game, .04); expect(game.state.orders).toHaveLength(3);
    const third = game.state.orders[2];
    expect(third.duration).toBe(patience);
    expect(third.remaining).toBeGreaterThanOrEqual(patience - .04);
    expect(game.dining.guests.find(g => g.id === third.id)?.outcome).toBe('pending');
    const untilNext = game.state.nextOrder;
    tick(game, untilNext - .02); expect(game.state.orders).toHaveLength(3);
    tick(game, .04); expect(game.state.orders).toHaveLength(4);
    expect(game.state.orders[3].duration).toBe(patience);
    expect(game.state.nextOrder).toBeCloseTo(arrival, 1);
  });

  it('expires the correct guests at their deadline with the existing penalties', () => {
    const game = start(level, mode);
    const firstGuests = [...game.dining.guests];
    game.state.combo = 4;
    tick(game, patience - .02);
    expect(game.state.missed).toBe(0);
    expect(firstGuests.every(g => g.outcome === 'pending')).toBe(true);
    expect(firstGuests[0].patience).toBeCloseTo(.02 / patience);
    tick(game, .04);
    expect(game.state.missed).toBe(2);
    expect(game.state.penalties).toBe(40);
    expect(game.state.score).toBe(-40);
    expect(game.state.combo).toBe(0);
    expect(firstGuests.every(g => g.outcome === 'missed')).toBe(true);
    expect(game.state.orders.every(o => o.id > 2)).toBe(true);
    expect(game.state.returns).toEqual([]);
    expect(game.state.dirty).toBe(0);
    tick(game, .1); expect(game.state.missed).toBe(2);
  });

  it('caps a backed-up queue and resumes with one arrival, not a catch-up burst', () => {
    const game = start(level, mode);
    tick(game, arrival * 3 + .1);
    expect(game.state.orders).toHaveLength(MAX_ACTIVE_ORDERS);
    expect(game.state.nextId).toBe(5);
    expect(game.state.nextOrder).toBeLessThan(0);
    const served = serveFirst(game);
    expect(game.state.orders).toHaveLength(3);
    tick(game, .02);
    expect(game.state.orders).toHaveLength(4);
    expect(game.state.orders.some(o => o.id === served)).toBe(false);
    expect(game.state.nextId).toBe(6);
    expect(game.state.orders[3].remaining).toBe(patience);
    tick(game, .5);
    expect(game.state.nextId).toBe(6);
    expect(game.state.orders).toHaveLength(4);
  });

  it('preserves fast-service refills, actual tip calculation and seven-second dirty returns', () => {
    const game = start(level, mode);
    tick(game, 5);
    const order = { ...game.state.orders[0] };
    const nextOrder = game.state.nextOrder;
    const served = serveFirst(game);
    expect(game.state.orders).toHaveLength(2);
    expect(game.state.orders[1].duration).toBe(patience);
    expect(game.state.orders[1].remaining).toBe(patience);
    expect(game.state.nextOrder).toBe(nextOrder);
    expect(game.dining.guests.find(g => g.id === served)?.outcome).toBe('served');
    expect(game.state.tips).toBe(Math.round(20 * order.remaining / patience));
    expect(game.state.score).toBe(50 + game.state.tips);
    expect(game.serviceRewards[0].total).toBe(game.state.score);
    tick(game, 6.98); expect(game.state.dirty).toBe(0);
    tick(game, .04); expect(game.state.dirty).toBe(1);
  });

  it('freezes both timers on pause and resets them on replay and practice exit', () => {
    const game = start(level, mode);
    tick(game, 4); game.pause(true);
    const snapshot = JSON.stringify({ state: game.state, guests: game.dining.guests });
    tick(game, 10);
    expect(JSON.stringify({ state: game.state, guests: game.dining.guests })).toBe(snapshot);
    game.pause(false); tick(game, 1);
    expect(game.state.nextOrder).toBeCloseTo(arrival - 5);
    expect(game.state.orders[0].remaining).toBeCloseTo(patience - 5);
    game.start();
    expect(game.state.nextOrder).toBe(arrival);
    expect(game.state.orders[0].remaining).toBe(patience);
    game.start(true); tick(game, 220);
    expect(game.state.orders).toHaveLength(1);
    expect(game.state.orders[0].remaining).toBe(patience);
    expect(game.state.nextOrder).toBe(arrival);
    expect(game.state.missed).toBe(0);
    expect(game.state.time).toBe(180);
    expect(game.state.phase).toBe('playing');
    serveFirst(game); tick(game, 220);
    expect(game.state.orders).toHaveLength(1);
    expect(game.state.orders[0].recipe).toBe('burger');
    expect(game.state.orders[0].remaining).toBe(patience);
    expect(game.state.penalties).toBe(0);
    game.start(false);
    expect(game.state.nextOrder).toBe(arrival);
    expect(game.state.orders).toHaveLength(2);
    expect(game.state.elapsed).toBe(0);
    expect(game.state.score).toBe(0);
  });
});

it.each(['solo', 'coop'] as const)('%s has strictly faster arrivals and less patience with every shift', mode => {
  const paces = SHIFTS.map(shift => shift.service[mode]);
  for (let level = 1; level < paces.length; level++) {
    expect(paces[level].arrivalSeconds).toBeLessThan(paces[level - 1].arrivalSeconds);
    expect(paces[level].patienceSeconds).toBeLessThan(paces[level - 1].patienceSeconds);
  }
  for (const shift of SHIFTS) {
    expect(shift.service.solo.arrivalSeconds).toBeGreaterThan(shift.service.coop.arrivalSeconds);
    expect(shift.service.solo.patienceSeconds).toBeGreaterThan(shift.service.coop.patienceSeconds);
  }
});
