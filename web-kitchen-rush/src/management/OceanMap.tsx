import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDownToLine, Check, CloudFog, Flame, House, Landmark, Leaf, LockKeyhole, MapPinned, Snowflake, Sparkles, Star, TreePalm, Waves, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { BIOMES, PALETTES, coloniesFounded, currentColony, describeModifiers, fameBonuses, fameText, FOUNDING_KEEPS, FOUNDING_RESETS, mapBounds, regionAt, regionId, regionStatus, pendingFame, type BiomeId, type Region, type RegionStatus } from './ocean';
import { SmallButton } from './Panels';
import { money } from './format';

const ICONS: Record<BiomeId, typeof Leaf> = { home: House, kelp: Leaf, vents: Flame, ice: Snowflake, atoll: TreePalm, sunken: Landmark, trench: ArrowDownToLine, lagoon: Waves };
const STATUS: Record<RegionStatus, string> = { current: 'your colony', explored: 'explored', foundable: 'can be founded', fog: 'unexplored' };
function Stars({ n }: { n: number }) {
  return <span className="inline-flex" aria-hidden="true">{[1, 2, 3, 4, 5].map(i => <Star key={i} size={11} className={i <= n ? 'fill-gold text-gold' : 'text-ink/25'} />)}</span>;
}

