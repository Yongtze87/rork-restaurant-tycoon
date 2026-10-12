import { TrafficMix, type TrafficActor } from './traffic-mix';

interface Voice { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; filter: BiquadFilterNode; }
/** Gesture-unlocked, bounded traffic audio. No simulation writes or independent movement clock. */
export class TrafficAudio {
  private context: AudioContext | null = null;
  private engine: AudioBuffer | null = null;
  private horn: AudioBuffer | null = null;
  private engines: Voice[] = [];
  private hornVoice: Voice | null = null;
  private hornCar = -1;
  private mix = new TrafficMix();
  private abort = new AbortController();
  private disposed = false;
  private loading = false;
  private interacted = false;
  private retryAt = 0;
  private hornsPlayed = 0;
  private active = false;
  constructor(private urls: { engine: string; horn: string }, private canPlay: () => boolean) {
    window.addEventListener('pointerdown', this.unlock);
    window.addEventListener('keydown', this.unlock);
    document.addEventListener('visibilitychange', this.sync);
    window.addEventListener('pagehide', this.reset);
  }
  private unlock = (): void => {
    this.interacted = true;
    if (this.disposed || !this.canPlay() || document.hidden) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state !== 'running') void this.context.resume().catch(() => undefined);
      if ((!this.engine || !this.horn) && !this.loading && performance.now() >= this.retryAt) void this.load(this.context);
    } catch { /* Unsupported/blocked audio must never block restaurant play. */ }
  };
  private async load(context: AudioContext): Promise<void> {
    this.loading = true;
    const decode = async (url: string): Promise<AudioBuffer> => {
      const response = await fetch(url, { signal: this.abort.signal });
      if (!response.ok) throw new Error('Audio unavailable');
      const decoded = await context.decodeAudioData(await response.arrayBuffer());
      // Downmix before stereo panning and bound peaks across differently mastered clips.
      const mono = context.createBuffer(1, decoded.length, decoded.sampleRate), data = mono.getChannelData(0);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const input = decoded.getChannelData(channel);
        for (let i = 0; i < data.length; i++) data[i] += input[i] / decoded.numberOfChannels;
      }
      let peak = .01;
      for (const value of data) peak = Math.max(peak, Math.abs(value));
      const scale = Math.min(2, .8 / peak);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
      return mono;
    };
    const results = await Promise.allSettled([this.engine ? Promise.resolve(this.engine) : decode(this.urls.engine), this.horn ? Promise.resolve(this.horn) : decode(this.urls.horn)]);
    this.loading = false;
    if (this.disposed) return;
    if (results[0].status === 'fulfilled') this.engine = results[0].value;
    if (results[1].status === 'fulfilled') this.horn = results[1].value;
    if (results.some(result => result.status === 'rejected')) {
      this.retryAt = performance.now() + 10000;
      console.warn('City traffic audio unavailable; a later interaction will retry.');
    }
  }
  /** Called by engine/visibility/accessibility subscriptions even when RAF is stopped. */
  sync = (): void => { if (!this.canPlay() || document.hidden) this.reset(); else if (this.interacted) this.unlock(); };
  reset = (): void => {
    if (!this.active && !this.engines.length && !this.hornVoice) return;
    for (const voice of this.engines) this.stop(voice);
    if (this.hornVoice) this.stop(this.hornVoice);
    this.engines = []; this.hornVoice = null; this.hornCar = -1; this.active = false; this.mix.reset();
  };
  private stop(voice: Voice): void {
    const now = this.context?.currentTime ?? 0;
    voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setTargetAtTime(0, now, .008);
    voice.source.stop(now + .04);
  }
  private voice(buffer: AudioBuffer, loop: boolean, id: number, time: number): Voice {
    const ctx = this.context!, source = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner(), filter = ctx.createBiquadFilter();
    source.buffer = buffer; source.loop = loop; gain.gain.value = 0;
    filter.type = 'lowpass'; filter.frequency.value = loop ? 1500 : 2200;
    source.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(ctx.destination);
    const voice = { source, gain, pan, filter };
    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect();
      if (this.hornVoice === voice) { this.hornVoice = null; this.hornCar = -1; }
    };
    source.start(0, loop ? (time + id * .53) % buffer.duration : 0);
    if (!loop) source.stop(ctx.currentTime + Math.min(buffer.duration, .85));
    return voice;
  }
  update(cars: readonly TrafficActor[], columns: number, rightX: number, rightZ: number, dt: number, time: number, building: boolean): void {
    const ctx = this.context;
    if (this.disposed || !ctx || ctx.state !== 'running' || !this.canPlay() || document.hidden) { this.sync(); return; }
    if (!this.engine) return;
    const horn = this.mix.step(cars, columns, rightX, rightZ, dt, building);
    if (!this.engines.length) this.engines = this.mix.voices.map((_, id) => this.voice(this.engine!, true, id, time));
    this.active = true;
    const now = ctx.currentTime;
    this.engines.forEach((voice, id) => {
      const target = this.mix.voices[id];
      voice.gain.gain.setTargetAtTime(target.gain, now, .12);
      voice.pan.pan.setTargetAtTime(target.pan, now, .08);
      voice.source.playbackRate.setTargetAtTime(target.rate, now, .16);
      voice.filter.frequency.setTargetAtTime(650 + 1100 * Math.max(0, 1 - target.distance / 22), now, .2);
    });
    if (building && this.hornVoice) { this.stop(this.hornVoice); this.hornVoice = null; this.hornCar = -1; }
    if (horn >= 0 && this.horn && !this.hornVoice) {
      this.hornVoice = this.voice(this.horn, false, horn, time); this.hornCar = horn; this.hornsPlayed++;
      const gain = this.hornVoice.gain.gain, duration = Math.min(this.horn.duration, .85);
      const peak = .12 * Math.max(0, 1 - this.mix.voices[horn].distance / 22);
      gain.setValueAtTime(0, now); gain.linearRampToValueAtTime(peak, now + .025);
      gain.setValueAtTime(peak, now + Math.max(.03, duration - .12)); gain.linearRampToValueAtTime(0, now + duration);
    }
    if (this.hornVoice && this.hornCar >= 0) this.hornVoice.pan.pan.setTargetAtTime(this.mix.voices[this.hornCar].pan, now, .05);
  }
  /** Local diagnostics, computed only on request, not in the render loop. */
  inspect() { return { unlocked: Boolean(this.context), context: this.context?.state, ready: Boolean(this.engine && this.horn), active: this.active, engines: this.engines.length, horns: this.hornsPlayed, hornActive: Boolean(this.hornVoice), voices: this.mix.voices.map(voice => ({ ...voice })) }; }
  dispose(): void {
    this.disposed = true; this.abort.abort(); this.reset();
    window.removeEventListener('pointerdown', this.unlock); window.removeEventListener('keydown', this.unlock);
    document.removeEventListener('visibilitychange', this.sync); window.removeEventListener('pagehide', this.reset);
    void this.context?.close().catch(() => undefined); this.context = null; this.engine = null; this.horn = null;
  }
}
