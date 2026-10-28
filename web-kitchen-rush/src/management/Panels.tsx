import type { ReactNode } from 'react';
import { Armchair, ArrowUpRight, ChefHat, Check, Coins, Flame, Flower2, Gem, Lamp, Leaf, LockKeyhole, Minus, Plus, Sofa, Sprout, Star, Trash2, TrendingUp, UserPlus, UtensilsCrossed } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { DEBT_PER_PEARL, GOALS, PRICE_CHANGES_PER_DAY, restaurant } from './engine';
import { DISHES, DISH_IDS, INGREDIENTS, MAX_PRICE, MIN_PRICE, staffWage, type DishId, type FurnitureKind, type RestaurantState } from './types';
import { ZONES, hasZone } from './zones';
import { DailyChallenges } from './DailyChallenges';
import { money, moneyCents } from './format';
import { WeeklyRevenue } from './WeeklyRevenue';
import { CollectionPanel } from './CollectionPanel';
import { Info, Stat } from './GameWindow';
import { guardSpend } from './spend-guard';
import { dayNames } from './calendar';
import { SeasonIcon } from './TideCard';

const furnitureIcons = { table: Armchair, prep: ChefHat, grill: Flame, plant: Flower2, divider: Sprout, lamp: Lamp, booth: Sofa };
export type Panel = 'build' | 'team' | 'menu' | 'ledger' | 'town';
export type LedgerTab = 'today' | 'week' | 'goals' | 'collection';
export type Action = (error: string | null) => void;
const HIRE_WAGE = { chef: 34, server: 26 } as const;

export function SmallButton({ children, onClick, disabled, className, label, tutorial }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string; label?: string; /** Tutorial target id. */ tutorial?: string }) {
  return <button type="button" data-tutorial={tutorial} aria-label={label} disabled={disabled} onClick={onClick} className={cn('flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-ink/[.06] px-3 text-xs font-extrabold transition hover:bg-ink/10 active:scale-95 disabled:opacity-40', className)}>{children}</button>;
}
export function FurnitureArt({ kind, small = false }: { kind: FurnitureKind; small?: boolean }) {
  const Icon = furnitureIcons[kind];
  return <div className={cn('relative flex items-center justify-center overflow-hidden rounded-xl', small ? 'h-12' : 'h-14', kind === 'table' ? 'bg-tomato/15' : kind === 'booth' ? 'bg-violet/25' : kind === 'plant' || kind === 'divider' ? 'bg-violet/15' : 'bg-teal/10')}>
    <Icon strokeWidth={1.25} className={cn('relative drop-shadow-[0_0_8px_#4DF0FF80]', small ? 'size-8' : 'size-9', kind === 'grill' ? 'text-tomato' : kind === 'booth' ? 'text-violet' : kind === 'lamp' ? 'fill-gold/40 text-ink' : 'text-teal')} />
  </div>;
}
export function Notice({ children }: { children: ReactNode }) { return <div className="mt-2 rounded-xl border border-gold/40 bg-gold/10 p-2.5 text-xs leading-snug text-ink/75">{children}</div>; }

