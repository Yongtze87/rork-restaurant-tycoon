import { AUDIO } from './assets';
import { engine } from './engine';
import type { SoundEvent } from './types';
/** Audio starts only after a deliberate user gesture and suspends with the game. */
export class KitchenAudio {
  private context: AudioContext | null = null;
  private music: HTMLAudioElement | null = null;
  private served: HTMLAudioElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private chopBuffer: AudioBuffer | null = null;
  private chopOffset = 0;
  private chopSequence = 0;
  private chopSources = new Set<AudioBufferSourceNode | OscillatorNode>();
  private abort = new AbortController();
  private previousElapsed = 0;
  constructor() {
    window.addEventListener('pointerdown', this.unlock, { once: true });
    window.addEventListener('keydown', this.unlock, { once: true });
    engine.onSound = this.play;
    this.unsubscribe = engine.subscribe(this.sync);
  }
  private unlock = (): void => {
    if (!this.context) { this.context = new AudioContext(); void this.loadChop(this.context); }
    void this.context.resume().catch(() => {});
    if (!this.music && AUDIO.music) { this.music = new Audio(AUDIO.music); this.music.loop = true; this.music.volume = .24; }
    if (!this.served && AUDIO.served) { this.served = new Audio(AUDIO.served); this.served.volume = .5; }
    this.sync();
  };
  private sync = (): void => {
    if (engine.state.paused || !engine.state.sound || engine.state.phase !== 'playing' || engine.state.elapsed < this.previousElapsed) {
      for (const source of this.chopSources) source.stop();
      this.chopSources.clear();
    }
    this.previousElapsed = engine.state.elapsed;
    if (!this.music) return;
    if (engine.state.music && !engine.state.paused && !document.hidden) void this.music.play().catch(() => {});
    else this.music.pause();
  };
  private async loadChop(ctx: AudioContext): Promise<void> {
    try {
      const response = await fetch(AUDIO.chop, { signal: this.abort.signal });
      if (!response.ok) throw new Error('Audio unavailable');
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      if (this.abort.signal.aborted) return;
      // Strip encoder/leading silence so the audible attack is on the contact frame.
      const data = buffer.getChannelData(0);
      const attack = data.findIndex(value => Math.abs(value) > .018);
      this.chopOffset = Math.max(0, attack / buffer.sampleRate - .004);
      this.chopBuffer = buffer;
    } catch {
      if (!this.abort.signal.aborted) console.warn('Chopping audio unavailable; using local percussion.');
    }
  }
  private playChop(ctx: AudioContext): void {
    const now = ctx.currentTime, gain = ctx.createGain();
    const source = this.chopBuffer ? ctx.createBufferSource() : ctx.createOscillator();
    const rate = .97 + this.chopSequence++ % 3 * .035;
    if (source instanceof AudioBufferSourceNode) {
      source.buffer = this.chopBuffer; source.playbackRate.value = rate;
      gain.gain.setValueAtTime(.4, now);
    } else {
      source.type = 'triangle'; source.frequency.setValueAtTime(240 * rate, now);
      source.frequency.exponentialRampToValueAtTime(85, now + .075);
      gain.gain.setValueAtTime(.12, now);
    }
    gain.gain.exponentialRampToValueAtTime(.001, now + .18);
    source.connect(gain); gain.connect(ctx.destination); this.chopSources.add(source);
    if (source instanceof AudioBufferSourceNode) source.start(now, this.chopOffset); else source.start(now);
    source.stop(now + .19);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.chopSources.delete(source); };
  }
  private play = (event: SoundEvent): void => {
    if (event === 'serve' && this.served) { this.served.currentTime = 0; void this.served.play().catch(() => {}); return; }
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    if (event === 'chop') { this.playChop(ctx); return; }
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    const frequencies: Record<SoundEvent, number> = { pick: 460, chop: 170, wash: 1100, serve: 800, miss: 160, fire: 650, dash: 260 };
    oscillator.type = event === 'wash' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequencies[event], ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequencies[event] * (event === 'miss' ? .5 : 1.4), ctx.currentTime + .12);
    gain.gain.setValueAtTime(.055, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .14);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .15);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  };
  dispose(): void {
    window.removeEventListener('pointerdown', this.unlock); window.removeEventListener('keydown', this.unlock);
    this.abort.abort();
    for (const source of this.chopSources) source.stop();
    this.chopSources.clear();
    this.unsubscribe?.(); this.music?.pause(); this.served?.pause(); void this.context?.close(); engine.onSound = () => {};
  }
}
