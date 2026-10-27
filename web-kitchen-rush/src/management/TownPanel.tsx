import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock, Compass, Gem, Hammer, LockKeyhole, MapPin, Mountain, Sparkles, Store, Waves, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { BUILDABLE, BUILDINGS, CHARMS, MAX_LEVEL, busyBuilders, canUnlock, effectText, finishCost, jobSeconds, lookFor, nextToKind, plotAt, plotLockReason, plotZone, type Plot, type Town } from './town';
import { BIOMES, currentColony, pendingFame } from './ocean';
import { ZONES, ZONE_IDS, ZONE_ARRIVAL_BONUS, hasZone, previousZone, zoneRequirements } from './zones';
import { DISHES, DISH_IDS } from './types';
import { formatDuration } from './iso/town-render';
import { money } from './format';
import { Notice, SmallButton, type Action } from './Panels';

export type PlotRef = { x: number; z: number };
/** Re-render once a second so construction timers count down. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  return now;
}
function plotLabel(town: Town, plot: Plot, now: number): string {
  if (plot.building) return `${BUILDINGS[plot.building].name} · ${plot.job ? `${plot.job.kind === 'build' ? 'building' : `to Lv ${plot.level + 1}`} · ${formatDuration(plot.job.endsAt - now)}` : `Lv ${plot.level}`}`;
  if (plot.owned) return 'Empty plot · choose a building';
  return `Unlock plot · ${money(restaurant.plotPrice())}`;
}

/** Depth zones: what each one needs, with progress, and the button for the next one. */
function ZoneSection({ action, onOcean }: { action: Action; onOcean?: () => void }) {
  const state = restaurant.state, town = state.town;
  return <section aria-label="Depth zones" className="mb-4 space-y-2">
    <h3 className="flex items-center gap-1.5 text-lg"><Mountain size={17} className="text-teal" aria-hidden="true" />Depth zones</h3>
    {ZONE_IDS.map(id => {
      const info = ZONES[id], reached = hasZone(town, id), prev = previousZone(id), next = !reached && (!prev || hasZone(town, prev));
      const dishes = DISH_IDS.filter(dish => DISHES[dish].zone === id).map(dish => DISHES[dish].name).join(' · ');
      if (reached) return <div key={id} className="flex min-h-11 items-center gap-2 rounded-xl bg-teal/10 px-3 text-sm font-bold"><Check size={16} className="shrink-0 text-teal" aria-hidden="true" /><span className="min-w-0 flex-1">{info.name}</span><span className="text-[11px] font-extrabold text-teal">Reached</span></div>;
      const price = restaurant.zonePrice(id), requirements = zoneRequirements(state, id, price), ready = requirements.every(r => r.met);
      return <div key={id} aria-label={info.name} role="group" className={cn('rounded-2xl border p-3', next ? 'border-teal/40 bg-ink/[.06]' : 'border-ink/10 bg-ink/[.03] opacity-70')}>
        <div className="flex items-start justify-between gap-2"><h4 className="font-display text-lg leading-tight">{info.name}</h4><span className="font-display text-lg tabular-nums text-teal">{money(price)}</span></div>
        <p className="mt-0.5 text-[11px] text-ink/65">{info.description}</p>
        <p className="mt-1 text-[11px] font-bold text-teal">New dishes: {dishes} · guests arrive {Math.round(ZONE_ARRIVAL_BONUS * 100)}% more often</p>
        <ul className="mt-2 space-y-1 text-[11px]">{requirements.map(r => <li key={r.label} className={cn('flex items-center gap-1.5', r.met ? 'text-teal' : 'text-ink/70')}>{r.met ? <Check size={13} aria-label="Done" /> : <X size={13} aria-label="Not yet" className="text-danger" />}<span>{r.label}</span></li>)}</ul>
        {next && <SmallButton className="mt-2 w-full bg-teal text-paper" disabled={!ready} onClick={() => action(restaurant.unlockZone(id))}><LockKeyhole size={15} />{ready ? `Reach ${info.name} · ${money(price)}` : 'Not ready yet'}</SmallButton>}
      </div>;
    })}
    <OceanCard onOcean={onOcean} />
  </section>;
}
/** The chapter after the Abyss: found a new colony on the Ocean map. */
function OceanCard({ onOcean }: { onOcean?: () => void }) {
  const state = restaurant.state, colony = currentColony(state.ocean), abyss = hasZone(state.town, 'abyss');
  if (!onOcean) return null;
  return <div role="group" aria-label="The Ocean" className={cn('rounded-2xl border p-3', abyss ? 'border-gold/60 bg-gold/10' : 'border-ink/10 bg-ink/[.03]')}>
    <h4 className="flex items-center gap-1.5 font-display text-lg leading-tight"><Compass size={16} className="text-teal" aria-hidden="true" />The Ocean</h4>
    <p className="mt-0.5 text-[11px] text-ink/65">Colony {state.ocean.colonies.length}: {colony.name} · {BIOMES[restaurant.region().biome].name} · {state.ocean.fame} fame</p>
    <p className="mt-1 text-[11px] font-bold">{abyss ? 'You reached the Abyss. Found a new colony to start a new chapter with more fame.' : `After the Abyss, found a new colony in another region of the Ocean. Reaching it here earns +${pendingFame(state.ocean)} fame.`}</p>
    <SmallButton className={cn('mt-2 w-full', abyss && 'bg-tomato text-paper')} onClick={onOcean}><Compass size={15} />{abyss ? 'Choose a new colony' : 'View the Ocean map'}</SmallButton>
  </div>;
}

