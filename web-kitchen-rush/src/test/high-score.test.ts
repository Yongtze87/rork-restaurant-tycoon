import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { KitchenEngine } from '@/game/engine';
import { highScoreFor } from '@/game/high-score';
import { loadProgress } from '@/game/storage';
import { RECIPES } from '@/game/config';

const key = 'kitchen-rush-progress-v1';
let store: Map<string, string>;
let write: ReturnType<typeof vi.fn>;
let game: KitchenEngine;
beforeEach(() => {
  store = new Map<string, string>();
  write = vi.fn((k: string, value: string) => { store.set(k, value); });
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: write });
  game = new KitchenEngine();
});
afterEach(() => vi.unstubAllGlobals());

function finish(score: number): void { game.start(); game.state.score = score; game.state.orderPoints = score; game.finish(); }

describe('mode high scores', () => {
  it('has an honest empty state for a new player', () => {
    expect(highScoreFor(game.state.progress, 'solo')).toBeNull();
    expect(highScoreFor(game.state.progress, 'coop')).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
  it('reads existing saves and selects the best shift independently per mode', () => {
    store.set(key, JSON.stringify({ solo: [450, 1250, 800], coop: [1800, 900, 2100] }));
    const restored = new KitchenEngine();
    expect(highScoreFor(restored.state.progress, 'solo')).toEqual({ score: 1250, level: 1 });
    expect(highScoreFor(restored.state.progress, 'coop')).toEqual({ score: 2100, level: 2 });
    expect(write).not.toHaveBeenCalled();
  });
  it('resolves tied shift bests consistently without adding their scores', () => {
    expect(highScoreFor({ solo: [800, 800, 700], coop: [] }, 'solo')).toEqual({ score: 800, level: 0 });
  });
  it('saves the exact completed total including tips and penalties, then restores it', () => {
    game.start();
    const chef = game.state.chefs[0];
    chef.held = { kind: 'plate', parts: [...RECIPES.salad.parts] };
    game.interact(chef, game.state.stations.find(s => s.kind === 'serve')!);
    game.state.orders[0].remaining = .001;
    game.update(.02, []);
    expect(game.state.score).toBe(50);
    expect(store.has(key)).toBe(false);
    game.state.time = .001; game.update(.02, []);
    expect(game.state.phase).toBe('results');
    expect(game.state.results?.newBest).toBe(true);
    expect(game.state.results?.score).toBe(game.state.orderPoints + game.state.tips - game.state.penalties);
    expect(highScoreFor(new KitchenEngine().state.progress, 'solo')).toEqual({ score: 50, level: 0 });
  });
  it.each([0, -20, 400, 500])('does not replace a 500-point best with %s', score => {
    finish(500); write.mockClear(); finish(score);
    expect(loadProgress().solo[0]).toBe(500);
    expect(game.state.results?.newBest).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
  it('replaces a record only on improvement and preserves other modes and shifts', () => {
    finish(500); game.select(1, 'solo'); finish(800);
    game.select(0, 'coop'); finish(950);
    game.select(0, 'solo'); finish(650);
    expect(new KitchenEngine().state.progress).toEqual({ solo: [650, 800, 0], coop: [950, 0, 0] });
    expect(highScoreFor(game.state.progress, 'solo')).toEqual({ score: 800, level: 1 });
  });
  it('does not let practice, leaving or restarting a shift overwrite records', () => {
    finish(500); write.mockClear();
    game.start(true); game.state.score = 9999; game.finish();
    game.setPhase('menu'); game.start(); game.state.score = 9000; game.setPhase('menu');
    game.start(); game.state.score = 8000; game.start();
    expect(highScoreFor(game.state.progress, 'solo')).toEqual({ score: 500, level: 0 });
    expect(loadProgress().solo[0]).toBe(500);
    expect(write).not.toHaveBeenCalled();
  });
  it.each(['broken json', 'null', '{"solo":["999",-1,1.5],"coop":[null,1e999,9007199254740992]}'])('recovers safely from malformed storage: %s', data => {
    store.set(key, data);
    expect(loadProgress()).toEqual({ solo: [0, 0, 0], coop: [0, 0, 0] });
  });
  it('retains a new record in memory if storage is blocked and can retry saving', () => {
    write.mockImplementation(() => { throw new Error('blocked'); });
    finish(600);
    expect(game.state.progressSaveFailed).toBe(true);
    expect(highScoreFor(game.state.progress, 'solo')).toEqual({ score: 600, level: 0 });
    game.setPhase('menu'); expect(game.state.progressSaveFailed).toBe(true);
    game.retryProgressSave(); expect(game.state.progressSaveFailed).toBe(true);
    write.mockImplementation((k: string, value: string) => { store.set(k, value); });
    game.retryProgressSave();
    expect(game.state.progressSaveFailed).toBe(false);
    expect(new KitchenEngine().state.progress.solo[0]).toBe(600);
  });
  it('automatically retries an unsaved best after a lower completed score', () => {
    write.mockImplementationOnce(() => { throw new Error('quota'); });
    finish(650); finish(200);
    expect(game.state.progressSaveFailed).toBe(false);
    expect(loadProgress().solo[0]).toBe(650);
    expect(game.state.results?.newBest).toBe(false);
  });
  it('remains playable when reading storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: write });
    const restored = new KitchenEngine(); restored.start();
    expect(highScoreFor(restored.state.progress, 'solo')).toBeNull();
    expect(restored.state.phase).toBe('playing');
  });
});
