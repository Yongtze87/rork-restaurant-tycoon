import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Clock, Gem, Hammer, LockKeyhole, MapPin, MapPinned, Mountain, Sparkles, Star, Store, Waves, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { BUILDINGS, CHARMS, MAX_LEVEL, branchIn, buildableAt, busyBuilders, canUnlock, effectText, finishCost, lookFor, nextToHub, ownedCount, plotAt, plotLockReason, plotModifiers, plotRegion, plotZone, plotsIn, type BuildingKind, type Plot, type Town } from './town';
import { BIOMES, HOME_ID, claimableRegions, describeModifiers, fameText, masteryKey, masterySteps, regionById, regionStatus, type BoostKind } from './ocean';
import { ZONES, ZONE_IDS, ZONE_ARRIVAL_BONUS, hasZone, previousZone, zoneRequirements } from './zones';
import { DISHES, DISH_IDS } from './types';
import { REGION_SIZE, inHome, regionCenter } from './world';
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
function plotLabel(plot: Plot, now: number): string {
  if (plot.building) return `${BUILDINGS[plot.building].name} · ${plot.job ? `${plot.job.kind === 'build' ? 'building' : `to Lv ${plot.level + 1}`} · ${formatDuration(plot.job.endsAt - now)}` : `Lv ${plot.level}`}`;
  if (plot.owned) return 'Empty plot · choose a building';
  return `Unlock plot · ${money(restaurant.plotPrice(plot.x, plot.z))}`;
}
const regionName = (plot: Pick<Plot, 'x' | 'z'>) => regionById(plotRegion(plot))!.name;
function Stars({ n, label }: { n: number; label?: string }) {
  return <span className="inline-flex" aria-label={label} role={label ? 'img' : undefined} aria-hidden={label ? undefined : true}>{[1, 2, 3, 4, 5].map(i => <Star key={i} size={11} className={i <= n ? 'fill-gold text-gold' : 'text-ink/25'} />)}</span>;
}

/** Depth zones: what each one needs, with progress, and the button for the next one. */
function ZoneSection({ action }: { action: Action }) {
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
        <p className="mt-1 text-[11px] font-bold text-teal">New dishes: {dishes} · guests arrive {Math.round(ZONE_ARRIVAL_BONUS * 100)}% more often{id === 'reef' ? ' · claim the first ring of regions' : id === 'twilight' ? ' · claim a second ring' : ' · claim the open ocean'}</p>
        <ul className="mt-2 space-y-1 text-[11px]">{requirements.map(r => <li key={r.label} className={cn('flex items-center gap-1.5', r.met ? 'text-teal' : 'text-ink/70')}>{r.met ? <Check size={13} aria-label="Done" /> : <X size={13} aria-label="Not yet" className="text-danger" />}<span>{r.label}</span></li>)}</ul>
        {next && <SmallButton className="mt-2 w-full bg-teal text-paper" disabled={!ready} onClick={() => action(restaurant.unlockZone(id))}><LockKeyhole size={15} />{ready ? `Reach ${info.name} · ${money(price)}` : 'Not ready yet'}</SmallButton>}
      </div>;
    })}
  </section>;
}