/** Town management: unlock plots, choose buildings, upgrade them and speed up construction. */
export function TownPanel({ selected, onSelect, onEnterRestaurant, onShop, onOcean, action }: { selected: PlotRef | null; onSelect: (plot: PlotRef | null) => void; onEnterRestaurant: () => void; onShop: () => void; onOcean?: () => void; action: Action }) {
  const now = useNow(), state = restaurant.state, town = state.town, plot = selected && plotAt(town, selected.x, selected.z);
  const busy = busyBuilders(town) >= town.builders, reserve = restaurant.operatingCost() + 30;
  const afterSpend = (cost: number) => state.cash - cost < reserve ? <p className="mt-1 text-[11px] font-bold text-danger">Leaves {money(state.cash - cost)}, below the {money(reserve)} needed to reopen.</p> : null;
  const summary = <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
    <div className="rounded-xl bg-ink/[.06] p-2"><Hammer size={15} className="mx-auto mb-0.5 text-teal" aria-hidden="true" />Builders {busyBuilders(town)}/{town.builders}</div>
    <div className="rounded-xl bg-ink/[.06] p-2"><Waves size={15} className="mx-auto mb-0.5 text-teal" aria-hidden="true" />{town.charms.current} × 15m · {town.charms.tide} × 1h</div>
    <button type="button" onClick={onShop} className="rounded-xl bg-violet/15 p-2 hover:bg-violet/25"><Gem size={15} className="mx-auto mb-0.5 text-violet" aria-hidden="true" />{town.pearls} pearls</button>
  </div>;
  if (!plot) {
    const list = town.plots.filter(p => p.owned || canUnlock(town, p)).sort((a, b) => Number(Boolean(b.building)) - Number(Boolean(a.building)) || Number(b.owned) - Number(a.owned));
    return <section aria-label="Town plots">{summary}
      <p className="mb-3 text-xs leading-relaxed text-ink/65">Unlock plots next to your town and choose what to build. What you build, and where, shapes how your restaurant grows.</p>
      <ZoneSection action={action} onOcean={onOcean} />
      <h3 className="mb-2 text-lg">Plots</h3>
      <div className="space-y-2">{list.map(p => <button type="button" key={`${p.x},${p.z}`} data-tutorial={!p.owned ? 'plot-locked' : p.job ? 'plot-busy' : p.building ? undefined : 'plot-empty'} onClick={() => onSelect(p)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-ink/10 bg-ink/[.06] px-3 text-left text-sm font-bold hover:bg-ink/10">
        {p.owned ? p.job ? <Clock size={17} className="shrink-0 text-gold" aria-hidden="true" /> : <MapPin size={17} className="shrink-0 text-teal" aria-hidden="true" /> : <LockKeyhole size={17} className="shrink-0 text-ink/60" aria-hidden="true" />}
        <span className="min-w-0 flex-1">{plotLabel(town, p, now)}</span></button>)}</div>
    </section>;
  }
  const back = <button type="button" onClick={() => onSelect(null)} className="mb-2 flex min-h-11 items-center gap-1.5 text-xs font-extrabold text-teal"><ArrowLeft size={15} aria-hidden="true" />All plots</button>;
  if (!plot.owned) {
    const cost = restaurant.plotPrice(), open = canUnlock(town, plot), reason = plotLockReason(town, plot), zone = ZONES[plotZone(plot)];
    return <section aria-label="Locked plot">{back}{summary}<h3 className="text-xl">Wild seabed</h3><p className="text-xs text-ink/60">{zone.name}</p>
      {open ? <><p className="my-2 text-xs text-ink/65">Claim this plot for your town. Each new plot costs more than the last.</p>{afterSpend(cost)}<SmallButton tutorial="unlock-plot" className="mt-2 w-full bg-teal text-paper" disabled={state.cash < cost} onClick={() => action(restaurant.unlockPlot(plot.x, plot.z))}><LockKeyhole size={16} />{state.cash < cost ? `Need ${money(cost - state.cash)} more` : `Unlock · ${money(cost)}`}</SmallButton></>
        : <Notice>{reason}{hasZone(town, plotZone(plot)) ? ' Plots grow outward from your restaurant.' : ' See Depth zones under All plots.'}</Notice>}
    </section>;
  }
  if (!plot.building) return <section aria-label="Empty plot">{back}{summary}<h3 className="text-xl">Choose a building</h3>
    {busy && <Notice>Your builder is busy. Wait, speed it up with a charm, or <button type="button" className="font-extrabold text-teal underline" onClick={onShop}>hire a second builder</button>.</Notice>}
    <div className="mt-3 space-y-3">{BUILDABLE.map(kind => {
      const info = BUILDINGS[kind], price = restaurant.buildPrice(kind), affordable = state.cash >= price, bonus = (kind === 'kelpFarm' || kind === 'fishery' || kind === 'garden') && nextToKind(town, plot, 'restaurant');
      return <div key={kind} className="rounded-2xl border border-ink/10 bg-ink/[.06] p-3">
        <div className="flex items-start justify-between gap-2"><div><h4 className="font-display text-lg leading-tight">{info.name}</h4><p className="mt-0.5 text-[11px] text-ink/65">{info.description}</p></div><span className="font-display text-lg tabular-nums text-teal">{money(price)}</span></div>
        <p className="mt-1.5 text-[11px] font-bold text-teal">{effectText(town, plot, kind, 1)}</p>
        {info.adjacency && <p className={cn('mt-1 flex items-center gap-1 text-[11px]', bonus ? 'font-bold text-gold' : 'text-ink/55')}><Sparkles size={12} aria-hidden="true" />{bonus ? 'Neighbour bonus active here. ' : ''}{info.adjacency}</p>}
        <SmallButton tutorial="build-building" className="mt-2 w-full" disabled={!affordable || busy} onClick={() => action(restaurant.build(plot.x, plot.z, kind))}><Hammer size={15} />{!affordable ? `Need ${money(price - state.cash)} more` : `Build · ${formatDuration(jobSeconds(town, kind, 1) * 1000)}`}</SmallButton>
      </div>;
    })}</div></section>;
  const kind = plot.building, info = BUILDINGS[kind], job = plot.job, next = plot.level + 1, cost = restaurant.upgradePrice(kind, next);
  return <section aria-label={info.name}>{back}{summary}
    <div className="flex items-start justify-between gap-2"><div><h3 className="text-xl leading-tight">{info.name}</h3><p className="text-xs text-ink/60">{info.looks[lookFor(plot.level) - 1]} · Level {plot.level} of {MAX_LEVEL}</p></div>
      {kind === 'restaurant' && <SmallButton className="shrink-0" onClick={onEnterRestaurant}><Store size={15} />Enter</SmallButton>}</div>
    <p className="mt-2 text-xs font-bold text-teal">{job?.kind === 'build' ? 'Ready when built: ' : 'Now: '}{effectText(town, plot, kind, plot.level)}</p>
    {info.adjacency && <p className="mt-1 text-[11px] text-ink/55">{info.adjacency}</p>}
    {job ? <div className="mt-3 rounded-2xl border border-gold/40 bg-gold/10 p-3" data-testid="construction">
      <div className="flex items-center justify-between text-sm font-extrabold"><span>{job.kind === 'build' ? 'Building' : `Upgrading to level ${next}`}</span><span className="tabular-nums">{formatDuration(job.endsAt - now)}</span></div>
      <progress className="mt-2" aria-label="Construction progress" value={Math.min(1, (now - job.startedAt) / Math.max(1, job.endsAt - job.startedAt))} max={1} />
      <div className="mt-3 grid grid-cols-2 gap-2">{(['current', 'tide'] as const).map(charm => <SmallButton key={charm} tutorial={charm === 'current' ? 'use-current' : undefined} className="flex-col gap-0 py-1.5 text-xs" disabled={town.charms[charm] < 1} onClick={() => action(restaurant.useCharm(plot.x, plot.z, charm))}><span className="flex items-center gap-1"><Waves size={14} />{CHARMS[charm].name}</span><span className="text-[10px] text-ink/60">−{charm === 'current' ? '15 min' : '1 hour'} · you have {town.charms[charm]}</span></SmallButton>)}</div>
      <SmallButton className="mt-2 w-full border-violet/40 bg-violet/15" disabled={town.pearls < finishCost(job, now)} onClick={() => action(restaurant.finishNow(plot.x, plot.z))}><Zap size={15} />Finish now · {finishCost(job, now)} {finishCost(job, now) === 1 ? 'pearl' : 'pearls'}</SmallButton>
      {town.pearls < finishCost(job, now) && <button type="button" onClick={onShop} className="mt-1 w-full text-center text-[11px] font-bold text-teal underline">Get pearls in the shop</button>}
    </div>
    : plot.level >= MAX_LEVEL ? <Notice>Fully upgraded. A true reef landmark.</Notice>
    : <div className="mt-3 rounded-2xl border border-ink/10 bg-ink/[.06] p-3">
      <div className="flex items-center justify-between"><h4 className="font-display text-lg">Upgrade to level {next}</h4><span className="font-display text-lg tabular-nums text-teal">{money(cost)}</span></div>
      <p className="text-[11px] font-bold text-teal">{effectText(town, plot, kind, next)}</p>
      {lookFor(next) !== lookFor(plot.level) && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-gold"><Sparkles size={12} aria-hidden="true" />New look: {info.looks[lookFor(next) - 1]}</p>}
      {busy && <p className="mt-1 text-[11px] text-ink/60">Your builder is busy with another job.</p>}
      {afterSpend(cost)}
      <SmallButton className="mt-2 w-full" disabled={state.cash < cost || busy} onClick={() => action(restaurant.upgrade(plot.x, plot.z))}><Clock size={15} />{state.cash < cost ? `Need ${money(cost - state.cash)} more` : `Upgrade · ${formatDuration(jobSeconds(town, kind, next) * 1000)}`}</SmallButton>
    </div>}
  </section>;
}
