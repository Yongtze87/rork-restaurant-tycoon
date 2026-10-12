import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHEF_DASH_SPEED, CHEF_WALK_SPEED, DASH_COOLDOWN_SECONDS, DASH_DURATION_SECONDS } from '@/game/config';
import { KitchenEngine } from '@/game/engine';
import type { PlayerInput } from '@/game/types';

const idle: PlayerInput = { x: 0, y: 0, pick: false, work: false, dash: false };
let game: KitchenEngine;

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  game = new KitchenEngine();
  game.start(true);
  Object.assign(game.state.chefs[0], { x: -4.5, z: -1.5, facing: Math.PI / 2 });
});

function advance(seconds: number, inputs: PlayerInput[] = [], step = .02): void {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += step) game.update(Math.min(step, seconds - elapsed), inputs);
}

describe('chef dash', () => {
  it('bursts from rest in the facing direction, keeps carried food, then stops', () => {
    const chef = game.state.chefs[0];
    const sound = vi.fn(); game.onSound = sound;
    chef.held = { kind: 'plate', parts: ['bun:raw'] };
    const food = chef.held;
    const start = chef.x;
    game.update(.02, [{ ...idle, dash: true }]);
    advance(DASH_DURATION_SECONDS - .02);
    expect(chef.x - start).toBeCloseTo(CHEF_DASH_SPEED * DASH_DURATION_SECONDS);
    expect(chef.dash).toBe(0);
    const end = chef.x;
    advance(.3);
    expect(chef.x).toBe(end);
    expect(chef.moving).toBe(false);
    expect(chef.held).toBe(food);
    expect(sound).toHaveBeenCalledExactlyOnceWith('dash');
  });

  it.each([20, 30, 60, 144])('has the same burst and walking distance at %i FPS', fps => {
    const step = 1 / fps;
    const chef = game.state.chefs[0]; const start = chef.x;
    game.update(step, [{ ...idle, x: 1, dash: true }]);
    advance(.5 - step, [{ ...idle, x: 1 }], step);
    expect(chef.x - start).toBeCloseTo(CHEF_DASH_SPEED * DASH_DURATION_SECONDS + CHEF_WALK_SPEED * (.5 - DASH_DURATION_SECONDS));
    expect(chef.cooldown).toBeCloseTo(DASH_COOLDOWN_SECONDS - .5);
    expect(chef.dash).toBe(0);
  });

  it('locks the burst heading even if movement is released or reversed', () => {
    const chef = game.state.chefs[0]; const start = chef.x;
    game.update(.02, [{ ...idle, x: 1, dash: true }]);
    advance(DASH_DURATION_SECONDS - .02, [{ ...idle, x: -1 }]);
    expect(chef.x - start).toBeCloseTo(CHEF_DASH_SPEED * DASH_DURATION_SECONDS);
    game.update(.02, [{ ...idle, x: -1 }]);
    expect(chef.x - start).toBeCloseTo(CHEF_DASH_SPEED * DASH_DURATION_SECONDS - CHEF_WALK_SPEED * .02);
  });

  it('normalizes diagonals and uses camera-relative direction', () => {
    game.state.stations = [];
    const chef = game.state.chefs[0]; chef.x = 0; chef.z = 0;
    game.update(.02, [{ ...idle, x: 1, y: 1, dash: true }], { rx: 0, rz: 1, fx: 1, fz: 0 });
    advance(DASH_DURATION_SECONDS - .02);
    expect(chef.x).toBeGreaterThan(0); expect(chef.z).toBeGreaterThan(0);
    expect(Math.hypot(chef.x, chef.z)).toBeCloseTo(CHEF_DASH_SPEED * DASH_DURATION_SECONDS);
  });

  it('rejects presses while recharging and becomes ready at exactly three seconds', () => {
    const sound = vi.fn(); game.onSound = sound;
    game.update(.02, [{ ...idle, dash: true }]);
    advance(.98);
    game.update(.02, [{ ...idle, dash: true }]);
    expect(game.state.chefs[0].dash).toBe(0);
    expect(sound).toHaveBeenCalledTimes(1);
    advance(DASH_COOLDOWN_SECONDS - 1.02);
    expect(game.state.chefs[0].cooldown).toBe(0);
    game.update(.02, [{ ...idle, dash: true }]);
    expect(game.state.chefs[0].dash).toBeGreaterThan(0);
    expect(sound).toHaveBeenCalledTimes(2);
  });

  it('supports simultaneous dashes and independent co-op recharge', () => {
    game.select(0, 'coop'); game.start(true);
    game.update(.02, [{ ...idle, dash: true }, { ...idle, dash: true }]);
    expect(game.state.chefs.every(chef => chef.dash > 0)).toBe(true);
    advance(3);
    game.update(.02, [{ ...idle, dash: true }]);
    advance(.5);
    expect(game.state.chefs[1].cooldown).toBe(0);
    game.update(.02, [idle, { ...idle, dash: true }]);
    expect(game.state.chefs[0].cooldown).toBeCloseTo(2.46);
    expect(game.state.chefs[1].cooldown).toBeCloseTo(2.98);
  });

  it('freezes an active burst and its recharge during pause, then resets on restart', () => {
    game.update(.02, [{ ...idle, dash: true }]);
    game.pause(true);
    const before = { ...game.state.chefs[0] };
    advance(5, [{ ...idle, x: 1, dash: true }]);
    expect(game.state.chefs[0]).toEqual(before);
    game.pause(false); advance(.02);
    expect(game.state.chefs[0].dash).toBeLessThan(before.dash);
    game.start();
    expect(game.state.chefs.every(chef => chef.cooldown === 0 && chef.dash === 0)).toBe(true);
  });

  it('does not activate the inactive solo chef or run outside gameplay', () => {
    game.update(.02, [idle, { ...idle, dash: true }]);
    expect(game.state.chefs[1].cooldown).toBe(0);
    for (const phase of ['menu', 'briefing', 'results'] as const) {
      game.setPhase(phase);
      game.update(.02, [{ ...idle, dash: true }]);
      expect(game.state.chefs[0].cooldown).toBe(0);
    }
  });

  it.each([0, 1, 2])('cannot pass through counters or rooftop edges in layout %i', level => {
    game.state.level = level; game.start(true);
    const chef = game.state.chefs[0];
    const station = game.state.stations.find(st => st.kind === 'grill')!;
    chef.x = station.x; chef.z = station.z + 1.1;
    expect(game.canMove(chef.x, chef.z)).toBe(true);
    game.update(.05, [{ ...idle, y: 1, dash: true }]);
    advance(.5);
    expect(chef.z).toBeGreaterThanOrEqual(station.z + 1.04);
    expect(game.canMove(chef.x, chef.z)).toBe(true);
    chef.x = -7.1; chef.z = -4.28; chef.cooldown = 0;
    game.update(.05, [{ ...idle, x: -1, y: 1, dash: true }]);
    advance(.5);
    expect(chef.x).toBeGreaterThanOrEqual(-7.15);
    expect(chef.z).toBeGreaterThanOrEqual(-4.3);
    expect(game.canMove(chef.x, chef.z)).toBe(true);
  });
});