/** Claimed regions with their branch income, and the regions that can be claimed next with their price. */
function RegionsSection({ onRegion }: { onRegion: (id: string) => void }) {
  const state = restaurant.state, ocean = state.ocean, claimable = claimableRegions(ocean);
  return <section aria-label="Regions" className="mb-4 space-y-2">
    <h3 className="flex items-center gap-1.5 text-lg"><MapPinned size={17} className="text-teal" aria-hidden="true" />Regions</h3>
    <p className="text-[11px] text-ink/65"><span className="font-extrabold text-gold">{ocean.fame} fame</span>{ocean.fame ? ` · ${fameText(restaurant.fameBonuses())}` : ' · Claim regions and grow their branches to earn fame: lasting bonuses for everything.'}</p>
    {ocean.regions.map(id => {
      const region = regionById(id)!, branch = branchIn(state.town, id), income = branch ? restaurant.branchIncomeAt(branch.x, branch.z) : 0;
      return <button type="button" key={id} onClick={() => onRegion(id)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-teal/30 bg-teal/10 px-3 text-left text-sm font-bold hover:bg-teal/15">
        <Check size={16} className="shrink-0 text-teal" aria-hidden="true" /><span className="min-w-0 flex-1">{region.name}<span className="block text-[11px] font-semibold text-ink/60">{BIOMES[region.biome].name} · {branch ? `Branch Lv ${branch.level}${branch.job?.kind === 'build' ? ' (building)' : ''}` : 'No branch yet'}</span></span>
        <span className="shrink-0 text-xs font-extrabold tabular-nums text-gold">{income ? `${money(income)}/day` : ''}</span></button>;
    })}
    {claimable.map(region => {
      const error = restaurant.claimError(region.id), gate = error?.startsWith('Reach') ? error.replace(/ at home.*$/, '').replace(/^Reach/, 'After') : null;
      return <button type="button" key={region.id} onClick={() => onRegion(region.id)} aria-label={`${region.name}, ${BIOMES[region.biome].name}, ${region.stars} of 5 stars, ${gate ?? `claim for ${money(restaurant.claimPrice(region.id))}`}`} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-dashed border-ink/25 bg-ink/[.04] px-3 text-left text-sm font-bold hover:bg-ink/10">
        <LockKeyhole size={16} className="shrink-0 text-ink/55" aria-hidden="true" /><span className="min-w-0 flex-1">{region.name}<span className="flex items-center gap-1 text-[11px] font-semibold text-ink/60"><Stars n={region.stars} />{BIOMES[region.biome].name}</span></span>
        <span className={cn('shrink-0 text-right text-xs font-extrabold tabular-nums', gate ? 'text-ink/55' : 'text-teal')}>{gate ?? money(restaurant.claimPrice(region.id))}</span></button>;
    })}
  </section>;
}

/** One region's details: what it does, what it is good for, its price or progress, and the fame it pays. */
function RegionDetails({ id, back, onSelect, action, summary }: { id: string; back: ReactNode; onSelect: (plot: PlotRef) => void; action: Action; summary: ReactNode }) {
  const state = restaurant.state, region = regionById(id)!, status = regionStatus(state.ocean, id), effects = describeModifiers(region.modifiers);
  const error = status === 'claimable' ? restaurant.claimError(id) : null, price = restaurant.claimPrice(id), info = BIOMES[region.biome];
  const branch = branchIn(state.town, id), owned = status === 'claimed' ? ownedCount(state.town, id) : 0, steps = masterySteps(region);
  return <section aria-label="Region details">{back}{summary}
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-xl leading-tight">{region.name}</h3><p className="text-xs text-ink/60">{info.name} · {status === 'claimed' ? 'your region' : status === 'claimable' ? 'can be claimed' : 'unexplored'}</p></div>
      <p className="flex items-center gap-1.5 text-xs font-extrabold"><Stars n={region.stars} label={`Difficulty ${region.stars} of 5`} /><span className="text-ink/60">Difficulty</span></p></div>
    <p className="mt-1 text-xs text-ink/65">{info.description}</p>
    <p className="mt-2 rounded-xl bg-teal/10 p-2 text-[11px] font-bold"><span className="text-teal">Good for: </span>{info.goodFor}</p>
    <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-1">
      <ul aria-label="Upsides" className="space-y-0.5">{effects.upsides.map(t => <li key={t} className="flex items-center gap-1.5 font-bold text-teal"><Check size={13} aria-hidden="true" />{t}</li>)}</ul>
      <ul aria-label="Downsides" className="space-y-0.5">{effects.downsides.map(t => <li key={t} className="flex items-center gap-1.5 font-bold text-danger"><X size={13} aria-hidden="true" />{t}</li>)}</ul>
    </div>
    <p className="mt-1 text-[10px] text-ink/55">These apply only to plots and buildings in {region.name}. Town-wide limits still apply.</p>
    {status === 'claimable' && <div className="mt-3 rounded-2xl border border-teal/40 bg-ink/[.06] p-3">
      <div className="flex items-center justify-between gap-2"><h4 className="font-display text-lg">Claim {region.name}</h4><span className="font-display text-lg tabular-nums text-teal">{money(price)}</span></div>
      <p className="text-[11px] text-ink/65">Its {REGION_SIZE * REGION_SIZE} plots join your world here, with the middle plot ready for a branch restaurant. Everything you built stays.</p>
      <p className="mt-1 text-[11px] font-bold text-gold">Claiming earns +{steps[0].fame} fame · {region.fame} fame in all for mastering it</p>
      <SmallButton className="mt-2 w-full bg-tomato text-paper" disabled={Boolean(error)} onClick={() => action(restaurant.claimRegion(id))}><MapPinned size={15} />{error ? 'Not yet' : `Claim · ${money(price)}`}</SmallButton>
      {error && <p className="mt-1 text-[11px] font-bold text-danger">{error}</p>}
    </div>}
    {status === 'claimed' && <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2 text-center text-[11px] font-bold">
        <div className="rounded-xl bg-ink/[.06] p-2"><p className="font-display text-lg tabular-nums">{owned}/{REGION_SIZE * REGION_SIZE}</p>plots owned</div>
        <div className="rounded-xl bg-gold/15 p-2"><p className="font-display text-lg tabular-nums">{branch ? money(restaurant.branchIncomeAt(branch.x, branch.z)) : '—'}</p>branch income per day</div>
      </div>
      <SmallButton className="w-full" onClick={() => onSelect(branch ?? regionCenter(region.x, region.y))}><Store size={15} />{branch ? `Branch restaurant · Lv ${branch.level}` : 'Build a branch restaurant'}</SmallButton>
    </div>}
    {status !== 'fog' && <div className="mt-3" aria-label="Fame milestones" role="group">
      <h4 className="flex items-center gap-1.5 font-display text-base"><Sparkles size={14} className="text-gold" aria-hidden="true" />Fame for mastering {region.name}</h4>
      <ul className="mt-1 space-y-1 text-[11px]">{steps.map(step => { const done = state.ocean.mastery.includes(masteryKey(id, step.kind)); return <li key={step.kind} className={cn('flex items-center gap-1.5', done ? 'font-bold text-teal' : 'text-ink/70')}>{done ? <Check size={13} aria-label="Done" /> : <span className="size-[13px] shrink-0 rounded-full border border-ink/30" aria-label="Not yet" />}<span className="min-w-0 flex-1">{step.label}</span><span className="font-extrabold text-gold">+{step.fame}</span></li>; })}</ul>
    </div>}
  </section>;
}

/** Plots of one region: owned and unlockable ones, buildings first. */
function plotGroup(town: Town, id: string): Plot[] {
  const list = id === HOME_ID ? town.plots.filter(inHome) : plotsIn(town, id);
  return list.filter(p => p.owned || canUnlock(town, p)).sort((a, b) => Number(Boolean(b.building)) - Number(Boolean(a.building)) || Number(b.owned) - Number(a.owned));
}
/** A specialisation note for a building kind on a plot, e.g. "Kelp forest: 50% stronger here". */
function boostNote(plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind): string | null {
  const boost = inHome(plot) ? 1 : plotModifiers(plot).boost[kind as BoostKind] ?? 1;
  return boost > 1 ? `${BIOMES[regionById(plotRegion(plot))!.biome].name}: ${Math.round((boost - 1) * 100)}% stronger here` : null;
}

/** Town management across the world: unlock plots, choose buildings, upgrade them, claim regions and speed up construction. */
export function TownPanel({ selected, onSelect, region, onRegion, onEnterRestaurant, onShop, action }: { selected: PlotRef | null; onSelect: (plot: PlotRef | null) => void; region?: string | null; onRegion?: (id: string | null) => void; onEnterRestaurant: () => void; onShop: () => void; action: Action }) {
  const now = useNow(), state = restaurant.state, town = state.town, plot = selected && plotAt(town, selected.x, selected.z), fame = restaurant.fameBonuses();
  const busy = busyBuilders(town) >= town.builders, reserve = restaurant.operatingCost() + 30;
  const afterSpend = (cost: number) => state.cash - cost < reserve ? <p className="mt-1 text-[11px] font-bold text-danger">Leaves {money(state.cash - cost)}, below the {money(reserve)} needed to reopen.</p> : null;
  const summary = <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
    <div className="rounded-xl bg-ink/[.06] p-2"><Hammer size={15} className="mx-auto mb-0.5 text-teal" aria-hidden="true" />Builders {busyBuilders(town)}/{town.builders}</div>
    <div className="rounded-xl bg-ink/[.06] p-2"><Waves size={15} className="mx-auto mb-0.5 text-teal" aria-hidden="true" />{town.charms.current} × 15m · {town.charms.tide} × 1h</div>
    <button type="button" onClick={onShop} className="rounded-xl bg-violet/15 p-2 hover:bg-violet/25"><Gem size={15} className="mx-auto mb-0.5 text-violet" aria-hidden="true" />{town.pearls} pearls</button>
  </div>;
  const back = <button type="button" onClick={() => { onSelect(null); onRegion?.(null); }} className="mb-2 flex min-h-11 items-center gap-1.5 text-xs font-extrabold text-teal"><ArrowLeft size={15} aria-hidden="true" />All plots</button>;
  const select = (next: PlotRef) => { onRegion?.(null); onSelect(next); };
  if (!plot && region && regionById(region)) return <RegionDetails id={region} back={back} onSelect={select} action={action} summary={summary} />;
  if (!plot) {
    const groups = [HOME_ID, ...state.ocean.regions].map(id => ({ id, name: regionById(id)!.name, plots: plotGroup(town, id) }));
    return <section aria-label="Town plots">{summary}
      <p className="mb-3 text-xs leading-relaxed text-ink/65">Unlock plots next to your town and choose what to build. Claim ocean regions around it to grow your world. What you build, and where, shapes how your restaurant grows.</p>
      <ZoneSection action={action} />
      {onRegion && <RegionsSection onRegion={onRegion} />}
      <h3 className="mb-2 text-lg">Plots</h3>
      {groups.map(group => <div key={group.id} role="group" aria-label={`${group.name} plots`} className="mb-3">
        {groups.length > 1 && <h4 className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-ink/55">{group.name}</h4>}
        <div className="space-y-2">{group.plots.map(p => <button type="button" key={`${p.x},${p.z}`} data-tutorial={!p.owned ? 'plot-locked' : p.job ? 'plot-busy' : p.building ? undefined : 'plot-empty'} onClick={() => select(p)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-ink/10 bg-ink/[.06] px-3 text-left text-sm font-bold hover:bg-ink/10">
          {p.owned ? p.job ? <Clock size={17} className="shrink-0 text-gold" aria-hidden="true" /> : <MapPin size={17} className="shrink-0 text-teal" aria-hidden="true" /> : <LockKeyhole size={17} className="shrink-0 text-ink/60" aria-hidden="true" />}
          <span className="min-w-0 flex-1">{plotLabel(p, now)}</span></button>)}</div>
      </div>)}
    </section>;
  }
  const where = inHome(plot) ? null : <p className="text-[11px] font-bold text-teal">{regionName(plot)} · {BIOMES[regionById(plotRegion(plot))!.biome].name}{onRegion && <button type="button" className="ml-1.5 underline" onClick={() => { onSelect(null); onRegion(plotRegion(plot)); }}>Region details</button>}</p>;
  if (!plot.owned) {
    const cost = restaurant.plotPrice(plot.x, plot.z), open = canUnlock(town, plot), reason = plotLockReason(town, plot), zone = ZONES[plotZone(plot)];
    return <section aria-label="Locked plot">{back}{summary}<h3 className="text-xl">Wild seabed</h3><p className="text-xs text-ink/60">{inHome(plot) ? zone.name : regionName(plot)}</p>{where}
      {open ? <><p className="my-2 text-xs text-ink/65">Claim this plot for your town. Each new plot in a region costs more than the last.</p>{afterSpend(cost)}<SmallButton tutorial="unlock-plot" className="mt-2 w-full bg-teal text-paper" disabled={state.cash < cost} onClick={() => action(restaurant.unlockPlot(plot.x, plot.z))}><LockKeyhole size={16} />{state.cash < cost ? `Need ${money(cost - state.cash)} more` : `Unlock · ${money(cost)}`}</SmallButton></>
        : <Notice>{reason}{!inHome(plot) || hasZone(town, plotZone(plot)) ? ' Plots grow outward from the ones you own.' : ' See Depth zones under All plots.'}</Notice>}
    </section>;
  }
  if (!plot.building) return <section aria-label="Empty plot">{back}{summary}<h3 className="text-xl">Choose a building</h3>{where}
    {busy && <Notice>Your builder is busy. Wait, speed it up with a charm, or <button type="button" className="font-extrabold text-teal underline" onClick={onShop}>hire a second builder</button>.</Notice>}
    <div className="mt-3 space-y-3">{buildableAt(town, plot).map(kind => {
      const info = BUILDINGS[kind], price = restaurant.buildPrice(kind, plot.x, plot.z), affordable = state.cash >= price, bonus = (kind === 'kelpFarm' || kind === 'fishery' || kind === 'garden') && nextToHub(town, plot), special = boostNote(plot, kind);
      return <div key={kind} className={cn('rounded-2xl border p-3', kind === 'branch' ? 'border-gold/50 bg-gold/10' : 'border-ink/10 bg-ink/[.06]')}>
        <div className="flex items-start justify-between gap-2"><div><h4 className="font-display text-lg leading-tight">{info.name}</h4><p className="mt-0.5 text-[11px] text-ink/65">{info.description}</p></div><span className="font-display text-lg tabular-nums text-teal">{money(price)}</span></div>
        <p className="mt-1.5 text-[11px] font-bold text-teal">{effectText(town, plot, kind, 1, fame.branch)}</p>
        {special && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-gold"><Sparkles size={12} aria-hidden="true" />{special}</p>}
        {info.adjacency && <p className={cn('mt-1 flex items-center gap-1 text-[11px]', bonus ? 'font-bold text-gold' : 'text-ink/55')}><Sparkles size={12} aria-hidden="true" />{bonus ? 'Neighbour bonus active here. ' : ''}{info.adjacency}</p>}
        <SmallButton tutorial="build-building" className="mt-2 w-full" disabled={!affordable || busy} onClick={() => action(restaurant.build(plot.x, plot.z, kind))}><Hammer size={15} />{!affordable ? `Need ${money(price - state.cash)} more` : `Build · ${formatDuration(restaurant.jobSeconds(kind, 1, plot.x, plot.z) * 1000)}`}</SmallButton>
      </div>;
    })}</div></section>;
  const kind = plot.building, info = BUILDINGS[kind], job = plot.job, next = plot.level + 1, cost = restaurant.upgradePrice(kind, next, plot.x, plot.z), special = boostNote(plot, kind);
  return <section aria-label={info.name}>{back}{summary}
    <div className="flex items-start justify-between gap-2"><div><h3 className="text-xl leading-tight">{info.name}</h3><p className="text-xs text-ink/60">{info.looks[lookFor(plot.level) - 1]} · Level {plot.level} of {MAX_LEVEL}</p>{where}</div>
      {kind === 'restaurant' && <SmallButton className="shrink-0" onClick={onEnterRestaurant}><Store size={15} />Enter</SmallButton>}</div>
    {kind === 'branch' && <p data-testid="branch-income" className="mt-2 rounded-xl bg-gold/15 p-2 text-xs font-extrabold">{job?.kind === 'build' ? `Opens when built: ${money(restaurant.branchIncomeAt(plot.x, plot.z, 1))} per service day` : `Earns ${money(restaurant.branchIncomeAt(plot.x, plot.z))} per service day`}<span className="block text-[11px] font-semibold text-ink/65">Paid at every closing, also while you are away. Shown as “Branch income” on your receipts.</span></p>}
    <p className="mt-2 text-xs font-bold text-teal">{job?.kind === 'build' ? 'Ready when built: ' : 'Now: '}{effectText(town, plot, kind, plot.level, fame.branch)}</p>
    {special && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-gold"><Sparkles size={12} aria-hidden="true" />{special}</p>}
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
      <p className="text-[11px] font-bold text-teal">{effectText(town, plot, kind, next, fame.branch)}</p>
      {lookFor(next) !== lookFor(plot.level) && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-gold"><Sparkles size={12} aria-hidden="true" />New look: {info.looks[lookFor(next) - 1]}</p>}
      {busy && <p className="mt-1 text-[11px] text-ink/60">Your builder is busy with another job.</p>}
      {afterSpend(cost)}
      <SmallButton className="mt-2 w-full" disabled={state.cash < cost || busy} onClick={() => action(restaurant.upgrade(plot.x, plot.z))}><Clock size={15} />{state.cash < cost ? `Need ${money(cost - state.cash)} more` : `Upgrade · ${formatDuration(restaurant.jobSeconds(kind, next, plot.x, plot.z) * 1000)}`}</SmallButton>
    </div>}
  </section>;
}