/** The Ocean map: explored, foundable and fogged regions, with details and the founding flow. */
export function OceanMap({ open, onOpenChange, onFounded }: { open: boolean; onOpenChange: (open: boolean) => void; onFounded?: () => void }) {
  const state = restaurant.state, ocean = state.ocean, colony = currentColony(ocean), b = mapBounds(ocean), columns = b.x1 - b.x0 + 1;
  const [selected, setSelected] = useState<string>(colony.region), [confirming, setConfirming] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setSelected(currentColony(restaurant.state.ocean).region); setConfirming(false); } }, [open]);
  const cells: { region: Region; status: RegionStatus }[] = [];
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) { const id = regionId(x, y); cells.push({ region: regionAt(x, y), status: regionStatus(ocean, id) }); }
  const pick = cells.find(c => c.region.id === selected) ?? cells.find(c => c.status === 'current')!;
  const region = pick.region, known = pick.status !== 'fog', error = restaurant.foundingError(region.id), effects = describeModifiers(region.modifiers);
  const record = ocean.colonies.find(c => c.region === region.id), now = fameBonuses(ocean.fame), after = fameBonuses(ocean.fame + pendingFame(ocean) + region.fame);
  const locked = !state.town.zones.includes('abyss');
  // Arrow keys move between regions; Tab leaves the grid.
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key]; if (!step) return;
    const index = cells.findIndex(c => c.region.id === pick.region.id), next = cells[index + step];
    if (!next || (Math.abs(step) === 1 && Math.floor(index / columns) !== Math.floor((index + step) / columns))) return;
    event.preventDefault(); setSelected(next.region.id); setConfirming(false);
    grid.current?.querySelector<HTMLButtonElement>(`[data-region="${next.region.id}"]`)?.focus();
  };
  const found = () => {
    const result = restaurant.foundColony(region.id);
    if (result) { toast.error(result); return; }
    toast.success(restaurant.event); setConfirming(false); onOpenChange(false); onFounded?.();
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90svh] w-[calc(100%-24px)] max-w-3xl overflow-y-auto overflow-x-hidden rounded-3xl border-teal/30 bg-paper p-4 text-ink sm:p-6">
    <div className="min-w-0 pr-8">
      <DialogTitle className="font-display text-3xl">The Ocean</DialogTitle>
      <DialogDescription className="text-ink/65">Colony {ocean.colonies.length} · {colony.name} · {BIOMES[restaurant.region().biome].name}. {coloniesFounded(ocean)} {coloniesFounded(ocean) === 1 ? 'colony' : 'colonies'} founded.</DialogDescription>
    </div>
    <div className="grid min-w-0 grid-cols-2 gap-2 text-[11px] font-bold sm:grid-cols-[auto_1fr]">
      <p className="flex items-center gap-1.5 rounded-xl bg-gold/15 px-3 py-2"><Sparkles size={14} className="text-gold" aria-hidden="true" />{ocean.fame} fame</p>
      <p className="col-span-2 rounded-xl bg-ink/[.06] px-3 py-2 sm:col-span-1">{ocean.fame ? `Fame bonus: ${fameText(now)}` : 'Fame grows with every colony you found. It makes every new start faster.'}</p>
    </div>
    {locked && <p role="status" className="flex items-start gap-2 rounded-xl border border-gold/40 bg-gold/10 p-3 text-xs font-bold"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />Reach the Abyss in {colony.name} to found a new colony. You can look around until then.</p>}
    <div ref={grid} role="group" aria-label="Ocean regions" onKeyDown={move} className="min-w-0 overflow-x-auto overscroll-contain rounded-2xl bg-abyss/90 p-1.5">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(44px, 1fr))` }}>
        {cells.map(({ region: r, status }) => {
          const Icon = status === 'fog' ? CloudFog : ICONS[r.biome], palette = PALETTES[r.biome], active = r.id === pick.region.id;
          return <button key={r.id} type="button" data-region={r.id} tabIndex={active ? 0 : -1} aria-pressed={active}
            aria-label={status === 'fog' ? `Unexplored waters (${r.id})` : `${r.name}, ${BIOMES[r.biome].name}, ${r.stars} of 5 stars, ${STATUS[status]}`}
            onClick={() => { setSelected(r.id); setConfirming(false); }}
            style={status === 'fog' ? undefined : { background: `linear-gradient(160deg, ${palette.water[0]}, ${palette.water[1]} 60%, ${palette.sand})` }}
            className={cn('relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl p-1 text-center text-[10px] font-extrabold leading-tight transition sm:min-h-[72px]',
              status === 'fog' ? 'bg-ink/20 text-paper/40' : 'text-abyss', status === 'foundable' && 'ring-2 ring-inset ring-teal/80', status === 'current' && 'ring-2 ring-inset ring-gold', status === 'explored' && 'opacity-80',
              active && 'outline outline-2 outline-offset-1 outline-paper')}>
            <Icon size={16} aria-hidden="true" />
            {status !== 'fog' && <><span className="hidden w-full truncate sm:block">{r.name}</span><span className="hidden sm:block"><Stars n={r.stars} /></span></>}
            {status === 'current' && <MapPinned size={12} className="absolute right-0.5 top-0.5 text-tomato" aria-hidden="true" />}
          </button>;
        })}
      </div>
    </div>
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-ink/60"><span className="flex items-center gap-1"><span className="size-2.5 rounded-sm ring-2 ring-gold" />Your colony</span><span className="flex items-center gap-1"><span className="size-2.5 rounded-sm ring-2 ring-teal" />Can be founded</span><span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-ink/30" />Unexplored</span><span>Arrow keys move between regions.</span></p>
    <section aria-label="Region details" className="min-w-0 rounded-2xl border border-ink/10 bg-ink/[.04] p-3 sm:p-4">
      {!known ? <><h3 className="text-xl">Unexplored waters</h3><p className="mt-1 text-xs text-ink/65">Found a colony next to these waters to explore them.</p></> : <>
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-xl leading-tight">{region.name}</h3><p className="text-xs text-ink/60">{BIOMES[region.biome].name} · {STATUS[pick.status]}</p></div>
          <p className="flex items-center gap-1.5 text-xs font-extrabold" aria-label={`Difficulty ${region.stars} of 5`}><Stars n={region.stars} /><span className="text-ink/60">Difficulty</span></p></div>
        <p className="mt-1 text-xs text-ink/65">{BIOMES[region.biome].description}</p>
        {region.biome !== 'home' && <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
          <ul aria-label="Upsides" className="space-y-0.5">{effects.upsides.map(t => <li key={t} className="flex items-center gap-1.5 font-bold text-teal"><Check size={13} aria-hidden="true" />{t}</li>)}</ul>
          <ul aria-label="Downsides" className="space-y-0.5">{effects.downsides.map(t => <li key={t} className="flex items-center gap-1.5 font-bold text-danger"><X size={13} aria-hidden="true" />{t}</li>)}</ul>
        </div>}
        {record && <p className="mt-2 text-[11px] font-bold text-ink/65">{pick.status === 'current' ? `Colony ${ocean.colonies.indexOf(record) + 1} · ${state.day - 1} service days · ${state.lifetimeServed - record.startServed} guests served so far` : `Colony ${ocean.colonies.indexOf(record) + 1} · ${record.days} service days · ${record.served.toLocaleString('en-US')} guests served · +${record.fame} fame`}</p>}
        {pick.status === 'current' && pendingFame(ocean) > 0 && <p className="mt-2 rounded-xl bg-gold/15 p-2 text-[11px] font-bold">Reaching the Abyss here earns +{pendingFame(ocean)} fame.</p>}
        {pick.status === 'foundable' && <>
          <p className="mt-2 rounded-xl bg-gold/15 p-2 text-[11px] font-bold">Founding here earns +{region.fame} fame when this colony reaches its Abyss. Your fame bonus then: {fameText(after)}</p>
          {!confirming ? <SmallButton className="mt-2 w-full bg-tomato text-paper" disabled={Boolean(error)} onClick={() => setConfirming(true)}><MapPinned size={15} />{error ? 'Locked' : `Found a colony in ${region.name}`}</SmallButton>
            : <div role="group" aria-label="Confirm founding" ref={el => el?.scrollIntoView?.({ block: 'nearest' })} className="mt-2 rounded-xl border border-tomato/50 bg-tomato/10 p-3">
              <p className="font-display text-lg leading-tight">Start over in {region.name}?</p>
              <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
                <div><p className="font-extrabold text-teal">You keep</p><ul aria-label="Kept" className="mt-0.5 list-disc space-y-0.5 pl-4">{FOUNDING_KEEPS.map(t => <li key={t}>{t}</li>)}</ul></div>
                <div><p className="font-extrabold text-danger">Starts fresh</p><ul aria-label="Reset" className="mt-0.5 list-disc space-y-0.5 pl-4">{FOUNDING_RESETS.map(t => <li key={t}>{t}</li>)}</ul></div>
              </div>
              <p className="mt-2 text-[11px] font-bold">Starting cash: {money(restaurant.startingCash())}</p>
              <div className="mt-2 flex flex-wrap gap-2"><SmallButton className="flex-1 bg-tomato text-paper" onClick={found}>Yes, found {region.name}</SmallButton><SmallButton className="flex-1" onClick={() => setConfirming(false)}>Not yet</SmallButton></div>
            </div>}
          {error && <p className="mt-1 text-[11px] font-bold text-danger">{error}</p>}
        </>}
      </>}
    </section>
  </DialogContent></Dialog>;
}
