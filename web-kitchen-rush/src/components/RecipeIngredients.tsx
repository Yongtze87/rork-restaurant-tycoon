import { memo } from 'react';
import { RECIPES } from '@/game/config';
import type { Ingredient, Recipe } from '@/game/types';
import { cn } from '@/lib/utils';

const INGREDIENTS: Record<string, { kind: Ingredient; label: string }> = {
  'lettuce:chopped': { kind: 'lettuce', label: 'Chopped lettuce' },
  'tomato:chopped': { kind: 'tomato', label: 'Chopped tomato' },
  'patty:cooked': { kind: 'patty', label: 'Grilled patty' },
  'bun:raw': { kind: 'bun', label: 'Bun' },
};

/** Small, consistent food illustrations; independent of platform emoji and remote images. */
const IngredientIcon = memo(function IngredientIcon({ kind, label, compact }: { kind: Ingredient; label: string; compact: boolean }) {
  return <svg viewBox="0 0 48 48" role="img" aria-label={label} className={cn('shrink-0 drop-shadow-sm', compact ? 'size-[18px] sm:size-6 lg:size-7' : 'size-8')}>
    <title>{label}</title>
    {kind === 'lettuce' && <>
      <path d="M23 42C14 41 5 36 7 28C0 22 5 13 12 13C11 5 23 2 28 8C37 3 45 12 40 19C49 25 42 34 36 34C37 40 29 44 23 42Z" fill="#65a12c" stroke="#47772c" strokeWidth="2" />
      <path d="M24 39C13 33 12 22 17 15C22 21 27 15 31 12C37 21 34 32 24 39Z" fill="#90bb3a" />
      <path d="M24 39L24 19M24 30L16 24M24 25L31 20" fill="none" stroke="#d7e69b" strokeWidth="2.5" strokeLinecap="round" />
    </>}
    {kind === 'tomato' && <>
      <path d="M24 13C13 8 5 18 6 29C7 39 15 44 24 42C34 44 42 37 42 27C42 17 34 9 24 13Z" fill="#DC533C" stroke="#ad392b" strokeWidth="2" />
      <path d="M24 15L15 10L21 10L24 4L27 10L35 9L29 15L33 19L24 17L17 20Z" fill="#47772c" />
      <path d="M13 22Q10 27 13 32" fill="none" stroke="#ffad85" strokeWidth="3" strokeLinecap="round" />
    </>}
    {kind === 'patty' && <>
      <path d="M5 24C5 10 43 10 43 24V30C41 42 8 42 5 30Z" fill="#673f25" stroke="#4d3024" strokeWidth="2" />
      <ellipse cx="24" cy="23" rx="19" ry="11" fill="#aa7040" />
      <path d="M12 22L21 16M20 29L33 19M30 30L37 25" fill="none" stroke="#673f25" strokeWidth="3.5" strokeLinecap="round" />
    </>}
    {kind === 'bun' && <>
      <path d="M5 27C5 3 43 3 43 27L41 34C36 43 12 43 7 34Z" fill="#F2B743" stroke="#b77d2e" strokeWidth="2" />
      <path d="M6 28Q24 39 42 28L40 35Q24 45 8 35Z" fill="#d88723" />
      <path d="M14 18L17 16M25 14L28 15M31 22L34 20M21 24L24 23" stroke="#FFF2D7" strokeWidth="2.5" strokeLinecap="round" />
    </>}
  </svg>;
});

/** Recipe requirements come from the same recipe parts used by the cooking engine. */
export const RecipeIngredients = memo(function RecipeIngredients({ recipe, compact = false, className }: { recipe: Recipe; compact?: boolean; className?: string }) {
  return <ul aria-label={`${RECIPES[recipe].name} ingredients`} className={cn('flex items-center', compact ? 'justify-center gap-0.5 sm:gap-1' : 'flex-wrap gap-1.5', className)}>
    {RECIPES[recipe].parts.map(part => {
      const ingredient = INGREDIENTS[part];
      return <li key={part} className="flex shrink-0"><IngredientIcon {...ingredient} compact={compact} /></li>;
    })}
  </ul>;
});
