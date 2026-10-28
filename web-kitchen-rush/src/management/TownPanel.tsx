import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Clock, Gem, Hammer, List, LockKeyhole, MapPin, MapPinned, Move, RotateCw, Route, Sparkles, Star, Store, Waves, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { BUILDINGS, CHARMS, MAX_LEVEL, PARCEL, branchIn, buildableAt, buildingAt, buildingPlot, buildingsIn, busyBuilders, canUnlock, connected, effectText, finishCost, footprint, isRoad, lookFor, nearHub, network, ownedCount, parcelOf, plotAt, plotLockReason, plotModifiers, plotOfTile, plotRegion, plotZone, plotsIn, roadError, tileKey, type Building, type BuildingKind, type Plot, type Spot, type Town } from './town';
import { BIOMES, HOME_ID, claimableRegions, describeModifiers, fameText, masteryKey, masterySteps, regionById, regionStatus, type BoostKind } from './ocean';
import { ZONES, ZONE_IDS, ZONE_ARRIVAL_BONUS, hasZone, previousZone, zoneRequirements } from './zones';
import { DISHES, DISH_IDS } from './types';
import { REGION_SIZE, inHome, regionCenter } from './world';
import { formatDuration } from './iso/town-render';
import { money } from './format';
import { guardSpend } from './spend-guard';
import { Notice, SmallButton, type Action } from './Panels';
import { Info } from './GameWindow';
import { draftAt, hasBuilding, onNetwork, plotTile, type TileRef, type TownDraft } from './town-draft';

export type { TileRef, TownDraft };

/** Re-render once a second so construction timers count down. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  return now;
}
function buildingLabel(b: Building, now: number): string {
  return `${BUILDINGS[b.kind].name} · ${b.job ? `${b.job.kind === 'build' ? 'building' : `to Lv ${b.level + 1}`} · ${formatDuration(b.job.endsAt - now)}` : `Lv ${b.level}`}`;
}
const plotLabel = (plot: Plot): string => plot.owned ? 'Empty plot' : `Unlock plot · ${money(restaurant.plotPrice(plot.x, plot.z))}`;
const regionName = (plot: Pick<Plot, 'x' | 'z'>) => regionById(plotRegion(plot))!.name;
function Stars({ n, label }: { n: number; label?: string }) {
  return <span className="inline-flex" aria-label={label} role={label ? 'img' : undefined} aria-hidden={label ? undefined : true}>{[1, 2, 3, 4, 5].map(i => <Star key={i} size={11} className={i <= n ? 'fill-gold text-gold' : 'text-ink/25'} />)}</span>;
}

/** Depth zones: what each one needs, with progress, and the button for the next one. */
function ZoneSection({ action }: { action: Action }) {
  const state = restaurant.state, town = state.town;
  return <section aria-label="Depth zones" className="space-y-2">
    <h3 className="sr-only">Depth zones</h3>
    {ZONE_IDS.map(id => {
      const info = ZONES[id], reached = hasZone(town, id), prev = previousZone(id), next = !reached && (!prev || hasZone(town, prev));
      const dishes = DISH_IDS.filter(dish => DISHES[dish].zone === id).map(dish => DISHES[dish].name).join(' · ');
      if (reached) return <div key={id} className="flex min-h-11 items-center gap-2 rounded-xl bg-teal/10 px-3 text-sm font-bold"><Check size={16} className="shrink-0 text-teal" aria-hidden="true" /><span className="min-w-0 flex-1">{info.name}</span><span className="text-[11px] font-extrabold text-teal">Reached</span></div>;
      const price = restaurant.zonePrice(id), requirements = zoneRequirements(state, id, price), ready = requirements.every(r => r.met);
      return <div key={id} aria-label={info.name} role="group" className={cn('rounded-2xl border p-3', next ? 'border-teal/40 bg-ink/[.06]' : 'border-ink/10 bg-ink/[.03] opacity-70')}>
        <div className="flex items-start justify-between gap-2"><h4 className="font-display text-base leading-tight">{info.name}</h4><span className="font-display text-base tabular-nums text-teal">{money(price)}</span></div>
        <p className="mt-0.5 text-[11px] font-bold text-teal" title={info.description}>New dishes: {dishes} · guests arrive {Math.round(ZONE_ARRIVAL_BONUS * 100)}% more often{id === 'reef' ? ' · claim the first ring of regions' : id === 'twilight' ? ' · claim a second ring' : ' · claim the open ocean'}</p>
        <ul className="mt-2 space-y-1 text-[11px]">{requirements.map(r => <li key={r.label} className={cn('flex items-center gap-1.5', r.met ? 'text-teal' : 'text-ink/70')}>{r.met ? <Check size={13} aria-label="Done" /> : <X size={13} aria-label="Not yet" className="text-danger" />}<span>{r.label}</span></li>)}</ul>
        {next && <SmallButton className="mt-2 w-full bg-teal text-paper" disabled={!ready} onClick={() => action(restaurant.unlockZone(id))}><LockKeyhole size={15} />{ready ? `Reach ${info.name} · ${money(price)}` : 'Not ready yet'}</SmallButton>}
      </div>;
    })}
  </section>;
}