/** The crew: who is working, what they cost, and hiring. Changes apply straight away, even while guests are in. */
export function TeamPanel({ state, action }: { state: RestaurantState; action: Action }) {
  const wages = state.staff.reduce((sum, staff) => sum + staffWage(staff), 0), limit = restaurant.crewLimit(), full = state.staff.length >= limit;
  return <>
    <div className="mb-3 grid grid-cols-3 gap-2"><Stat label="Crew" value={`${state.staff.length}/${limit}`} /><Stat label="Wages per shift" value={money(wages)} /><Stat label="Safe to spend" testId="safe-to-spend" value={money(restaurant.safeToSpend())} tone={restaurant.safeToSpend() > 0 ? undefined : 'danger'} /></div>
    <ul className="grid gap-2 sm:grid-cols-2">{state.staff.map(member => {
      const chef = member.role === 'chef', cost = member.level * 180, onlyOne = state.staff.filter(s => s.role === member.role).length === 1;
      return <li key={member.id} className="rounded-xl border border-ink/10 bg-ink/[.06] p-2.5">
        <div className="flex items-center gap-2.5"><span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', chef ? 'bg-tomato/15 text-tomato' : 'bg-teal/15 text-teal')}>{chef ? <ChefHat size={18} /> : <UtensilsCrossed size={18} />}</span>
          <div className="min-w-0 flex-1"><h3 className="truncate font-display text-base leading-tight">{member.name} <span className="font-body text-[11px] text-ink/50">{member.role}</span></h3>
            <p className="flex items-center gap-1 text-[11px] text-ink/60">{[1, 2, 3].map(level => <Star key={level} size={11} className={level <= member.level ? 'fill-gold text-gold' : 'text-ink/20'} />)}<span className="ml-1">{money(staffWage(member))}/shift</span></p></div>
          <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-extrabold uppercase text-teal">{member.task === 'idle' ? 'Free' : 'Busy'}</span></div>
        <div className="mt-2 flex gap-1.5">
          <SmallButton className="flex-1" disabled={member.level === 3 || state.cash < cost} label={member.level === 3 ? `${member.name} is fully trained` : `Train ${member.name} for ${money(cost)}`} onClick={() => guardSpend(`Training ${member.name}`, cost, () => action(restaurant.train(member.id)), 12)}><TrendingUp size={14} />{member.level === 3 ? 'Fully trained' : `Train · ${money(cost)}`}</SmallButton>
          <SmallButton label={`Dismiss ${member.name}`} disabled={onlyOne} onClick={() => action(restaurant.dismiss(member.id))}><Trash2 size={14} /></SmallButton>
        </div>
      </li>;
    })}</ul>
    <div className="mb-2 mt-4 flex items-center justify-between"><h3 className="font-display text-base">Hire</h3><Info>Chefs cook at a free kelp counter or vent grill, so add stations before more chefs. Servers deliver dishes and clear tables. Training makes them faster and adds $12 to their wage per shift. Mareen homes in Town raise the crew limit.</Info></div>
    <div className="grid grid-cols-2 gap-2">{(['chef', 'server'] as const).map(role => <SmallButton key={role} disabled={full || state.cash < 150} onClick={() => guardSpend(`Hiring a ${role}`, 150, () => action(restaurant.hire(role)), HIRE_WAGE[role])} className="flex-col gap-0.5 py-2"><UserPlus size={18} /><span>Hire {role}</span><span className="text-[10px] font-bold text-ink/50">$150 · +{money(HIRE_WAGE[role])}/shift</span></SmallButton>)}</div>
    {full && <p className="mt-2 text-[11px] text-ink/60">Crew is full. Build Mareen homes in Town for more room.</p>}
  </>;
}

