import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitchenAudio } from '@/game/audio';
import { engine } from '@/game/engine';
import { AUDIO } from '@/game/assets';

class Source {
  onended: (() => void) | null = null;
  connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class Voice extends Source {
  buffer: unknown = null;
  playbackRate = { value: 1 };
}
class Tone extends Source {
  type = 'sine';
  frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}
class MockContext {
  state = 'running'; currentTime = 10; destination = {};
  voices: Voice[] = []; tones: Tone[] = [];
  resume = vi.fn(async () => {}); close = vi.fn(async () => {});
  decodeAudioData = vi.fn(async () => ({ sampleRate: 1000, getChannelData: () => Float32Array.from({ length: 100 }, (_, i) => i < 20 ? 0 : .5) }));
  createBufferSource(): Voice { const voice = new Voice(); this.voices.push(voice); return voice; }
  createOscillator(): Tone { const tone = new Tone(); this.tones.push(tone); return tone; }
  createGain() { return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
}
let audio: KitchenAudio;
let context: MockContext;
let events: EventTarget;
let fetchAudio: ReturnType<typeof vi.fn>;
beforeEach(() => {
  events = new EventTarget(); context = new MockContext();
  vi.stubGlobal('window', events); vi.stubGlobal('document', { hidden: false });
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  vi.stubGlobal('AudioBufferSourceNode', Voice);
  vi.stubGlobal('Audio', class { play = vi.fn(async () => {}); pause = vi.fn(); });
  fetchAudio = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal('fetch', fetchAudio); vi.spyOn(console, 'warn').mockImplementation(() => {});
  engine.start(true); engine.setAudio('sound', true); audio = new KitchenAudio();
});
afterEach(() => { audio.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function unlock(): Promise<void> {
  events.dispatchEvent(new Event('pointerdown'));
  // Flush fetch, arrayBuffer and decode continuations without a wall-clock delay.
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('contact audio lifecycle', () => {
  it('loads once after a gesture and trims silence to align the attack with contact', async () => {
    expect(fetchAudio).not.toHaveBeenCalled(); await unlock(); events.dispatchEvent(new Event('keydown'));
    expect(fetchAudio).toHaveBeenCalledOnce(); expect(fetchAudio.mock.calls[0][0]).toBe(AUDIO.chop);
    engine.onSound('chop'); expect(context.voices).toHaveLength(1);
    expect(context.voices[0].start).toHaveBeenCalledWith(10, .016);
    expect(context.voices[0].stop).toHaveBeenCalledWith(10.19);
  });
  it('lets simultaneous co-op contacts play independently and releases ended nodes', async () => {
    await unlock(); engine.onSound('chop'); engine.onSound('chop');
    expect(context.voices).toHaveLength(2);
    expect(context.voices[0].playbackRate.value).not.toBe(context.voices[1].playbackRate.value);
    context.voices[0].onended?.(); expect(context.voices[0].disconnect).toHaveBeenCalledOnce();
    engine.pause(true); expect(context.voices[0].stop).toHaveBeenCalledTimes(1); expect(context.voices[1].stop).toHaveBeenCalledTimes(2);
  });
  it('stops existing chopping tails on mute, restart and navigation', async () => {
    await unlock(); engine.onSound('chop'); engine.setAudio('sound', false); expect(context.voices[0].stop).toHaveBeenCalledTimes(2);
    engine.setAudio('sound', true); engine.state.elapsed = 1; engine.notify(); engine.onSound('chop');
    engine.start(true); expect(context.voices[1].stop).toHaveBeenCalledTimes(2);
    engine.onSound('chop'); engine.setPhase('menu'); expect(context.voices[2].stop).toHaveBeenCalledTimes(2);
  });
  it('uses an immediate local percussive fallback if the sound file cannot load', async () => {
    fetchAudio.mockRejectedValueOnce(new Error('offline')); await unlock(); engine.onSound('chop');
    expect(context.voices).toHaveLength(0); expect(context.tones).toHaveLength(1);
    expect(context.tones[0].start).toHaveBeenCalled(); expect(console.warn).toHaveBeenCalledOnce();
  });
});
