import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Armchair, ChevronDown, ChevronUp, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Award, Castle, Check, CircleHelp, Gem, Hammer, Leaf, Maximize2, Minus, Move, Music2, Pause, Play, Plus, ReceiptText, RotateCw, Settings2, Star, Sun, Trash2, Users, UtensilsCrossed, VolumeX, Waves, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { MUSIC_URL } from './assets';
import { GOALS, restaurant } from './engine';
import { placementError } from './layout';
import { CATALOG, DAY_LENGTH, FURNITURE_MAX_LEVEL, capacity, comfort, furnitureUpgradeCost, upgradeEffectText, width, type Furniture, type FurnitureKind, type Point } from './types';
import { lookFor } from './town';
import { LedgerPanel, MenuPanel, TeamPanel, SmallButton, type Panel } from './Panels';
import { InteriorsPanel } from './InteriorsPanel';
import { money } from './format';
import { DailyReport } from './DailyReport';
import { PlacementReadout } from './PlacementReadout';
import { CashRegister } from './CashRegister';
import { BusinessUpdates } from './BusinessUpdates';
import { CapitalWarningBanner } from './CapitalWarningBanner';
import { getCapitalWarning } from './capital-warning';
import { TownPanel, type PlotRef } from './TownPanel';
import { PremiumShop } from './PremiumShop';
import { BIOMES, PALETTES, parseRegionId, regionAt, regionById, regionStatus } from './ocean';
import { regionCenter } from './world';
import { TutorialCoach } from './TutorialCoach';
import { currentStep } from './tutorial';
import { guardSpend } from './spend-guard';
import { SpendGuardDialog } from './SpendGuardDialog';
const RestaurantScene = lazy(() => import('./RestaurantScene'));
const TownScene = lazy(() => import('./TownScene'));
const nameSchema = z.object({ name: z.string().trim().min(1, 'Give your restaurant a name.').max(28, 'Keep it under 29 characters.') });
const tabs = [{ id: 'town', label: 'Town', Icon: Castle }, { id: 'build', label: 'Build', Icon: Hammer }, { id: 'team', label: 'Team', Icon: Users }, { id: 'menu', label: 'Menu', Icon: UtensilsCrossed }, { id: 'ledger', label: 'Ledger', Icon: ReceiptText }] as const;
const panelNames = { town: 'Reef town', build: 'Interiors', team: 'Your Mareen crew', menu: 'Made with love', ledger: 'The owner’s ledger' };