/** The menu: what is offered and at what price. New prices apply to the next guests who order. */
export function MenuPanel({ state, action }: { state: RestaurantState; action: Action }) {
  const unlocked = DISH_IDS.filter(dish => hasZone(state.town, DISHES[dish].zone)), locked = DISH_IDS.filter(dish => !unlocked.includes(dish));
  const season = state.season, info = restaurant.seasonInfo();
  return <>
    {season && info && <div data-testid="season-banner" className="mb-2 flex items-center gap-2.5 rounded-xl border border-gold/40 bg-gold/10 p-2.5"><SeasonIcon group={season.group} size={20} className="shrink-0 text-gold" /><div className="min-w-0 flex-1 leading-tight"><p className="font-display text-base">{INGREDIENTS[season.group].season} · {info.daysLeft === 1 ? 'last day' : `${info.daysLeft} days left`}</p><p className="text-[11px] text-ink/65">{INGREDIENTS[season.group].name} dishes are in demand and guests may pay more. Demand looks {info.hint}.</p></div></div>}
    <div className="mb-2 flex items-center gap-2 rounded-xl bg-ink/[.06] px-2.5 py-1.5"><div className="min-w-0 flex-1 leading-tight"><p className="text-sm font-extrabold">Auto price</p><p className="text-[11px] text-ink/60">{state.pricing.auto ? 'Sensible prices, set each season' : 'You set every price'}</p></div>
      <Info>Above what guests expect, some walk away; below it, more of them order it and they tip more. In season guests accept a higher price, but how much is a secret that changes every season: watch how many walk away. Changing a dish’s price on more than {PRICE_CHANGES_PER_DAY} shifts a day upsets regulars and costs reputation. Auto price plays it safe; you can beat it.</Info>
      <Switch aria-label="Auto price" checked={state.pricing.auto} onCheckedChange={on => restaurant.setAutoPrice(on)} /></div>
    <ul className="space-y-2">{unlocked.map(dish => {
      const recipe = DISHES[dish], item = state.menu[dish], cost = restaurant.dishCost(dish), station = state.furniture.some(f => f.kind === recipe.station);
      const inSeason = restaurant.inSeason(dish), notes = inSeason ? season?.notes[dish] : undefined, changes = state.pricing.changes[dish] ?? 0;
      return <li key={dish} className={cn('rounded-xl border p-2.5', inSeason ? 'border-gold/50' : 'border-ink/10', recipe.station === 'prep' ? 'bg-teal/[.07]' : 'bg-tomato/[.08]')}>
        <div className="flex items-center gap-2.5"><DishIcon dish={dish} /><div className="min-w-0 flex-1"><h3 className="flex items-center gap-1.5 truncate font-display text-base leading-tight">{recipe.name}{inSeason && <span className="shrink-0 rounded-full bg-gold/25 px-1.5 font-body text-[10px] font-extrabold text-gold">In season</span>}</h3><p className="truncate text-[11px] text-ink/55">{recipe.seconds}s · {stationName[recipe.station]}{!station ? ' · no station yet' : ''}</p></div>
          <Switch aria-label={`Offer ${recipe.name}`} checked={item.enabled} onCheckedChange={checked => action(restaurant.setDish(dish, checked, item.price))} /></div>
        <div className="mt-2 flex items-center gap-2">
          <SmallButton label={`Lower ${recipe.name} price`} disabled={item.price <= MIN_PRICE} onClick={() => action(restaurant.setDish(dish, item.enabled, item.price - 2))}><Minus size={14} /></SmallButton>
          <p className="w-14 text-center font-display text-lg tabular-nums">{money(item.price)}</p>
          <SmallButton label={`Raise ${recipe.name} price`} disabled={item.price >= MAX_PRICE} onClick={() => action(restaurant.setDish(dish, item.enabled, item.price + 2))}><Plus size={14} /></SmallButton>
          <div className="ml-auto text-right text-[11px] leading-tight"><p className="font-extrabold text-teal">+{moneyCents(item.price - cost)} each</p><p className="text-ink/50">{inSeason ? `Usually ${money(recipe.fair)}` : `Suggested ${money(recipe.fair)}`}</p></div>
        </div>
        {(notes || changes > 0) && <p data-testid={`price-notes-${dish}`} className="mt-1.5 flex flex-wrap justify-between gap-x-2 text-[10px] font-bold">
          {notes ? <span className="text-ink/65">This season: {notes.sold} sold{notes.walked ? <span className="text-danger"> · {notes.walked} walked away over the price</span> : ''}</span> : <span />}
          {changes > 0 && <span className={changes > PRICE_CHANGES_PER_DAY ? 'text-danger' : changes === PRICE_CHANGES_PER_DAY ? 'text-gold' : 'text-ink/55'}>{changes > PRICE_CHANGES_PER_DAY ? 'Regulars are upset' : `Price changed ${changes}/${PRICE_CHANGES_PER_DAY} today`}</span>}
        </p>}
      </li>;
    })}</ul>
    {locked.length > 0 && <section aria-label="Locked dishes" className="mt-4"><h3 className="mb-2 font-display text-base">Deeper dishes</h3><ul className="grid grid-cols-2 gap-2">{locked.map(dish => {
      const recipe = DISHES[dish];
      return <li key={dish} aria-label={`${recipe.name}: unlocks in ${ZONES[recipe.zone].name}`} className="flex items-center gap-2 rounded-xl border border-ink/10 bg-ink/[.04] p-2 opacity-60 grayscale"><DishIcon dish={dish} small /><div className="min-w-0"><h4 className="truncate text-xs font-extrabold">{recipe.name}</h4><p className="flex items-center gap-1 truncate text-[10px] text-ink/65"><LockKeyhole size={10} aria-hidden="true" />{ZONES[recipe.zone].name}</p></div></li>;
    })}</ul></section>}
  </>;
}
const stationName = { prep: 'Kelp counter', grill: 'Vent grill' } as const;
function DishIcon({ dish, small = false }: { dish: DishId; small?: boolean }) {
  const Icon = DISHES[dish].station === 'prep' ? Leaf : Flame;
  return <div className={cn('grid shrink-0 place-items-center rounded-full bg-paper/70', small ? 'size-8' : 'size-9')}><Icon className={cn(small ? 'size-4' : 'size-5', DISHES[dish].station === 'prep' ? 'text-teal' : 'text-tomato')} aria-hidden="true" /></div>;
}

