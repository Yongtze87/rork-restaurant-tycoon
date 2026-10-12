import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrafficAudio } from '@/management/traffic-audio';
class Param { value = 0; setValueAtTime = vi.fn(); setTargetAtTime = vi.fn(); linearRampToValueAtTime = vi.fn(); cancelScheduledValues = vi.fn(); }
class Node { connect = vi.fn(); disconnect = vi.fn(); gain = new Param(); pan = new Param(); frequency = new Param(); playbackRate = new Param(); type = ''; }
class Source extends Node { buffer = null; loop = false; onended: (() => void) | null = null; start = vi.fn(); stop = vi.fn(); }
class Context {
  currentTime = 0; state = 'running'; destination = new Node(); sources: Source[] = [];
  createBufferSource = () => { const source = new Source(); this.sources.push(source); return source; };
  createGain = () => new Node(); createStereoPanner = () => new Node(); createBiquadFilter = () => new Node();
  createBuffer = () => ({ duration: .7, getChannelData: () => new Float32Array(700) });
  decodeAudioData = vi.fn(async () => ({ duration: .7, length: 700, sampleRate: 1000, numberOfChannels: 1, getChannelData: () => new Float32Array(700).fill(.5) }));
  resume = vi.fn(async () => { this.state = 'running'; }); close = vi.fn(async () => {});
}
let context: Context, audio: TrafficAudio, events: EventTarget, doc: EventTarget & { hidden: boolean }, allowed: boolean;
const actors = Array.from({ length: 6 }, () => ({ pose: { x: 6.3, z: 19, yaw: 0 } }));
const frame = () => audio.update(actors, 10, 1, 0, .1, 5, false);
const unlock = async () => { events.dispatchEvent(new Event('pointerdown')); await vi.waitFor(() => expect(audio.inspect().ready).toBe(true)); frame(); };
beforeEach(() => {
  context = new Context(); allowed = true; events = new EventTarget(); doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('window', events); vi.stubGlobal('document', doc);
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
  actors.forEach(actor => { actor.pose.z = 19; });
  audio = new TrafficAudio({ engine: 'engine.mp3', horn: 'horn.mp3' }, () => allowed);
});
afterEach(() => { audio.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('traffic audio lifecycle', () => {
  it('loads only after a gesture, shares decoded buffers, and keeps exactly six engine sources', async () => {
    frame(); expect(fetch).not.toHaveBeenCalled(); expect(audio.inspect().unlocked).toBe(false);
    await unlock(); expect(fetch).toHaveBeenCalledTimes(2); expect(context.sources).toHaveLength(6);
    for (let i = 0; i < 50; i++) frame();
    events.dispatchEvent(new Event('keydown')); expect(context.sources).toHaveLength(6); expect(fetch).toHaveBeenCalledTimes(2);
    expect(context.sources.every(source => source.loop)).toBe(true);
  });
  it.each(['pause', 'mute', 'report', 'reduced motion'])('cuts existing sounds immediately on %s, without a resume horn', async () => {
    await unlock(); allowed = false; audio.sync();
    expect(context.sources.every(source => source.stop.mock.calls.length > 0)).toBe(true); expect(audio.inspect().engines).toBe(0);
    frame(); expect(context.sources).toHaveLength(6);
    allowed = true; audio.sync(); frame(); expect(audio.inspect().engines).toBe(6); expect(audio.inspect().horns).toBe(0);
  });
  it('stops on hidden tab and page exit without waiting for a render frame', async () => {
    await unlock(); doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); expect(audio.inspect().active).toBe(false);
    doc.hidden = false; frame(); expect(audio.inspect().active).toBe(true);
    events.dispatchEvent(new Event('pagehide')); expect(audio.inspect().engines).toBe(0);
  });
  it('plays a single bounded horn on a new nearby pass and cleans its nodes', async () => {
    await unlock(); actors.forEach(actor => { actor.pose.z = 30; });
    for (let i = 0; i < 40; i++) frame();
    actors.forEach(actor => { actor.pose.z = 19; }); frame();
    expect(audio.inspect().horns).toBe(1); expect(audio.inspect().hornActive).toBe(true);
    const horn = context.sources[6]; expect(horn.loop).toBe(false); expect(horn.stop).toHaveBeenCalledWith(.7);
    horn.onended?.(); expect(audio.inspect().hornActive).toBe(false); expect(horn.disconnect).toHaveBeenCalledOnce();
  });
  it('reset clears sources and pass detection without re-fetching', async () => {
    await unlock(); audio.reset(); frame(); expect(context.sources).toHaveLength(12); expect(audio.inspect().horns).toBe(0); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('re-enables after an earlier muted gesture without requiring another scene click', async () => {
    allowed = false; events.dispatchEvent(new Event('pointerdown')); expect(fetch).not.toHaveBeenCalled();
    allowed = true; audio.sync(); await vi.waitFor(() => expect(audio.inspect().ready).toBe(true)); frame(); expect(audio.inspect().active).toBe(true);
  });
  it('fails quietly and rate-limits retries instead of blocking gameplay', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline')); const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    events.dispatchEvent(new Event('pointerdown')); await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
    frame(); events.dispatchEvent(new Event('keydown')); expect(fetch).toHaveBeenCalledTimes(2); expect(audio.inspect().engines).toBe(0);
  });
  it('disposes listeners, cancels loads and closes audio resources', async () => {
    await unlock(); audio.dispose(); expect(context.close).toHaveBeenCalledOnce();
    events.dispatchEvent(new Event('pointerdown')); doc.dispatchEvent(new Event('visibilitychange')); frame();
    expect(fetch).toHaveBeenCalledTimes(2); expect(audio.inspect().engines).toBe(0);
  });
});