/** The restaurant-owner entry point. Legacy arcade controls are intentionally not mounted. */
export default function ManagementGame() {
  useSyncExternalStore(restaurant.subscribe, restaurant.getSnapshot);
  const state = restaurant.state, paused = restaurant.paused;
  const [panel, setPanel] = useState<Panel | null>(null), [draft, setDraft] = useState<Furniture | null>(null), [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1), [viewKey, setViewKey] = useState<number>(0), [settings, setSettings] = useState<boolean>(false), [help, setHelp] = useState<boolean>(false), [resetConfirm, setResetConfirm] = useState<boolean>(false);
  const [reportDay, setReportDay] = useState<number | null>(null);
  const [focusChallenges, setFocusChallenges] = useState<boolean>(false);
  // On phones a panel can shrink to its title bar so the scene gets the screen back.
  const [peek, setPeek] = useState<boolean>(false);
  useEffect(() => setPeek(false), [panel]);
  const [view, setView] = useState<'restaurant' | 'town'>('restaurant'), [plot, setPlot] = useState<PlotRef | null>(null), [shop, setShop] = useState<boolean>(false);
  // The region whose details are open in the Town panel, and the region in the middle of the town scene.
  const [region, setRegion] = useState<string | null>(null), [look, setLook] = useState<string>('0,0');
  // Picking a plot or region in the panel moves the camera to it; taps in the scene don't.
  const [focus, setFocus] = useState<{ x: number; z: number; n: number } | null>(null);
  const focusOn = (p: { x: number; z: number }) => setFocus(current => ({ x: p.x, z: p.z, n: (current?.n ?? 0) + 1 }));
  const completionId = restaurant.lastCompletion?.id;
  useEffect(() => { const done = restaurant.lastCompletion; if (done) toast.success(done.text); }, [completionId]);
  const reportIndex = state.history.findIndex(report => report.day === reportDay);
  const displayedReport = state.history[reportIndex];
  const music = useRef<HTMLAudioElement | null>(null), panelBody = useRef<HTMLDivElement>(null);
  // A newly chosen plot or region opens at the top of the panel.
  useEffect(() => { panelBody.current?.scrollTo?.({ top: 0 }); }, [plot, region]);
  const action = useCallback((error: string | null) => { if (error) toast.error(error); }, []);
  const form = useForm<z.infer<typeof nameSchema>>({ resolver: zodResolver(nameSchema), defaultValues: { name: state.name } });
  const editable = state.phase === 'planning';
  const selectedItem = state.furniture.find(item => item.id === selected);
  const goal = GOALS.find(g => !state.claimed.includes(g.id));
  const rewardsReady = restaurant.rewardsReady();
  const error = draft ? placementError(state, draft) : null;
  const purchaseBalance = draft?.id === -1 ? state.cash - CATALOG[draft.kind].price : null;
  const openingReserve = restaurant.operatingCost() + 30;
  const capitalWarning = restaurant.catchingUp ? null : getCapitalWarning(state, restaurant.operatingCost());
  const showInspector = Boolean(draft || selectedItem && editable);
  const tutorialStep = currentStep(state);
  // The header names the region the player is looking at in the world, or the Home Reef.
  const place = view === 'town' && regionStatus(state.ocean, look) !== 'fog' ? regionById(look) ?? regionAt(0, 0) : regionAt(0, 0), water = PALETTES[place.biome].water;
  const toRestaurant = () => { setView('restaurant'); setZoom(z => Math.max(.7, z)); setRegion(null); };
  useEffect(() => {
    const visibility = () => { if (document.hidden) restaurant.suspend(); else void restaurant.resume(); };
    const save = () => restaurant.suspend();
    const restore = () => { if (!document.hidden) void restaurant.resume(); };
    void restaurant.resume();
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', save); window.addEventListener('pageshow', restore);
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', save); window.removeEventListener('pageshow', restore); restaurant.suspend(); };
  }, []);
  useEffect(() => {
    const audio = new Audio(MUSIC_URL); audio.loop = true; audio.volume = .2; music.current = audio;
    const unlock = () => { if (restaurant.state.music && !restaurant.paused && !document.hidden) void audio.play().catch(() => undefined); };
    const visibility = () => { if (document.hidden) audio.pause(); };
    document.addEventListener('pointerdown', unlock); document.addEventListener('visibilitychange', visibility);
    return () => { audio.pause(); audio.src = ''; music.current = null; document.removeEventListener('pointerdown', unlock); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => { if (!music.current) return; if (state.music && !paused) void music.current.play().catch(() => undefined); else music.current.pause(); }, [state.music, paused]);
  const rotateDraft = useCallback(() => setDraft(current => current ? { ...current, rotation: (current.rotation + 1) % 4 } : null), []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (restaurant.catchingUp) return;
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[role="dialog"]')) return;
      if (event.key === 'Escape') { setDraft(null); setSelected(null); setPanel(null); setPlot(null); setRegion(null); }
      if (draft && event.key.toLowerCase() === 'r') rotateDraft();
      const directions: Record<string, Point> = { ArrowUp: { x: 0, z: -1 }, ArrowDown: { x: 0, z: 1 }, ArrowLeft: { x: -1, z: 0 }, ArrowRight: { x: 1, z: 0 } };
      const d = directions[event.key]; if (draft && d) { event.preventDefault(); setDraft(current => current ? { ...current, x: Math.max(0, Math.min(width(restaurant.state) - 1, current.x + d.x)), z: Math.max(0, Math.min(9, current.z + d.z)) } : null); }
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [draft, rotateDraft]);
  const choose = (kind: FurnitureKind) => {
    if (state.phase !== 'planning' || state.cash < CATALOG[kind].price) return;
    let candidate: Furniture = { id: -1, kind, x: 0, z: 7, rotation: 0, level: 1 };
    outer: for (let z = 7; z >= 0; z--) for (let x = 0; x < width(state); x++) { const test = { ...candidate, x, z }; if (!placementError(state, test)) { candidate = test; break outer; } }
    setDraft(candidate); setSelected(null); setPanel(null);
  };
  const onTile = useCallback((point: Point) => setDraft(current => current ? { ...current, ...point } : null), []);
  const onSelect = useCallback((id: number) => { if (restaurant.state.phase === 'planning') { setSelected(id); setPanel(null); } }, []);
  const confirm = () => {
    if (!draft) return;
    const commit = () => { const result = restaurant.place(draft); action(result); if (!result) { setDraft(null); setSelected(null); toast.success(draft.id === -1 ? `${CATALOG[draft.kind].name} placed · ${money(CATALOG[draft.kind].price)} paid.` : 'Furniture moved. No charge.'); } };
    if (draft.id === -1) guardSpend(`A ${CATALOG[draft.kind].name.toLowerCase()}`, CATALOG[draft.kind].price, commit); else commit();
  };
  const open = () => { const result = restaurant.open(); action(result); if (!result) { setPanel(null); setDraft(null); setSelected(null); } };
  const togglePanel = (next: Panel) => {
    setFocusChallenges(false); setDraft(null); setSelected(null);
    if (next === 'town') { const leaving = view === 'town'; if (leaving) toRestaurant(); else setView('town'); setPanel(leaving ? null : 'town'); setPlot(null); setRegion(null); return; }
    toRestaurant(); setPanel(current => current === next ? null : next);
  };
  const pauseForDialog = (type: 'settings' | 'help') => { if (type === 'settings') { form.reset({ name: state.name }); setSettings(true); } else setHelp(true); };
  const hour = Math.min(22, 17 + state.elapsed / DAY_LENGTH * 5), clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
  return <><main inert={restaurant.catchingUp} style={{ background: `linear-gradient(${water[0]}, ${water[1]} 45%, ${water[2]})` }} className="fixed inset-0 flex flex-col overflow-hidden text-ink">
    <header className="relative z-30 shrink-0 px-2 pt-2 sm:px-3"><div className="mx-auto flex max-w-[1600px] items-center gap-2.5 rounded-2xl border border-teal/25 bg-paper/90 py-0.5 pl-3 pr-0.5 shadow-[0_0_0_1px_#A57BFF26] backdrop-blur-md sm:gap-5">
      <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal text-paper"><Waves size={18} /></div><h1 className="truncate font-display text-lg leading-tight">{state.name}</h1></div>
      <div className="flex items-center gap-1.5" title={editable ? 'Planning' : state.phase === 'report' ? 'Closed' : 'Service'}><Sun size={15} className="shrink-0 text-gold" aria-hidden="true" /><p className="whitespace-nowrap font-display text-sm leading-none">Day {state.day}<span className="ml-1 font-body text-[10px] text-ink/55">{editable ? 'Plan' : state.phase === 'report' ? 'Closed' : clock}</span></p></div>
      <CashRegister />
      <div className="flex items-center gap-1" aria-label={`Reputation ${state.reputation.toFixed(1)} of 5`}><Star size={14} className="shrink-0 fill-gold text-gold" aria-hidden="true" /><span className="font-display text-sm" aria-hidden="true">{state.reputation.toFixed(1)}</span></div>
      <div className="ml-auto flex items-center sm:ml-0"><button className="flex h-11 items-center gap-1 rounded-xl px-2 font-display text-sm hover:bg-teal/10" data-tutorial="pearl-shop" aria-label={`Pearl shop: ${state.town.pearls} pearls`} onClick={() => setShop(true)}><Gem size={15} className="text-violet" aria-hidden="true" /><span className="tabular-nums">{state.town.pearls}</span></button><button className="hidden size-11 place-items-center rounded-xl hover:bg-teal/10 sm:grid" aria-label="How to play" onClick={() => pauseForDialog('help')}><CircleHelp size={17} /></button><button className="grid size-11 place-items-center rounded-xl hover:bg-teal/10" aria-label="Restaurant settings" onClick={() => pauseForDialog('settings')}><Settings2 size={17} /></button></div>
    </div>{capitalWarning && <CapitalWarningBanner warning={capitalWarning} paused={paused} onClose={() => restaurant.closeEarly()} onResume={() => restaurant.pause(false)} onLedger={() => { setFocusChallenges(false); setDraft(null); setSelected(null); setPanel('ledger'); }} />}</header>
    <div data-testid="management-workspace" className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="absolute inset-0" data-testid="restaurant-scene"><Suspense fallback={<div className="grid h-full place-items-center font-display text-xl text-ink">Diving down…</div>}>{view === 'town' ? <TownScene selected={plot} selectedRegion={region} zoom={zoom} viewKey={viewKey} focus={focus} onLook={setLook} onPlot={next => { setPlot(next); setRegion(null); setPanel('town'); setPeek(false); }} onRegion={id => { setRegion(id); setPlot(null); setPanel('town'); setPeek(false); }} /> : <RestaurantScene state={state} draft={draft} building={Boolean(editable && (panel === 'build' || draft || selectedItem))} selected={selected} onTile={onTile} onSelect={onSelect} zoom={zoom} viewKey={viewKey} />}</Suspense></div>
          <div className="pointer-events-none absolute left-2 top-2 z-[5] flex flex-col items-start gap-2 sm:left-3">
            {view === 'town' && <p data-testid="region-name" className="rounded-full bg-paper/80 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-ink/80 backdrop-blur">{place.name}{place.biome !== 'home' && <span className="text-ink/55"> · {BIOMES[place.biome].name}</span>}</p>}
            {view === 'restaurant' && !capitalWarning && !panel && !showInspector && tutorialStep === null && <div className="hidden w-[200px] rounded-xl border border-teal/25 bg-paper/85 p-3 backdrop-blur sm:block"><div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wider text-ink/50"><Award size={13} className="text-gold" />{goal ? 'Your next milestone' : 'Reef favorite'}</div><h2 className="mt-1 text-sm">{goal?.title ?? 'Made it your own'}</h2>{goal ? <><p className="mb-1.5 text-[11px] text-ink/65">{goal.text}</p><progress value={Math.min(goal.target, goal.value(state))} max={goal.target} aria-label={goal.text} /><button className="pointer-events-auto flex min-h-11 w-full items-center justify-between text-[11px] font-extrabold" onClick={() => setPanel('ledger')}><span>{Math.min(goal.target, goal.value(state))}/{goal.target}</span><span className="text-teal">+{money(goal.reward)} <ArrowUpRight className="inline" size={13} /></span></button></> : <p className="text-[11px] text-ink/60">Keep growing your story, one service at a time.</p>}</div>}
          </div>
          <div className="absolute right-2 top-2 z-[5] flex flex-col gap-1 sm:right-3"><CameraButton label="Zoom in" onClick={() => setZoom(z => Math.min(2.2, z + .2))}><Plus size={16} /></CameraButton><CameraButton label="Zoom out" onClick={() => setZoom(z => Math.max(view === 'town' ? .3 : .7, Math.round((z - (z > 1 ? .2 : .1)) * 100) / 100))}><Minus size={16} /></CameraButton><CameraButton label="Reset view" onClick={() => { setZoom(1); setViewKey(key => key + 1); }}><Maximize2 size={15} /></CameraButton></div>
          {!panel && !showInspector && <BusinessUpdates onReport={setReportDay} onChallenges={() => { setFocusChallenges(true); setPanel('ledger'); }} />}
          <TutorialCoach panel={panel} view={view} plot={plot} placing={Boolean(draft)} inspecting={showInspector} capitalWarning={Boolean(capitalWarning)} />
          {restaurant.saveFailed && <button onClick={() => { const saved = restaurant.save(true); restaurant.notify(); if (!saved) toast.error('Storage is unavailable. Keep this tab open to retain progress.'); }} className="absolute left-1/2 top-2 z-40 max-w-[80%] -translate-x-1/2 rounded-xl bg-danger px-3 py-2 text-xs font-bold text-abyss shadow-lg">{restaurant.loadWarning || 'Not saved: progress is only in this session.'} Tap to retry saving.</button>}
        </div>
        {showInspector && <section aria-label="Furniture placement" className="paper mx-2 mb-1 mt-1 w-[calc(100%-16px)] shrink-0 self-center p-2.5 sm:max-w-[650px] sm:p-3">
      {draft ? <><div className="flex items-center gap-2"><div className="min-w-0 flex-1"><h2 className="text-base">{draft.id === -1 ? 'Place' : 'Move'} {CATALOG[draft.kind].name.toLowerCase()} <span className="text-sm text-teal">{draft.id === -1 ? money(CATALOG[draft.kind].price) : 'Free'}</span></h2><p role="status" className={cn('text-[11px]', error ? 'text-danger' : 'text-ink/60')}>{error ?? 'Tap a grid cell to snap. Gold rings need a clear aisle.'}</p></div><button aria-label="Cancel placement" className="grid size-11 shrink-0 place-items-center" onClick={() => setDraft(null)}><X size={17} /></button></div>{purchaseBalance !== null && <div data-testid="purchase-budget" className={cn('mt-1 flex flex-wrap justify-between gap-x-3 text-[10px] font-bold sm:text-[11px]', purchaseBalance < openingReserve ? 'text-danger' : 'text-teal')}><span>After purchase: {money(purchaseBalance)}</span><span>{purchaseBalance < openingReserve ? 'Below opening reserve · ' : 'Keep '}{money(openingReserve)} to reopen</span></div>}<PlacementReadout item={draft} error={error} /><div className="mt-1.5 flex flex-wrap items-center gap-1">{[{ Icon: ArrowLeft, x: -1, z: 0, label: 'left' }, { Icon: ArrowUp, x: 0, z: -1, label: 'back' }, { Icon: ArrowDown, x: 0, z: 1, label: 'forward' }, { Icon: ArrowRight, x: 1, z: 0, label: 'right' }].map(({ Icon, x, z, label }) => <button key={label} aria-label={`Move furniture ${label}`} className="grid size-11 place-items-center rounded-lg bg-ink/5" onClick={() => onTile({ x: Math.max(0, Math.min(width(state) - 1, draft.x + x)), z: Math.max(0, Math.min(9, draft.z + z)) })}><Icon size={16} /></button>)}<SmallButton className="min-w-11" onClick={rotateDraft} label="Rotate furniture"><RotateCw size={16} /><span className="hidden sm:inline">Rotate</span></SmallButton><button className="ml-auto flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-teal px-4 text-sm font-extrabold text-paper disabled:opacity-40" data-tutorial="confirm" disabled={Boolean(error) || draft.id === -1 && state.cash < CATALOG[draft.kind].price} onClick={confirm}><Check size={16} />Confirm</button></div></>
      : selectedItem && <><div className="flex flex-wrap items-center gap-1.5"><div className="mr-auto"><h2 className="flex flex-wrap items-center gap-x-2 text-base">{CATALOG[selectedItem.kind].name}<LevelTag level={selectedItem.level} /></h2><p className="hidden max-w-[270px] text-[11px] text-ink/60 sm:block">{CATALOG[selectedItem.kind].description}</p></div><SmallButton onClick={() => { setDraft({ ...selectedItem }); setSelected(null); }}><Move size={15} />Move</SmallButton><SmallButton onClick={() => action(restaurant.place({ ...selectedItem, rotation: (selectedItem.rotation + 1) % 4 }))} label="Rotate selected furniture"><RotateCw size={15} /></SmallButton><SmallButton label={`Sell ${CATALOG[selectedItem.kind].name} for ${money(Math.floor(CATALOG[selectedItem.kind].price * .7))}`} onClick={() => { const result = restaurant.sell(selectedItem.id); action(result); if (!result) setSelected(null); }}><Trash2 size={15} />{money(Math.floor(CATALOG[selectedItem.kind].price * .7))}</SmallButton><button className="grid size-11 place-items-center" aria-label="Deselect furniture" onClick={() => setSelected(null)}><X size={16} /></button></div><FurnitureUpgrade item={selectedItem} cash={state.cash} planning={editable} atMaxAtmosphere={comfort(state) >= 100} onUpgrade={() => guardSpend(`Upgrading this ${CATALOG[selectedItem.kind].name.toLowerCase()}`, furnitureUpgradeCost(selectedItem.kind, selectedItem.level + 1), () => { const result = restaurant.upgradeFurniture(selectedItem.id); action(result); if (!result) toast.success(restaurant.event); })} /></>}
        </section>}
      </div>
      {panel && <aside aria-label={panelNames[panel]} className={cn('paper mx-2 mb-1 mt-1 flex shrink-0 flex-col overflow-hidden lg:mb-2 lg:ml-0 lg:mr-3 lg:mt-2 lg:h-auto lg:w-[320px]', peek ? 'max-lg:h-auto' : panel !== 'team' && panel !== 'menu' ? 'h-[48svh] max-h-[440px] min-h-[220px] lg:max-h-none' : 'h-[40svh] max-h-[400px] min-h-[200px] lg:max-h-none')}><div className="flex shrink-0 items-center justify-between border-b border-ink/10 py-0.5 pl-3.5 pr-1"><div className="min-w-0"><h2 className="truncate text-base leading-tight">{panelNames[panel]}</h2>{panel !== 'menu' && <p data-testid="safe-to-spend" className={cn('text-[10px] font-bold', restaurant.safeToSpend() > 0 ? 'text-ink/60' : 'text-danger')}>Safe to spend <span className="tabular-nums">{money(restaurant.safeToSpend())}</span> · keeps {money(openingReserve)} to open</p>}</div><div className="flex shrink-0 items-center"><button aria-label={peek ? 'Expand panel' : 'Shrink panel'} aria-expanded={!peek} onClick={() => setPeek(value => !value)} className="grid size-11 place-items-center rounded-full hover:bg-ink/5 lg:hidden">{peek ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button><button aria-label="Close panel" onClick={() => setPanel(null)} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-ink/5"><X size={18} /></button></div></div><div ref={panelBody} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 text-sm', peek && 'max-lg:hidden')}>{panel === 'town' ? <TownPanel selected={plot} onSelect={next => { setPlot(next); if (next) focusOn(next); }} region={region} onRegion={id => { setRegion(id); const p = id ? parseRegionId(id) : null; if (p) focusOn(regionCenter(p.x, p.y)); }} onEnterRestaurant={() => { toRestaurant(); setPanel(null); setPlot(null); }} onShop={() => setShop(true)} action={action} /> : panel === 'build' ? <InteriorsPanel state={state} choose={choose} inspect={onSelect} action={action} /> : panel === 'team' ? <TeamPanel state={state} action={action} /> : panel === 'menu' ? <MenuPanel state={state} action={action} /> : <LedgerPanel state={state} action={action} onReport={setReportDay} focusChallenges={focusChallenges} />}</div></aside>}
    </div>
    <footer className="relative z-30 shrink-0 px-2 pb-2 pt-1 sm:px-3"><div className="paper mx-auto flex max-w-[1100px] items-center gap-1 p-1 sm:gap-2">
      <nav aria-label="Restaurant management" className="grid min-w-0 flex-1 grid-cols-5 items-center gap-0.5 sm:flex">{tabs.map(({ id, label, Icon }) => <button key={id} data-tutorial={`${id}-tab`} aria-pressed={id === 'town' ? view === 'town' : panel === id} aria-describedby={id === 'ledger' && rewardsReady ? 'ledger-rewards' : undefined} onClick={() => togglePanel(id)} className={cn('relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-0.5 text-[10px] font-extrabold leading-tight transition sm:flex-none sm:flex-row sm:gap-1.5 sm:px-3 sm:text-xs', (id === 'town' ? view === 'town' : panel === id) ? 'bg-teal text-paper' : 'hover:bg-teal/10')}><Icon size={17} className="shrink-0" /><span>{label}</span>{id === 'ledger' && rewardsReady > 0 && <><span aria-hidden="true" data-testid="ledger-badge" className="absolute right-0.5 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-violet px-1 text-[10px] font-extrabold leading-none text-abyss shadow-[0_0_6px_#A57BFF] sm:-top-1">{rewardsReady}</span><span id="ledger-rewards" hidden>{rewardsReady} {rewardsReady === 1 ? 'reward' : 'rewards'} to collect</span></>}</button>)}</nav>
      <div className="hidden items-center gap-3 border-l border-ink/10 px-2 text-[11px] font-bold xl:flex"><span className="flex items-center gap-1.5"><Armchair size={14} />{capacity(state)} seats</span><span className="flex items-center gap-1.5"><Leaf size={14} />{comfort(state)}% cozy</span></div>
      {state.phase === 'service' ? <div role="status" className="flex min-h-11 shrink-0 flex-col items-end justify-center px-2 text-right leading-tight"><span className="text-[9px] font-extrabold uppercase tracking-wider text-teal">{state.elapsed >= DAY_LENGTH ? 'Last orders' : paused ? 'On hold' : 'Open'}</span><span className="font-display text-sm">{state.totals.served} served</span></div>
      : <button data-tutorial="open-restaurant" aria-label={state.phase === 'report' ? 'Plan next day' : 'Open restaurant'} className="game-button game-button-primary min-h-11 shrink-0 gap-1.5 px-3 py-1 text-sm sm:px-4" onClick={state.phase === 'report' ? () => restaurant.nextDay() : open}><Play size={15} fill="currentColor" aria-hidden="true" />{state.phase === 'report' ? <>Next<span className="hidden sm:inline"> day</span></> : <>Open<span className="hidden sm:inline"> · Day {state.day}</span></>}</button>}
    </div></footer>
    <Dialog open={settings && !restaurant.catchingUp} onOpenChange={setSettings}><DialogContent className="max-h-[85svh] w-[calc(100%-24px)] overflow-y-auto rounded-2xl border-paper bg-paper p-4 text-ink"><DialogTitle className="font-display text-xl">Your restaurant</DialogTitle><DialogDescription>Your team keeps working, even while you are away.</DialogDescription><form onSubmit={form.handleSubmit(values => { restaurant.rename(values.name); toast.success('A lovely name.'); })} className="space-y-2"><label htmlFor="restaurant-name" className="text-sm font-extrabold">Restaurant name</label><div className="flex gap-2"><input id="restaurant-name" {...form.register('name')} className="min-h-11 min-w-0 flex-1 rounded-xl border border-ink/20 bg-ink/[.06] px-3" /><SmallButton onClick={() => void form.handleSubmit(values => { restaurant.rename(values.name); toast.success('Restaurant renamed.'); })()}>Save</SmallButton></div>{form.formState.errors.name && <p className="text-xs text-danger">{form.formState.errors.name.message}</p>}</form><div className="rounded-xl bg-teal/5 p-3 text-xs leading-relaxed text-ink/65"><p className="font-extrabold text-teal">Continuous days · saved locally</p><p className="mt-1">Your team keeps serving while you are away. On return, we calculate service and costs, then save the results. Renovation or insufficient funds holds the next opening.</p><p className="mt-2">Saved in this browser, not the cloud. Clearing site data removes this restaurant. The latest 20 daily receipts stay in Ledger.</p></div><div className="flex items-center justify-between rounded-xl bg-teal/5 p-3"><span className="flex items-center gap-2 text-sm font-bold">{state.music ? <Music2 size={19} /> : <VolumeX size={19} />}Ocean soundtrack</span><Switch checked={state.music} onCheckedChange={value => restaurant.setMusic(value)} aria-label="Ocean soundtrack" /></div><SmallButton onClick={() => { setSettings(false); setHelp(true); }}><CircleHelp size={17} />How to play</SmallButton><p className="text-xs leading-relaxed text-ink/60">Saved automatically in this browser. No account or internet connection is needed for progress after assets load. Clearing browser data removes this save. Reduced-motion preferences are respected.</p>{state.phase === 'service' && <SmallButton onClick={() => { restaurant.closeEarly(); restaurant.pause(false); setSettings(false); }}>Stop new arrivals & finish service</SmallButton>}<div className="border-t border-ink/10 pt-4">{resetConfirm ? <><p className="mb-3 text-sm">Replace this restaurant and all of its progress?</p><div className="flex gap-2"><SmallButton className="bg-danger text-abyss" onClick={() => { restaurant.reset(); setResetConfirm(false); setSettings(false); setPanel(null); setSelected(null); setDraft(null); }}>Yes, start fresh</SmallButton><SmallButton onClick={() => setResetConfirm(false)}>Keep my restaurant</SmallButton></div></> : <button className="min-h-11 text-sm font-extrabold text-danger" onClick={() => setResetConfirm(true)}>Start a new restaurant</button>}</div></DialogContent></Dialog>
    <Dialog open={help && !restaurant.catchingUp} onOpenChange={setHelp}><DialogContent className="max-h-[85svh] w-[calc(100%-24px)] overflow-y-auto rounded-2xl border-paper bg-paper p-4"><DialogTitle className="font-display text-xl">Be the owner.</DialogTitle><DialogDescription>Less running around. More making it your own.</DialogDescription>{[{ title: '1. Make room for good food', text: 'Build opens Interiors. Shop for coral tables with two shell seats, anemones, glow-jelly lanterns and kelp screens using your register cash. In your room lets you select, move or sell existing pieces. You only pay after Confirm; moves are free and sales return 70%. Keep the shown opening reserve for your next service. The grid appears when building or rearranging. Tap a cell to snap furniture into place; dotted gold guides help align rows. Teal outlines fit, red outlines are blocked. Gold rings need a clear aisle. Rotate if needed, then Confirm.', Icon: Hammer }, { title: '2. Put your team to work', text: 'Mareen chefs prepare orders. Servers carry dishes and clear tables. Add equipment before hiring more chefs; train staff for faster service.', Icon: Users }, { title: '3. Open, learn, grow', text: 'Days continue automatically, with a receipt in Ledger after each service. A day lasts about 2½ minutes, plus time for remaining guests. Use Close for renovation in Build to make changes. Away time is counted when you return. All progress is saved in this browser. Watch the bars above your guests: teal means comfortable, gold means growing impatient, and red means urgent. Serving a meal restores satisfaction. Set prices, watch costs and reinvest your profit. Daily challenges in Ledger refresh each service day; gold-star guests and paid meals count toward automatic cash bonuses, including offline. Each day also brings a tide, shown under Daily challenges: a feast tide or passing whale brings more guests, a bloom or shoal makes ingredients cheaper, and strong currents or murky water test your crew. The reef grows dark as the evening goes on.', Icon: TrendingIcon }, { title: '4. Grow your reef town', text: 'Town shows the plots around your restaurant. Unlock a neighbouring plot, then choose what to build: kelp farms and fisheries make ingredients cheaper, Mareen homes add crew slots, glow gardens bring more guests, and workshops speed up construction. Neighbours matter, so check the bonus notes. Building takes real time, also while you are away. One builder works at a time. Current charms skip 15 minutes, Tide charms skip an hour, and pearls finish a job instantly. You get a free charm every day. From the Coral Reef on, claim ocean regions around your town: drag and zoom out to see them. Each biome makes some buildings stronger there, and each region has room for a branch restaurant that earns at every closing. Mastering regions earns lasting fame.', Icon: Castle }].map(({ title, text, Icon }) => <div key={title} className="flex gap-3 rounded-2xl bg-teal/5 p-3"><Icon className="mt-1 size-6 shrink-0 text-teal" /><div><h3 className="text-base">{title}</h3><p className="mt-1 text-sm leading-relaxed text-ink/65">{text}</p></div></div>)}<p className="text-xs text-ink/55">Desktop: R rotates placement, arrow keys move it, Escape cancels. Drag the reef to look around. Touch: use the same on-screen controls.</p><SmallButton className="bg-teal text-paper" onClick={() => setHelp(false)}>Let’s make something wonderful</SmallButton></DialogContent></Dialog>
    <SpendGuardDialog />
    <PremiumShop open={shop && !restaurant.catchingUp} onOpenChange={setShop} />
    {displayedReport && !restaurant.catchingUp && <DailyReport report={displayedReport} previous={state.history[reportIndex - 1]} restaurantName={state.name} closing={false} onInteriors={() => { setReportDay(null); setDraft(null); setSelected(null); setPanel('build'); }} onContinue={() => setReportDay(null)} onClose={() => { setReportDay(null); setFocusChallenges(false); setPanel('ledger'); }} />}
  </main>{restaurant.catchingUp && <div role="status" aria-live="polite" className="fixed inset-0 z-[100] grid place-items-center bg-ink/30 p-6"><div className="paper w-full max-w-sm p-6"><h2 className="text-lg">Catching up with your team</h2><p className="my-3 text-sm text-ink/65">Calculating real service, expenses and daily reports from your time away. Progress is saved along the way.</p><progress aria-label="Offline progress" value={restaurant.catchUpProgress} max={1} /><p className="mt-2 text-xs font-bold text-teal">{Math.floor(restaurant.catchUpProgress * 100)}% · Day {state.day}</p></div></div>}</>;
}
function LevelTag({ level }: { level: number }) {
  const look = lookFor(level);
  return <span data-testid="furniture-level" className="flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 font-body text-xs font-extrabold text-teal"><span className="flex" aria-hidden="true">{[1, 2, 3].map(n => <Star key={n} size={11} className={n <= look ? 'fill-gold text-gold' : 'text-ink/25'} />)}</span>Lv {level}<span className="sr-only"> of {FURNITURE_MAX_LEVEL}</span></span>;
}
/** The selected piece's next upgrade: real cost and effect from the simulation's balance table. */
function FurnitureUpgrade({ item, cash, planning, atMaxAtmosphere, onUpgrade }: { item: Furniture; cash: number; planning: boolean; atMaxAtmosphere: boolean; onUpgrade: () => void }) {
  const max = item.level >= FURNITURE_MAX_LEVEL, cost = max ? 0 : furnitureUpgradeCost(item.kind, item.level + 1), effect = upgradeEffectText(item);
  const reason = max ? 'Already at the highest level.' : !planning ? 'Upgrade between service days.' : cash < cost ? `Need ${money(cost - cash)} more.` : null;
  const newLook = !max && lookFor(item.level + 1) > lookFor(item.level);
  return <div data-testid="furniture-upgrade" className="mt-2 flex items-center gap-2 border-t border-ink/10 pt-2">
    <div className="min-w-0 flex-1"><p className="text-xs font-extrabold text-teal">{max ? 'Fully upgraded' : `Next: ${effect}${atMaxAtmosphere && effect?.includes('atmosphere') ? ' (atmosphere is at 100)' : ''}${newLook ? ' · new look' : ''}`}</p><p role="status" className={cn('text-[11px]', reason && !max ? 'text-danger' : 'text-ink/60')}>{reason ?? 'Instant. Selling refunds 70% of the base price only.'}</p></div>
    <SmallButton className="shrink-0 border-tomato/50 text-tomato" disabled={Boolean(reason)} onClick={onUpgrade} label={max ? 'Fully upgraded' : `Upgrade ${CATALOG[item.kind].name} to level ${item.level + 1} for ${money(cost)}`}><ArrowUp size={16} />{max ? 'Max level' : `Upgrade · ${money(cost)}`}</SmallButton>
  </div>;
}
function CameraButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) { return <button aria-label={label} title={label} onClick={onClick} className="grid size-11 place-items-center rounded-full border border-teal/25 bg-paper/70 text-teal backdrop-blur transition hover:bg-paper active:scale-95">{children}</button>; }
function TrendingIcon({ className }: { className?: string }) { return <ArrowUpRight className={className} />; }