/** The ledger, one tab at a time: today's money, the week, milestones and the long-term collection. */
export function LedgerPanel({ state, action, onReport, tab }: { state: RestaurantState; action: Action; onReport: (day: number) => void; tab: LedgerTab }) {
  const names = dayNames(state.calendar);
  if (tab === 'week') return <WeeklyRevenue history={state.days} onReport={onReport} label={names.label} tick={names.tick} />;
  if (tab === 'collection') return <CollectionPanel state={state} action={action} />;
  if (tab === 'goals') return <section aria-label="Little milestones"><h3 className="sr-only">Little milestones</h3><ul className="space-y-2">{GOALS.map(goal => {
    const done = state.claimed.includes(goal.id), value = Math.min(goal.target, goal.value(state));
    return <li key={goal.id} className="flex items-center gap-2.5 rounded-xl border border-ink/10 bg-ink/[.04] p-2.5"><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h4 className="truncate text-sm font-extrabold">{goal.title}</h4><span className="shrink-0 text-[11px] font-bold text-teal">+{money(goal.reward)}</span></div><p className="truncate text-[11px] text-ink/60">{goal.text} · {value}/{goal.target}</p><progress aria-label={goal.text} value={value} max={goal.target} className="mt-1 h-1.5" /></div>
      <SmallButton className="shrink-0" disabled={done || value < goal.target} label={done ? `${goal.title} collected` : `Collect ${goal.title}`} onClick={() => action(restaurant.claim(goal.id))}>{done ? <Check size={14} /> : <Coins size={14} />}<span className="hidden min-[380px]:inline">{done ? 'Done' : 'Collect'}</span></SmallButton></li>;
  })}</ul></section>;
  const today = restaurant.todayTotals(), bills = restaurant.billsTonight(), safe = restaurant.safeToSpend();
  return <>
    <section aria-label="Register" className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
      <Stat label="In the register" value={money(state.cash)} tone="teal" />
      <Stat label="Next payroll" value={money(bills)} />
      <Stat label="Safe to spend" testId="safe-to-spend" value={money(safe)} tone={safe > 0 ? undefined : 'danger'} />
      <Stat label={state.debt ? 'Loan left' : 'Branches per shift'} value={state.debt ? money(state.debt) : money(restaurant.branchTotal())} tone={state.debt ? 'gold' : undefined} />
    </section>
    {state.debt > 0 && (() => { const pay = restaurant.debtPearls(); return <div data-testid="debt-card" className="mt-2 rounded-xl border border-gold/50 p-2.5">
      <div className="flex items-center gap-2"><p className="min-w-0 flex-1 text-xs"><strong>Debt {money(state.debt)}</strong> · repaid {money(Math.min(30, state.debt))} a shift</p>
        <SmallButton className="border-violet/40 bg-violet/15" disabled={pay.pearls < 1} label={pay.pearls ? `Pay ${money(pay.amount)} of debt with ${pay.pearls} pearls` : undefined} onClick={() => action(restaurant.payDebtWithPearls())}><Gem size={13} className="text-violet" />{pay.pearls ? `Clear ${money(pay.amount)} · ${pay.pearls}` : `$${DEBT_PER_PEARL} per pearl`}</SmallButton></div>
      <p className="mt-1 text-[10px] text-ink/60">Short of cash? Demolish a town building for half of what it cost: tap it in Town.</p>
    </div>; })()}
    {state.cash < 200 && !state.debt && <div className="mt-2 flex items-center gap-2 rounded-xl border border-gold/50 p-2.5"><p className="min-w-0 flex-1 text-xs"><strong>Recovery loan</strong> · $600, repaid $30 a shift</p><SmallButton onClick={() => action(restaurant.loan())}>Take loan</SmallButton></div>}
    <div className="mt-3"><DailyChallenges challenges={state.dailyChallenges} day={state.calendar.index} title="Today’s challenges" beforeOpening={state.phase === 'planning'} /></div>
    <h3 className="mb-2 flex items-center justify-between font-display text-base">Today so far<Info>Your crew works in short shifts of about 2½ minutes. Wages, rent and any loan repayment are paid at the end of each shift; a day’s receipt is the sum of its shifts. A new day starts at midnight.</Info></h3>
    <div className="grid grid-cols-4 gap-2"><Stat label="Served" value={today.served} /><Stat label="Sales + tips" value={money(today.revenue + today.tips)} /><Stat label="Ingredients" value={money(today.ingredients)} /><Stat label="Missed" value={today.missed} /></div>
    <section aria-label="Daily summaries" className="mt-4"><h3 className="mb-2 font-display text-base">Past days</h3>
      {!state.days.length ? <p className="text-xs text-ink/60">Today’s receipt arrives after midnight.</p> : <ul className="space-y-1.5">{[...state.days].reverse().map(report => <li key={report.day}><button type="button" aria-label={`View ${names.label(report.day)} summary`} onClick={() => onReport(report.day)} className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-ink/10 bg-ink/[.04] px-3 text-left hover:border-teal/40">
        <span className="font-display text-sm">{names.label(report.day)}</span><span className="min-w-0 flex-1 truncate text-[11px] text-ink/60">{report.served} served · {money(report.revenue + report.tips + (report.branch ?? 0))} in</span>
        <span className={cn('font-display text-sm tabular-nums', report.profit < 0 ? 'text-danger' : 'text-teal')}>{report.profit > 0 ? '+' : ''}{money(report.profit)}</span><ArrowUpRight size={15} aria-hidden="true" /></button></li>)}</ul>}
    </section>
  </>;
}
