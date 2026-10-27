import { useState } from 'react';
import { Armchair, ArrowUpRight, Check, Leaf, LockKeyhole, Move, ShoppingBag, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { CATALOG, capacity, comfort, type FurnitureKind, type RestaurantState } from './types';
import { FurnitureArt, type Action } from './Panels';
import { guardSpend } from './spend-guard';
import { money } from './format';

const categories = ['All', 'Dining', 'Decor', 'Kitchen'] as const;
type Category = typeof categories[number];
const catalogOrder: FurnitureKind[] = ['table', 'plant', 'lamp', 'divider', 'prep', 'grill'];
const matchesCategory = (kind: FurnitureKind, category: Category): boolean => category === 'All' || CATALOG[kind].category === (category === 'Decor' ? 'Atmosphere' : category);

/** The build tray: a slim strip of furniture along the bottom, so the floor stays in view while you choose. Works while open. */
export function InteriorsPanel({ state, choose, inspect, action, onClose }: {
  state: RestaurantState;
  choose: (kind: FurnitureKind) => void;
  inspect: (id: number) => void;
  action: Action;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<Category>('All');
  const [view, setView] = useState<'shop' | 'room'>('shop');
  const owned = state.furniture.filter(item => matchesCategory(item.kind, category));
  const card = 'flex w-[112px] shrink-0 flex-col gap-1 rounded-xl border border-ink/10 bg-ink/[.06] p-1.5 text-left transition hover:border-teal/50 disabled:opacity-45';
  return <section aria-label="Interior store" className="paper mx-2 mb-1 mt-1 shrink-0 p-1.5">
    <div className="flex items-center gap-1">
      <div role="group" aria-label="Interior store views" className="flex shrink-0 rounded-lg bg-ink/5 p-0.5">
        <button type="button" aria-pressed={view === 'shop'} onClick={() => setView('shop')} className={cn('flex min-h-10 items-center gap-1 rounded-md px-2.5 text-[11px] font-extrabold', view === 'shop' ? 'bg-paper text-teal shadow-sm' : 'text-ink/60')}><ShoppingBag size={14} aria-hidden="true" />Shop</button>
        <button type="button" aria-pressed={view === 'room'} onClick={() => setView('room')} className={cn('flex min-h-10 items-center gap-1 rounded-md px-2.5 text-[11px] font-extrabold', view === 'room' ? 'bg-paper text-teal shadow-sm' : 'text-ink/60')}>Room <span className="rounded-full bg-teal/10 px-1 tabular-nums">{state.furniture.length}</span></button>
      </div>
      <div role="group" aria-label="Furniture categories" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">{categories.map(cat => <button type="button" key={cat} aria-pressed={category === cat} onClick={() => setCategory(cat)} className={cn('min-h-10 shrink-0 rounded-full px-2.5 text-[11px] font-extrabold', category === cat ? 'bg-teal text-paper' : 'text-ink/65 hover:bg-ink/5')}>{cat}</button>)}</div>
      <span className="hidden shrink-0 items-center gap-2 px-1 text-[10px] font-bold text-ink/60 sm:flex"><Armchair size={13} aria-hidden="true" />{capacity(state)}<Leaf size={13} aria-hidden="true" />{comfort(state)}%</span>
      <button type="button" aria-label="Close build menu" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-ink/5"><X size={17} /></button>
    </div>
    <div className="mt-1 flex gap-1.5 overflow-x-auto pb-0.5">
      {view === 'shop' ? <>
        {catalogOrder.filter(kind => matchesCategory(kind, category)).map(kind => {
          const item = CATALOG[kind], count = state.furniture.filter(f => f.kind === kind).length, affordable = state.cash >= item.price;
          const benefit = kind === 'table' ? '+2 seats' : item.comfort > 0 ? `+${Math.min(item.comfort, 100 - comfort(state))} cozy` : kind === 'prep' ? 'Kelp dishes' : 'Grill dishes';
          return <button type="button" key={kind} data-tutorial={kind === 'table' ? 'buy-table' : undefined} aria-label={`Preview ${item.name} · ${money(item.price)}`} title={item.description} disabled={!affordable} onClick={() => choose(kind)} className={card}>
            <FurnitureArt kind={kind} small />
            <span className="truncate text-[11px] font-extrabold leading-tight">{item.name}</span>
            <span className="flex items-center justify-between gap-1 text-[10px] font-bold"><span className={affordable ? 'text-teal' : 'text-danger'}>{affordable ? money(item.price) : `Need ${money(item.price - state.cash)} more`}</span>{affordable && <span className="text-ink/50">{count > 0 ? `×${count}` : ''}</span>}</span>
            <span className="truncate text-[10px] text-ink/55">{benefit}</span>
          </button>;
        })}
        {category === 'All' && <button type="button" aria-label={state.expanded ? 'East grotto unlocked' : 'Expand the east grotto · $900'} title="Forty extra floor tiles. Unlocks after 3 days." disabled={state.expanded || state.history.length < 3 || state.cash < 900} onClick={() => guardSpend('The east grotto', 900, () => action(restaurant.expand()))} className={cn(card, 'border-dashed border-teal/30')}>
          <div className="grid h-12 place-items-center rounded-xl bg-teal/5 text-teal">{state.expanded ? <Check size={22} /> : state.history.length < 3 ? <LockKeyhole size={20} /> : <ArrowUpRight size={22} />}</div>
          <span className="truncate text-[11px] font-extrabold leading-tight">East grotto</span>
          <span className="text-[10px] font-bold text-teal">{state.expanded ? 'Unlocked' : '$900'}</span>
          <span className="truncate text-[10px] text-ink/55">{state.history.length < 3 && !state.expanded ? 'After 3 days' : '+40 tiles'}</span>
        </button>}
      </> : !owned.length ? <p className="p-2 text-xs text-ink/60">Nothing here yet. Find something in Shop.</p>
        : owned.map(item => <button type="button" key={item.id} aria-label={`Edit ${CATALOG[item.kind].name} at column ${item.x + 1}, row ${item.z + 1}`} onClick={() => inspect(item.id)} className={card}>
          <FurnitureArt kind={item.kind} small />
          <span className="flex items-center justify-between gap-1 text-[11px] font-extrabold leading-tight"><span className="truncate">{CATALOG[item.kind].name}</span><span data-testid="room-level" className="shrink-0 rounded-full bg-teal/10 px-1 text-[10px] text-teal">Lv {item.level}</span></span>
          <span className="text-[10px] font-bold text-teal">Resale {money(Math.floor(CATALOG[item.kind].price * .7))}{item.level > 1 ? ' · base price' : ''}</span>
          <span className="flex items-center gap-1 text-[10px] text-ink/55"><Move size={11} aria-hidden="true" />Col {item.x + 1} · Row {item.z + 1}</span>
        </button>)}
    </div>
  </section>;
}
