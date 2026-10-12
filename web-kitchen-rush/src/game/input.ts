import type { PlayerInput } from './types';
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyK', 'KeyL', 'KeyJ']);
/** Independent key state supports two chefs simultaneously; pick-up and dash are edge-triggered. */
export class KitchenInput {
  keys = new Set<string>();
  pressed = new Set<string>();
  touch = { x: 0, y: 0, work: false, pick: false, dash: false };
  private enabled: () => boolean;
  private onPause: () => void;
  constructor(enabled: () => boolean, onPause: () => void) { this.enabled = enabled; this.onPause = onPause; window.addEventListener('keydown', this.down); window.addEventListener('keyup', this.up); window.addEventListener('blur', this.blur); }
  private down = (e: KeyboardEvent): void => {
    if (e.target instanceof Element && e.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (e.code === 'Escape') { e.preventDefault(); if (!e.repeat) this.onPause(); this.clear(); return; }
    if (!this.enabled()) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat && !this.keys.has(e.code)) this.pressed.add(e.code);
    this.keys.add(e.code);
  };
  private up = (e: KeyboardEvent): void => { this.keys.delete(e.code); };
  private blur = (): void => { this.clear(); };
  clear(): void { this.keys.clear(); this.pressed.clear(); this.touch = { x: 0, y: 0, work: false, pick: false, dash: false }; }
  read(): PlayerInput[] {
    const key = (code: string) => this.keys.has(code) ? 1 : 0;
    const inputs = [{ x: key('KeyD') - key('KeyA') + this.touch.x, y: key('KeyW') - key('KeyS') + this.touch.y, pick: this.pressed.has('KeyE') || this.touch.pick, work: this.keys.has('KeyF') || this.touch.work, dash: this.pressed.has('Space') || this.touch.dash }, { x: key('ArrowRight') - key('ArrowLeft'), y: key('ArrowUp') - key('ArrowDown'), pick: this.pressed.has('KeyK'), work: this.keys.has('KeyL'), dash: this.pressed.has('KeyJ') }];
    this.pressed.clear(); this.touch.pick = false; this.touch.dash = false; return inputs;
  }
  dispose(): void { window.removeEventListener('keydown', this.down); window.removeEventListener('keyup', this.up); window.removeEventListener('blur', this.blur); this.clear(); }
}
