import { ArrowRight, BookOpen, ChevronDown, ChevronUp, Utensils } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RECIPES } from '@/game/config';
import type { Order, Recipe } from '@/game/types';
import { cn } from '@/lib/utils';
import { DishArt } from './GameBits';
import { RecipeIngredients } from './RecipeIngredients';

const ROOMY_SCREEN = '(min-width: 1280px) and (min-height: 700px)';
const MENU_RECIPES = Object.keys(RECIPES) as Recipe[];

/** A non-modal recipe reference; live counts never modify orders or pause the kitchen. */
export function MenuBoard({ orders, practice }: { orders: Order[]; practice: boolean }) {
  const [open, setOpen] = useState<boolean>(() => window.matchMedia(ROOMY_SCREEN).matches);
  useEffect(() => {
    const media = window.matchMedia(ROOMY_SCREEN);
    const resize = (): void => setOpen(media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

  return <Collapsible asChild open={open} onOpenChange={setOpen}>
    <aside aria-label="Kitchen menu" className={cn('paper pointer-events-auto absolute right-4 top-[132px] z-10 max-w-[calc(100%-32px)] sm:right-6 xl:top-[84px]', open ? 'w-64' : 'w-auto')}>
      <CollapsibleTrigger asChild>
        <button aria-label={open ? 'Hide kitchen menu' : 'Show kitchen menu'} className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-gold/15" onClick={event => { if (event.detail > 0) event.currentTarget.blur(); }} onKeyDown={event => {
          if (event.code === 'Space' || event.code === 'Enter') event.stopPropagation();
          else if (/^(Key[WASDEFKLJ]|Arrow(Up|Down|Left|Right))$/.test(event.code)) event.currentTarget.blur();
        }} onKeyUp={event => { if (event.code === 'Space' || event.code === 'Enter') event.stopPropagation(); }}>
          <BookOpen aria-hidden="true" className="size-5 shrink-0 text-teal" />
          <span className="flex-1 font-display text-lg">{open ? 'Kitchen menu' : 'Menu'}</span>
          {open ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="max-h-[max(120px,calc(100svh-360px))] overflow-y-auto overscroll-contain xl:max-h-[calc(100svh-320px)]">
        <p className="border-b border-dashed border-ink/20 px-3 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-ink/60">{MENU_RECIPES.length} dishes · made to order</p>
        <div className="divide-y divide-dashed divide-ink/20 px-3">
          {MENU_RECIPES.map(recipe => <MenuDish key={recipe} recipe={recipe} count={orders.filter(order => order.recipe === recipe).length} />)}
        </div>
        <p className="flex items-start gap-2 rounded-b-xl bg-teal px-3 py-2.5 text-[11px] font-bold leading-snug text-paper"><Utensils aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{practice ? 'Practice any dish. Serve at the right hatch.' : 'Match a ticket. Plate it. Serve at the right hatch.'}</p>
      </CollapsibleContent>
    </aside>
  </Collapsible>;
}

const MenuDish = memo(function MenuDish({ recipe, count }: { recipe: Recipe; count: number }) {
  const dish = RECIPES[recipe];
  const preparation = [dish.parts.some(part => part.endsWith(':chopped')) && 'Chop', dish.parts.some(part => part.endsWith(':cooked')) && 'grill'].filter(Boolean).join(' + ');
  return <article aria-label={dish.name} className="py-3">
    <div className="flex items-center gap-2">
      <DishArt recipe={recipe} className="h-10 w-12 shrink-0" />
      <div className="min-w-0"><h3 className="text-base leading-tight">{dish.name}</h3><p className="mt-0.5 text-[10px] font-bold text-ink/60">{dish.points} base pts</p></div>
    </div>
    <div className="mt-1.5 flex items-center justify-between gap-2">
      <RecipeIngredients recipe={recipe} compact className="justify-start [&_svg]:size-6" />
      <span aria-label={`${count} ${count === 1 ? 'order' : 'orders'} waiting for ${dish.name}`} className={cn('shrink-0 rounded-md px-2 py-1 text-[10px] font-extrabold tabular-nums', count > 0 ? 'bg-gold/70 text-ink' : 'bg-ink/5 text-ink/60')}>{count > 0 ? `${count} ordered` : 'No orders'}</span>
    </div>
    <p className="mt-2 flex items-center gap-1 text-[11px] font-extrabold text-teal">{preparation}<ArrowRight aria-hidden="true" className="size-3 shrink-0" />Plate<ArrowRight aria-hidden="true" className="size-3 shrink-0" />Serve</p>
  </article>;
});
