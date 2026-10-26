import { useState } from 'react';
import { Armchair, ArrowRight, ArrowUpRight, Banknote, Check, Grid2X2, Leaf, LockKeyhole, Move, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { CATALOG, capacity, comfort, type FurnitureKind, type RestaurantState } from './types';
import { FurnitureArt, Notice, SmallButton, type Action } from './Panels';
import { money } from './format';

const categories = ['All', 'Dining', 'Decor', 'Kitchen'] as const;
type Category = typeof categories[number];
const catalogOrder: FurnitureKind[] = ['table', 'plant', 'lamp', 'divider', 'prep', 'grill'];
const matchesCategory = (kind: FurnitureKind, category: Category): boolean => category === 'All' || CATALOG[kind].category === (category === 'Decor' ? 'Atmosphere' : category);

/** Reinvest real register cash in the existing, route-validated furniture catalog. */
export function InteriorsPanel({ state, choose, inspect, action }: {
  state: RestaurantState;
  choose: (kind: FurnitureKind) => void;
  inspect: (id: number) => void;
  action: Action;
}) {
  const [category, setCategory] = useState<Category>('All');
  const [view, setView] = useState<'shop' | 'room'>('shop');
  const editable = state.phase === 'planning';
  const owned = state.furniture.filter(item => matchesCategory(item.kind, category));
  return <section aria-label="Interior store">
    <div className="mb-3 hidden rounded-2xl border border-violet/40 bg-violet/15 px-3 py-2.5 text-ink lg:block">
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-bold"><Banknote size={18} aria-hidden="true" />Available cash</span><span data-testid="interiors-cash" className="font-display text-2xl tabular-nums">{money(state.cash)}</span></div>
      <p className="mt-1 text-[11px] text-ink/70">Earn it at the tables. Make it your own.</p>
    </div>
    {!editable && <Notice>{state.renovation ? 'Renovation queued. Your team will finish the remaining guests, then stay closed for you.' : 'Browse while your team works. Close for renovation before buying or rearranging.'}<SmallButton className="mt-2 w-full" disabled={state.renovation} onClick={() => restaurant.closeEarly()}>{state.renovation ? 'Renovation queued' : 'Close for renovation'}</SmallButton></Notice>}
    <div role="group" aria-label="Interior store views" className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1 lg:my-3">
      <button type="button" aria-pressed={view === 'shop'} onClick={() => setView('shop')} className={cn('flex min-h-11 items-center justify-center gap-2 rounded-lg text-xs font-extrabold', view === 'shop' ? 'bg-paper text-teal shadow-sm' : 'text-ink/60')}><ShoppingBag size={16} aria-hidden="true" />Shop</button>
      <button type="button" aria-pressed={view === 'room'} onClick={() => setView('room')} className={cn('flex min-h-11 items-center justify-center gap-1 rounded-lg text-xs font-extrabold', view === 'room' ? 'bg-paper text-teal shadow-sm' : 'text-ink/60')}>In your room <span className="rounded-full bg-teal/10 px-1.5 tabular-nums">{state.furniture.length}</span></button>
    </div>
    <div role="group" aria-label="Furniture categories" className="mb-3 grid grid-cols-4 gap-1">{categories.map(cat => <button type="button" key={cat} aria-pressed={category === cat} onClick={() => setCategory(cat)} className={cn('min-h-11 rounded-full px-1 text-xs font-extrabold', category === cat ? 'bg-teal text-paper' : 'text-ink/65 hover:bg-ink/5')}>{cat}</button>)}</div>
    {view === 'shop' ? <>
      <p className="mb-3 hidden text-xs leading-relaxed text-ink/65 lg:block">Choose a piece, preview it on the grid, then Confirm to buy. Nothing is charged until it fits.</p>
      <div className="space-y-3">{catalogOrder.filter(kind => matchesCategory(kind, category)).map(kind => {
        const item = CATALOG[kind], count = state.furniture.filter(f => f.kind === kind).length, affordable = state.cash >= item.price;
        const benefit = kind === 'table' ? 'Table + 2 shell seats included' : item.comfort > 0 ? `+${Math.min(item.comfort, 100 - comfort(state))} atmosphere${comfort(state) === 100 ? ' · at maximum' : ''}` : kind === 'prep' ? 'Prepares kelp salads' : 'Sears fish cakes';
        return <button type="button" key={kind} aria-label={`Preview ${item.name} · ${money(item.price)}`} disabled={!editable || !affordable} onClick={() => choose(kind)} className="group w-full rounded-2xl border border-ink/10 bg-ink/[.06] p-3 text-left transition hover:border-teal/50 hover:bg-ink/10 active:scale-[.99] disabled:cursor-not-allowed disabled:hover:border-ink/10 motion-reduce:transition-none">
          <div className="flex items-center gap-3"><div className="w-16 shrink-0"><FurnitureArt kind={kind} /></div><div className="min-w-0 flex-1"><h3 className="font-display text-lg leading-tight">{item.name}</h3><p className="mt-1 text-[11px] font-bold text-teal">{benefit}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-ink/60"><Grid2X2 size={12} aria-hidden="true" />{item.size} × {item.size} tiles · {count} placed</p></div></div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink/10 pt-2"><span className="font-display text-xl tabular-nums text-teal">{money(item.price)}</span><span className={cn('flex items-center gap-1 text-[11px] font-extrabold', !affordable ? 'text-danger' : editable ? 'text-teal' : 'text-ink/55')}>{!affordable ? `Need ${money(item.price - state.cash)} more` : editable ? <>Preview & place <ArrowRight size={14} aria-hidden="true" /></> : 'After renovation'}</span></div>
        </button>;
      })}</div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink/60">Decor improves patience and tips, up to 100 atmosphere. Seats come with each table and need a clear aisle.</p>
    </> : <>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-teal"><span className="flex items-center gap-1"><Armchair size={15} aria-hidden="true" />{capacity(state)} seats</span><span className="flex items-center gap-1"><Leaf size={15} aria-hidden="true" />{comfort(state)}/100 atmosphere</span></div>
      <p className="mb-3 text-xs leading-relaxed text-ink/65">Select a piece to move or rotate it for free, or sell it for 70% of its price.</p>
      {!owned.length ? <Notice>No pieces in this category yet. Find something you love in Shop.</Notice> : <div className="space-y-2">{owned.map(item => <button type="button" key={item.id} aria-label={`Edit ${CATALOG[item.kind].name} at column ${item.x + 1}, row ${item.z + 1}`} disabled={!editable} onClick={() => inspect(item.id)} className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-ink/10 bg-ink/[.06] p-3 text-left transition hover:border-teal/40 disabled:opacity-60 motion-reduce:transition-none"><div className="w-12 shrink-0"><FurnitureArt kind={item.kind} /></div><div className="min-w-0 flex-1"><h3 className="text-base leading-tight">{CATALOG[item.kind].name}</h3><p className="mt-1 text-[11px] text-ink/60">Col {item.x + 1} · Row {item.z + 1}</p><p className="mt-1 text-[11px] font-bold text-teal">Resale {money(Math.floor(CATALOG[item.kind].price * .7))}</p></div><Move size={16} className="shrink-0 text-teal" aria-hidden="true" /></button>)}</div>}
    </>}
    <div className="mt-5 rounded-2xl border border-dashed border-teal/30 bg-teal/5 p-4"><div className="mb-2 flex items-center justify-between"><h3 className="text-lg">The east grotto</h3>{state.expanded ? <Check size={19} /> : <ArrowUpRight size={20} />}</div><p className="text-xs leading-relaxed text-ink/65">{state.expanded ? 'Forty extra tiles. Your next great idea belongs here.' : 'Room for more tables and little touches. Unlock after 3 service days.'}</p><SmallButton className="mt-3 w-full" disabled={!editable || state.expanded || state.history.length < 3 || state.cash < 900} onClick={() => action(restaurant.expand())}>{state.expanded ? 'Grotto unlocked' : <>{state.history.length < 3 && <LockKeyhole size={14} />}Expand · $900</>}</SmallButton></div>
  </section>;
}