/** Claimed regions with their branch income, and the regions that can be claimed next with their price. */
function RegionsSection({ onRegion }: { onRegion: (id: string) => void }) {
  const state = restaurant.state, ocean = state.ocean, claimable = claimableRegions(ocean);
  return <section aria-label="Regions" className="space-y-2">
    <h3 className="sr-only">Regions</h3>
    <p className="text-[11px] text-ink/65"><span className="font-extrabold text-gold">{ocean.fame} fame</span>{ocean.fame ? ` · ${fameText(restaurant.fameBonuses())}` : ' · Claim regions and grow their branches to earn fame: lasting bonuses for everything.'}</p>
    {ocean.regions.map(id => {
      const region = regionById(id)!, branch = branchIn(state.town, id), income = branch ? restaurant.branchIncomeAt(branch) : 0;
      return <button type="button" key={id} onClick={() => onRegion(id)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-teal/30 bg-teal/10 px-3 text-left text-sm font-bold hover:bg-teal/15">
        <Check size={16} className="shrink-0 text-teal" aria-hidden="true" /><span className="min-w-0 flex-1">{region.name}<span className="block text-[11px] font-semibold text-ink/60">{BIOMES[region.biome].name} · {branch ? `Branch Lv ${branch.level}${branch.job?.kind === 'build' ? ' (building)' : ''}` : 'No branch yet'}</span></span>
        <span className="shrink-0 text-xs font-extrabold tabular-nums text-gold">{income ? `${money(income)}/shift` : ''}</span></button>;
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
function RegionDetails({ id, back, onSelect, action, summary }: { id: string; back: ReactNode; onSelect: (tile: TileRef) => void; action: Action; summary: ReactNode }) {
  const state = restaurant.state, region = regionById(id)!, status = regionStatus(state.ocean, id), effects = describeModifiers(region.modifiers);
  const error = status === 'claimable' ? restaurant.claimError(id) : null, price = restaurant.claimPrice(id), info = BIOMES[region.biome];
  const branch = branchIn(state.town, id), owned = status === 'claimed' ? ownedCount(state.town, id) : 0, steps = masterySteps(region);
  void summary;
  return <section aria-label="Region details">
    <div className="flex items-center gap-2">{back}<div className="min-w-0 flex-1"><h3 className="truncate font-display text-base leading-tight">{region.name}</h3><p className="flex items-center gap-1.5 text-[11px] text-ink/60">{info.name} · {status === 'claimed' ? 'yours' : status === 'claimable' ? 'can be claimed' : 'unexplored'}<Stars n={region.stars} label={`Difficulty ${region.stars} of 5`} /></p></div>
      <Info>{info.description} Its upsides and downsides apply only to plots and buildings in {region.name}; town-wide limits still apply. Claiming adds {REGION_SIZE * REGION_SIZE} plots, with the middle one and its streets ready for a branch restaurant.</Info></div>
    <p className="mt-1.5 rounded-lg bg-teal/10 px-2 py-1.5 text-[11px] font-bold"><span className="text-teal">Good for: </span>{info.goodFor}</p>
    <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
      <ul aria-label="Upsides" className="space-y-0.5">{effects.upsides.map(t => <li key={t} className="flex items-center gap-1.5 font-bold text-teal"><Check size={13} aria-hidden="true" />{t}</li>)}</ul>
      <ul aria-label="Downsides" className="space-y-0.5">{effects.downsides.map(t => <li key={t} className="flex items-center gap-1.5 font-bold text-danger"><X size={13} aria-hidden="true" />{t}</li>)}</ul>
    </div>
    {status === 'claimable' && <div className="mt-2 rounded-xl border border-teal/40 bg-ink/[.06] p-2">
      <p className="text-[11px] font-bold text-gold">+{steps[0].fame} fame for claiming · {region.fame} fame for mastering it</p>
      <SmallButton className="mt-1.5 w-full bg-tomato text-paper" disabled={Boolean(error)} onClick={() => guardSpend(`Claiming ${region.name}`, price, () => action(restaurant.claimRegion(id)))}><MapPinned size={15} />{error ? 'Not yet' : `Claim · ${money(price)}`}</SmallButton>
      {error && <p className="mt-1 text-[11px] font-bold text-danger">{error}</p>}
    </div>}
    {status === 'claimed' && <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2 text-center text-[11px] font-bold">
        <div className="rounded-xl bg-ink/[.06] p-2"><p className="font-display text-base tabular-nums">{owned}/{REGION_SIZE * REGION_SIZE}</p>plots owned</div>
        <div className="rounded-xl bg-gold/15 p-2"><p className="font-display text-base tabular-nums">{branch ? money(restaurant.branchIncomeAt(branch)) : '—'}</p>branch income per shift</div>
      </div>
      <SmallButton className="w-full" onClick={() => onSelect(branch ?? plotTile(state.town, regionCenter(region.x, region.y)))}><Store size={15} />{branch ? `Branch restaurant · Lv ${branch.level}` : 'Build a branch restaurant'}</SmallButton>
    </div>}
    {status !== 'fog' && <div className="mt-2" aria-label="Fame milestones" role="group">
      <h4 className="flex items-center gap-1.5 text-xs font-extrabold"><Sparkles size={13} className="text-gold" aria-hidden="true" />Fame for mastering it</h4>
      <ul className="mt-1 space-y-1 text-[11px]">{steps.map(step => { const done = state.ocean.mastery.includes(masteryKey(id, step.kind)); return <li key={step.kind} className={cn('flex items-center gap-1.5', done ? 'font-bold text-teal' : 'text-ink/70')}>{done ? <Check size={13} aria-label="Done" /> : <span className="size-[13px] shrink-0 rounded-full border border-ink/30" aria-label="Not yet" />}<span className="min-w-0 flex-1">{step.label}</span><span className="font-extrabold text-gold">+{step.fame}</span></li>; })}</ul>
    </div>}
  </section>;
}

/** One region's buildings, then its empty plots, then the plots that can be unlocked next. */
interface Entry { key: string; tile: TileRef; label: string; state: 'busy' | 'built' | 'empty' | 'locked' }
function regionEntries(town: Town, id: string, now: number): Entry[] {
  const plots = (id === HOME_ID ? town.plots.filter(inHome) : plotsIn(town, id)), buildings = buildingsIn(town, id);
  return [
    ...buildings.map((b): Entry => ({ key: `b${b.id}`, tile: { x: b.x, z: b.z }, label: buildingLabel(b, now), state: b.job ? 'busy' : 'built' })),
    ...plots.filter(p => p.owned && !hasBuilding(town, p)).map((p): Entry => ({ key: `${p.x},${p.z}`, tile: plotTile(town, p), label: plotLabel(p), state: 'empty' })),
    ...plots.filter(p => canUnlock(town, p)).map((p): Entry => ({ key: `${p.x},${p.z}`, tile: plotTile(town, p), label: plotLabel(p), state: 'locked' })),
  ];
}
/** A specialisation note for a building kind on a plot, e.g. "Kelp forest: 50% stronger here". */
function boostNote(plot: Pick<Plot, 'x' | 'z'>, kind: BuildingKind): string | null {
  const boost = inHome(plot) ? 1 : plotModifiers(plot).boost[kind as BoostKind] ?? 1;
  return boost > 1 ? `${BIOMES[regionById(plotRegion(plot))!.biome].name}: ${Math.round((boost - 1) * 100)}% stronger here` : null;
}

/** Worth a tap right now: construction, empty plots, then the cheapest plots to unlock (those a road already reaches first). */
function quickEntries(town: Town, now: number): Entry[] {
  const all = [HOME_ID, ...restaurant.state.ocean.regions].flatMap(id => regionEntries(town, id, now)), plot = (e: Entry) => { const p = parcelOf(e.tile.x, e.tile.z); return plotAt(town, p.x, p.z)!; };
  const locked = all.filter(e => e.state === 'locked').sort((a, b) => restaurant.plotPrice(plot(a).x, plot(a).z) - restaurant.plotPrice(plot(b).x, plot(b).z) || Number(onNetwork(town, plot(b))) - Number(onNetwork(town, plot(a))));
  return [...all.filter(e => e.state === 'busy'), ...all.filter(e => e.state === 'empty'), ...locked].slice(0, 8);
}
const entryIcon = (e: Entry, size: number) => e.state === 'locked' ? <LockKeyhole size={size} className="shrink-0 text-ink/60" aria-hidden="true" /> : e.state === 'busy' ? <Clock size={size} className="shrink-0 text-gold" aria-hidden="true" /> : <MapPin size={size} className="shrink-0 text-teal" aria-hidden="true" />;
function EntryChip({ entry, onSelect }: { entry: Entry; onSelect: (t: TileRef) => void }) {
  return <button type="button" data-tutorial={entry.state === 'locked' ? 'plot-locked' : entry.state === 'busy' ? 'plot-busy' : entry.state === 'empty' ? 'plot-empty' : undefined} onClick={() => onSelect(entry.tile)} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-ink/10 bg-ink/[.06] px-2.5 text-[11px] font-bold hover:bg-ink/10">
    {entryIcon(entry, 14)}{entry.label}</button>;
}

/** Builders, charms and pearls in one line. */
function Supplies({ onShop }: { onShop: () => void }) {
  const town = restaurant.state.town;
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-ink/70">
    <span className="flex items-center gap-1" title="Builders working / builders"><Hammer size={13} className="text-teal" aria-hidden="true" />Builders {busyBuilders(town)}/{town.builders}</span>
    <span className="flex items-center gap-1" title="Current charms skip 15 minutes, Tide charms skip an hour"><Waves size={13} className="text-teal" aria-hidden="true" />{town.charms.current} × 15m · {town.charms.tide} × 1h</span>
    <span data-testid="town-safe" className={cn('ml-auto', restaurant.safeToSpend() > 0 ? 'text-teal' : 'text-danger')} title="Cash you can spend and still cover the next payroll">Safe {money(restaurant.safeToSpend())}</span>
    <button type="button" onClick={onShop} className="flex min-h-9 items-center gap-1 rounded-lg bg-violet/15 px-2 hover:bg-violet/25"><Gem size={13} className="text-violet" aria-hidden="true" />{town.pearls} pearls</button>
  </div>;
}

/** The Town overview window: every building and plot, the depth zones and the ocean regions, one tab at a time. */
export function TownOverview({ tab, onSelect, onRegion, action }: { tab: 'plots' | 'zones' | 'regions'; onSelect: (tile: TileRef) => void; onRegion: (id: string) => void; action: Action }) {
  const now = useNow(), state = restaurant.state, town = state.town;
  if (tab === 'zones') return <ZoneSection action={action} />;
  if (tab === 'regions') return <RegionsSection onRegion={onRegion} />;
  const groups = [HOME_ID, ...state.ocean.regions].map(id => ({ id, name: regionById(id)!.name, entries: regionEntries(town, id, now) }));
  return <section aria-label="Town plots">{groups.map(group => <div key={group.id} role="group" aria-label={`${group.name} plots`} className="mb-3">
    <h4 className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-ink/55">{group.name}</h4>
    <div className="grid gap-1.5 sm:grid-cols-2">{group.entries.map(e => <button type="button" key={e.key} onClick={() => onSelect(e.tile)} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-ink/10 bg-ink/[.06] px-3 text-left text-xs font-bold hover:bg-ink/10">
      {entryIcon(e, 15)}<span className="min-w-0 flex-1 truncate">{e.label}</span></button>)}</div>
  </div>)}</section>;
}

/** The Town action card under the scene: a tapped building, tile or region, a building being placed, or the road tool. */
export function TownPanel({ selected, onSelect, region, onRegion, draft, onDraft, roadMode, onRoadMode, onEnterRestaurant, onShop, onOverview, action }: {
  selected: TileRef | null; onSelect: (tile: TileRef | null) => void; region?: string | null; onRegion?: (id: string | null) => void;
  draft: TownDraft | null; onDraft: (draft: TownDraft | null) => void; roadMode: boolean; onRoadMode: (on: boolean) => void;
  onEnterRestaurant: () => void; onShop: () => void; onOverview: () => void; action: Action;
}) {
  const now = useNow(), state = restaurant.state, town = state.town, fame = restaurant.fameBonuses();
  const busy = busyBuilders(town) >= town.builders;
  const summary = <Supplies onShop={onShop} />;
  const act = (error: string | null, then?: () => void) => { action(error); if (!error) then?.(); };
  /** What a price leaves in the register; red when it dips into the next payroll. */
  const leaves = (cost: number) => state.cash >= cost && <span className={cn('text-[10px] font-bold', restaurant.spendCheck(cost).after < restaurant.spendCheck(cost).reserve ? 'text-danger' : 'text-ink/50')}>Leaves {money(state.cash - cost)}</span>;
  const back = <button type="button" aria-label="Back to town" onClick={() => { onSelect(null); onRegion?.(null); onDraft(null); }} className="-ml-1 grid size-10 shrink-0 place-items-center rounded-full text-teal hover:bg-ink/5"><ArrowLeft size={17} /></button>;
  const select = (next: TileRef) => { onRegion?.(null); onSelect(next); };
  const streets = (px: number, pz: number, className = 'w-full', then?: () => void) => { const s = restaurant.streetsFor(px, pz); return s.tiles.length > 0 && <SmallButton className={className} disabled={state.cash < s.price} onClick={() => act(restaurant.layStreets(px, pz), then)}><Route size={14} />Lay this plot’s streets · {s.tiles.length} tiles · {money(s.price)}</SmallButton>; };

  if (draft) {
    const info = BUILDINGS[draft.kind], plot = parcelOf(draft.x, draft.z), error = restaurant.placeError(draft.kind, draft.x, draft.z, draft.turned, draft.id), { w, d } = footprint(draft.kind, draft.turned, draft.wide);
    const price = restaurant.buildPrice(draft.kind, plot.x, plot.z), moving = draft.id !== undefined, ready = !error && (moving || (!busy && state.cash >= price));
    const needsRoad = error === 'Buildings need a road along one side.' && plotAt(town, plot.x, plot.z)?.owned;
    return <section aria-label={moving ? `Move ${info.name.toLowerCase()}` : `Place ${info.name.toLowerCase()}`}>
      <div className="flex items-center gap-2">{back}<div className="min-w-0 flex-1"><h3 className="truncate font-display text-base leading-tight">{moving ? 'Move' : 'Place'} {info.name.toLowerCase()}</h3><p className="truncate text-[11px] text-ink/60">{w}×{d} tiles · tap the map to move it</p></div>
        <SmallButton label="Turn" className="shrink-0 px-2.5" onClick={() => onDraft({ ...draft, turned: !draft.turned })}><RotateCw size={15} /></SmallButton></div>
      <p data-testid="draft-status" className={cn('mt-1.5 text-[11px] font-bold', error ? 'text-danger' : 'text-teal')}>{error ?? (draft.kind === 'restaurant' ? 'Fits here.' : `Fits here. ${effectText(town, draft, moving ? buildingAt(town, draft.x, draft.z)?.level ?? 1 : 1, fame.branch)}`)}{!error && nearHub(town, draft) && ['kelpFarm', 'fishery', 'garden'].includes(draft.kind) && <span className="text-gold"> · Hub bonus</span>}</p>
      {needsRoad && <div className="mt-1.5">{streets(plot.x, plot.z, 'w-full', () => onDraft({ ...draftAt(restaurant.state.town, draft.kind, draft), id: draft.id })) || <p className="text-[11px] text-ink/65">Use the road tool to join this spot to a road.</p>}</div>}
      <div className="mt-2 flex gap-1.5">
        <SmallButton className="flex-1" onClick={() => onDraft(null)}><X size={14} />Cancel</SmallButton>
        <SmallButton tutorial="build-building" className="flex-[2] bg-teal text-paper" disabled={!ready} onClick={() => moving ? act(restaurant.moveBuilding(draft.id!, draft.x, draft.z, draft.turned), () => onDraft(null)) : guardSpend(`Building a ${info.name.toLowerCase()}`, price, () => act(restaurant.build(draft.kind, draft.x, draft.z, draft.turned), () => { onDraft(null); onSelect({ x: draft.x, z: draft.z }); }))}>
          {moving ? <><Move size={14} />Move here</> : <><Hammer size={14} />{state.cash < price ? `Need ${money(price - state.cash)}` : busy ? 'Builders busy' : `Build · ${money(price)} · ${formatDuration(restaurant.jobSeconds(draft.kind, 1, plot.x, plot.z) * 1000)}`}</>}</SmallButton>
      </div>
      {!moving && <p className="mt-1">{leaves(price)}</p>}
    </section>;
  }
  if (roadMode) return <section aria-label="Road tool">
    <div className="flex items-center gap-2"><Route size={18} className="shrink-0 text-teal" aria-hidden="true" /><div className="min-w-0 flex-1"><h3 className="font-display text-base leading-tight">Road tool</h3><p className="text-[11px] text-ink/60">Tap your land to lay a road ({money(restaurant.roadPrice(selected?.x ?? 16, selected?.z ?? 16))}). Tap a road to lift it.</p></div>
      <SmallButton className="shrink-0 bg-teal text-paper" onClick={() => onRoadMode(false)}><Check size={14} />Done</SmallButton></div>
    <p className="mt-1.5 text-[11px] text-ink/65">Buildings work once a road joins them to your restaurant or a branch. {town.roads.length} road tiles.</p>
  </section>;

  const building = selected && buildingAt(town, selected.x, selected.z), plot = selected && plotOfTile(town, selected.x, selected.z);
  if (!plot && region && regionById(region)) return <RegionDetails id={region} back={back} onSelect={select} action={action} summary={summary} />;
  if (!selected || !plot) return <section aria-label="Town plots">
    <div className="flex items-center gap-2">{summary}</div>
    <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
      <button type="button" onClick={onOverview} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-teal px-3 text-[11px] font-extrabold text-paper"><List size={14} aria-hidden="true" />All plots & zones</button>
      <button type="button" onClick={() => onRoadMode(true)} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-teal/40 bg-teal/10 px-3 text-[11px] font-extrabold"><Route size={14} className="text-teal" aria-hidden="true" />Roads</button>
      {quickEntries(town, now).map(e => <EntryChip key={e.key} entry={e} onSelect={select} />)}
    </div>
  </section>;
  const where = inHome(plot) ? (plot.owned ? null : ZONES[plotZone(plot)].name) : `${regionName(plot)} · ${BIOMES[regionById(plotRegion(plot))!.biome].name}`;
  const head = (title: string, sub?: ReactNode, extra?: ReactNode) => <div className="flex items-center gap-2">{back}<div className="min-w-0 flex-1"><h3 className="truncate font-display text-base leading-tight">{title}</h3>{(sub || where) && <p className="truncate text-[11px] text-ink/60">{sub}{sub && where ? ' · ' : ''}{where}{!inHome(plot) && onRegion && <button type="button" className="ml-1.5 font-bold text-teal underline" onClick={() => { onSelect(null); onRegion(plotRegion(plot)); }}>Region</button>}</p>}</div>{extra}</div>;
  if (!plot.owned) {
    const cost = restaurant.plotPrice(plot.x, plot.z), open = canUnlock(town, plot), reason = plotLockReason(town, plot);
    return <section aria-label="Locked plot">{head('Wild seabed', `${PARCEL}×${PARCEL} tiles`)}
      {open && <p className="mt-1">{leaves(cost)}</p>}
      {open ? <SmallButton tutorial="unlock-plot" className="mt-2 w-full bg-teal text-paper" disabled={state.cash < cost} onClick={() => guardSpend('Unlocking this plot', cost, () => action(restaurant.unlockPlot(plot.x, plot.z)))}><LockKeyhole size={15} />{state.cash < cost ? `Need ${money(cost - state.cash)} more` : `Unlock · ${money(cost)}`}</SmallButton>
        : <Notice>{reason}{!inHome(plot) || hasZone(town, plotZone(plot)) ? ' Plots grow outward from the ones you own.' : ' See Depth zones under All plots & zones.'}</Notice>}
    </section>;
  }
  if (!building && isRoad(town, selected.x, selected.z)) return <section aria-label="Road">{head('Road', network(town).has(tileKey(selected.x, selected.z)) ? 'joined to your restaurant' : 'not joined to your restaurant yet')}
    <div className="mt-2 flex gap-1.5"><SmallButton className="flex-1" onClick={() => act(restaurant.removeRoad(selected.x, selected.z), () => onSelect(null))}><X size={14} />Lift road</SmallButton><SmallButton className="flex-1" onClick={() => onRoadMode(true)}><Route size={14} />Road tool</SmallButton></div>
  </section>;
  if (!building) {
    const roadCost = restaurant.roadPrice(selected.x, selected.z);
    return <section aria-label="Empty plot">{head('Your land', busy ? 'builders busy' : 'choose a building')}
      {busy && <p className="mt-1 text-[11px] text-ink/65">All builders are busy. Use a charm, or <button type="button" className="font-extrabold text-teal underline" onClick={onShop}>get another builder</button>.</p>}
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">{buildableAt(town, plot).map(kind => {
        const info = BUILDINGS[kind], price = restaurant.buildPrice(kind, plot.x, plot.z), affordable = state.cash >= price, spot = draftAt(town, kind, selected), bonus = (kind === 'kelpFarm' || kind === 'fishery' || kind === 'garden') && nearHub(town, spot), special = boostNote(plot, kind);
        return <div key={kind} title={`${info.description}${info.adjacency ? ` ${info.adjacency}` : ''}`} className={cn('flex w-[150px] shrink-0 flex-col rounded-xl border p-2', kind === 'branch' ? 'border-gold/50 bg-gold/10' : 'border-ink/10 bg-ink/[.06]')}>
          <div className="flex items-baseline justify-between gap-1"><h4 className="truncate font-display text-sm leading-tight">{info.name}</h4><span className="shrink-0 text-[11px] font-extrabold tabular-nums text-teal">{money(price)}</span></div>
          <p className="text-[10px] font-bold text-ink/55">{info.size[0]}×{info.size[1]} tiles</p>
          <p className="mt-0.5 line-clamp-2 min-h-[26px] text-[10px] font-bold leading-[13px] text-teal">{effectText(town, spot, 1, fame.branch)}</p>
          {(special || bonus) && <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-bold text-gold"><Sparkles size={11} aria-hidden="true" />{special ?? 'Hub bonus'}</p>}
          <SmallButton tutorial="build-building" className="mt-1.5 w-full px-1 text-[11px]" disabled={!affordable || busy} onClick={() => onDraft(spot)}><Hammer size={13} />{!affordable ? `Need ${money(price - state.cash)}` : 'Place'}</SmallButton>
        </div>;
      })}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <SmallButton className="flex-1" disabled={state.cash < roadCost || roadError(town, selected.x, selected.z) !== null} onClick={() => action(restaurant.placeRoad(selected.x, selected.z))}><Route size={14} />Road here · {money(roadCost)}</SmallButton>
        {streets(plot.x, plot.z, 'flex-[2]')}
      </div>
    </section>;
  }
  const kind = building.kind, info = BUILDINGS[kind], job = building.job, next = building.level + 1, home = buildingPlot(building), cost = restaurant.upgradePrice(kind, next, home.x, home.z), special = boostNote(home, kind), works = connected(town, building), spot: Spot = building;
  return <section aria-label={info.name}>{head(info.name, `Lv ${building.level}/${MAX_LEVEL} · ${info.looks[lookFor(building.level) - 1]}`, <>
    <SmallButton label={`Move ${info.name.toLowerCase()}`} className="shrink-0 px-2.5" onClick={() => onDraft({ kind, x: building.x, z: building.z, turned: building.turned, wide: building.wide, id: building.id })}><Move size={14} /></SmallButton>
    {kind === 'restaurant' ? <SmallButton className="shrink-0" onClick={onEnterRestaurant}><Store size={14} />Enter</SmallButton> : <Info>{info.description}{info.adjacency ? ` ${info.adjacency}` : ''} “Near” means touching it or one tile away, for example across a road.{kind === 'branch' ? ' Branch income is paid at every closing, also while you are away.' : ''}</Info>}</>)}
    {!works && <div data-testid="no-road" className="mt-1.5 rounded-xl border border-danger/40 bg-danger/10 p-2 text-[11px] font-bold text-danger">No road joins this building to your {inHome(home) ? 'restaurant' : 'branch'}, so it does nothing yet.{' '}<button type="button" className="font-extrabold underline" onClick={() => onRoadMode(true)}>Lay a road</button></div>}
    <p className="mt-1 text-[11px] font-bold text-teal">{kind === 'branch' && <span data-testid="branch-income" className="mr-1 text-gold">{job?.kind === 'build' ? `Opens when built: ${money(restaurant.branchIncomeAt(building, 1))} per shift.` : `Earns ${money(restaurant.branchIncomeAt(building))} per shift.`}</span>}{job?.kind === 'build' ? 'Ready when built: ' : 'Now: '}{effectText(town, spot, building.level, fame.branch)}{special && <span className="text-gold"> · {special}</span>}</p>
    {job ? <div className="mt-2 rounded-xl border border-gold/40 bg-gold/10 p-2" data-testid="construction">
      <div className="flex items-center justify-between text-xs font-extrabold"><span>{job.kind === 'build' ? 'Building' : `Upgrading to level ${next}`}</span><span className="tabular-nums">{formatDuration(job.endsAt - now)}</span></div>
      <progress className="mt-1.5" aria-label="Construction progress" value={Math.min(1, (now - job.startedAt) / Math.max(1, job.endsAt - job.startedAt))} max={1} />
      <div className="mt-2 grid grid-cols-3 gap-1.5">{(['current', 'tide'] as const).map(charm => <SmallButton key={charm} tutorial={charm === 'current' ? 'use-current' : undefined} label={`${CHARMS[charm].name}: skip ${charm === 'current' ? '15 minutes' : 'an hour'} (you have ${town.charms[charm]})`} className="flex-col gap-0 px-1 py-1 text-[11px]" disabled={town.charms[charm] < 1} onClick={() => action(restaurant.useCharm(building.id, charm))}><span className="flex items-center gap-1"><Waves size={13} />−{charm === 'current' ? '15m' : '1h'}</span><span className="text-[10px] text-ink/60">×{town.charms[charm]}</span></SmallButton>)}
        <SmallButton label={`Finish now for ${finishCost(job, now)} ${finishCost(job, now) === 1 ? 'pearl' : 'pearls'}`} className="flex-col gap-0 border-violet/40 bg-violet/15 px-1 py-1 text-[11px]" disabled={town.pearls < finishCost(job, now)} onClick={() => action(restaurant.finishNow(building.id))}><span className="flex items-center gap-1"><Zap size={13} />Finish</span><span className="text-[10px] text-ink/60">{finishCost(job, now)} <Gem size={9} className="inline" aria-hidden="true" /></span></SmallButton></div>
      {town.pearls < finishCost(job, now) && <button type="button" onClick={onShop} className="mt-1 min-h-9 w-full text-center text-[11px] font-bold text-teal underline">Get pearls</button>}
    </div>
    : building.level >= MAX_LEVEL ? <Notice>Fully upgraded. A true reef landmark.</Notice>
    : <div className="mt-2 flex items-center gap-2 rounded-xl border border-ink/10 bg-ink/[.06] p-2">
      <div className="min-w-0 flex-1"><h4 className="text-xs font-extrabold">Level {next} · <span className="tabular-nums text-teal">{money(cost)}</span> {leaves(cost)}</h4><p className="line-clamp-2 text-[10px] font-bold text-teal">{effectText(town, spot, next, fame.branch)}{lookFor(next) !== lookFor(building.level) ? <span className="text-gold"> · New look: {info.looks[lookFor(next) - 1]}</span> : ''}</p></div>
      <SmallButton className="shrink-0" disabled={state.cash < cost || busy} onClick={() => guardSpend(`Upgrading this ${info.name.toLowerCase()}`, cost, () => action(restaurant.upgrade(building.id)))}><Clock size={14} />{state.cash < cost ? `Need ${money(cost - state.cash)}` : busy ? 'Builders busy' : `Upgrade · ${formatDuration(restaurant.jobSeconds(kind, next, home.x, home.z) * 1000)}`}</SmallButton>
    </div>}
  </section>;
}
