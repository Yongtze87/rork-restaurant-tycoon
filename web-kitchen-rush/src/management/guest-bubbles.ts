import { useSyncExternalStore } from 'react';

/** Whether every guest shows a mood bubble, or only those who need attention (default). A per-device preference. */
const KEY = 'vast-ocean-guest-bubbles';
const listeners = new Set<() => void>();
let all = (() => { try { return localStorage.getItem(KEY) === 'all'; } catch { return false; } })();
export function setAllGuestBubbles(value: boolean): void { all = value; try { localStorage.setItem(KEY, value ? 'all' : 'attention'); } catch { /* storage blocked: this session only */ } listeners.forEach(l => l()); }
export const useAllGuestBubbles = (): boolean => useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => all, () => false);
