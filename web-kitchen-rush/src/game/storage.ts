import type { Progress } from './types';
import { cleanOutfits, type ChefOutfits } from './chef-outfit';
const KEY = 'kitchen-rush-progress-v1';
const OUTFIT_KEY = 'kitchen-rush-outfits-v1';
/** Cosmetic preferences have their own key; saved scores are never rewritten. */
export function loadOutfits(): ChefOutfits {
  try { return cleanOutfits(JSON.parse(localStorage.getItem(OUTFIT_KEY) ?? 'null')); }
  catch { return cleanOutfits(null); }
}
export function saveOutfits(outfits: ChefOutfits): boolean {
  try { localStorage.setItem(OUTFIT_KEY, JSON.stringify(outfits)); return true; }
  catch { return false; }
}
/** Invalid or unavailable browser storage never prevents playing. */
export function loadProgress(): Progress {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (data && typeof data === 'object') {
      const value = data as Partial<Progress>;
      const clean = (scores: unknown): number[] => Array.isArray(scores) ? [0, 1, 2].map(i => typeof scores[i] === 'number' && Number.isSafeInteger(scores[i]) ? Math.max(0, scores[i]) : 0) : [0, 0, 0];
      return { solo: clean(value.solo), coop: clean(value.coop) };
    }
  } catch { /* Storage may be disabled in private browsing. */ }
  return { solo: [0, 0, 0], coop: [0, 0, 0] };
}
export function saveProgress(progress: Progress): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); return true; } catch { return false; }
}
