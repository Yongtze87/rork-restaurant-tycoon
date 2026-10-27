import { Gem, Hammer, Waves } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { restaurant } from './engine';
import { CHARMS, MAX_BUILDERS, PEARL_PACKS, SHOP } from './town';
import { SmallButton } from './Panels';

/** Pearl shop. Items bought with earned pearls work now; real-money packs wait for a payment provider. */
export function PremiumShop({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const town = restaurant.state.town;
  const buy = (item: keyof typeof SHOP) => { const error = restaurant.buy(item); if (error) toast.error(error); else toast.success(`${SHOP[item].name} added.`); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85svh] w-[calc(100%-24px)] overflow-y-auto rounded-2xl border-teal/30 bg-paper p-4 text-ink">
    <DialogTitle className="font-display text-xl">Pearl shop</DialogTitle>
    <DialogDescription>Speed up building and grow faster. Everything here can also be earned by playing.</DialogDescription>
    <div className="grid grid-cols-3 gap-2 text-center" data-testid="wallet">
      <div className="rounded-2xl bg-violet/15 p-3"><Gem className="mx-auto text-violet" aria-hidden="true" /><p className="font-display text-lg tabular-nums">{town.pearls}</p><p className="text-[11px] text-ink/60">pearls</p></div>
      <div className="rounded-2xl bg-ink/[.06] p-3"><Waves className="mx-auto text-teal" aria-hidden="true" /><p className="font-display text-lg tabular-nums">{town.charms.current}</p><p className="text-[11px] text-ink/60">Current charms · −15 min</p></div>
      <div className="rounded-2xl bg-ink/[.06] p-3"><Waves className="mx-auto text-gold" aria-hidden="true" /><p className="font-display text-lg tabular-nums">{town.charms.tide}</p><p className="text-[11px] text-ink/60">Tide charms · −1 hour</p></div>
    </div>
    <h3 className="text-base">Spend pearls</h3>
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-ink/[.06] p-3"><Hammer className="shrink-0 text-teal" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="font-bold">{SHOP.builder.name}</p><p className="text-[11px] text-ink/60">Build or upgrade two things at once. Permanent.</p></div><SmallButton disabled={town.builders >= MAX_BUILDERS || town.pearls < SHOP.builder.pearls} onClick={() => buy('builder')}>{town.builders >= MAX_BUILDERS ? 'Owned' : <><Gem size={14} />{SHOP.builder.pearls}</>}</SmallButton></div>
      <div className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-ink/[.06] p-3"><Waves className="shrink-0 text-teal" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="font-bold">{SHOP.charms.name}</p><p className="text-[11px] text-ink/60">Each skips {CHARMS.current.seconds / 60} minutes of building.</p></div><SmallButton disabled={town.pearls < SHOP.charms.pearls} onClick={() => buy('charms')}><Gem size={14} />{SHOP.charms.pearls}</SmallButton></div>
    </div>
    <h3 className="text-base">Get pearls</h3>
    <div className="grid grid-cols-3 gap-2">{PEARL_PACKS.map(pack => <div key={pack.pearls} className="rounded-2xl border border-violet/30 bg-violet/10 p-3 text-center"><p className="font-display text-base tabular-nums">{pack.pearls}</p><p className="text-[11px] text-ink/60">pearls</p><p className="mt-1 text-xs font-extrabold">{pack.price}</p></div>)}</div>
    <p className="rounded-xl bg-gold/10 p-3 text-xs leading-relaxed text-ink/75">Pearl packs can’t be bought yet. They open once the game launches in a store. Until then, earn pearls from milestones, Ledger → Collection achievements and by finishing all three daily challenges. You also get a free Current charm every day.</p>
  </DialogContent></Dialog>;
}
