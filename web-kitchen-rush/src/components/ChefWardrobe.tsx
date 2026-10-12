import { useState, useSyncExternalStore } from 'react';
import { Check, ChefHat, Palette, RotateCcw, ShieldCheck } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { engine } from '@/game/engine';
import { isOutfitColor, OUTFIT_COLORS, outfitColor, type ChefOutfit, type OutfitColor, type OutfitPart } from '@/game/chef-outfit';
import { ChefPreview } from '@/scene/ChefPreview';
import { cn } from '@/lib/utils';

interface OutfitPickerProps { outfit: ChefOutfit; onChange: (part: OutfitPart, color: OutfitColor) => void; }
/** Labeled, keyboard-accessible palettes; selected state never depends on color alone. */
export function OutfitPicker({ outfit, onChange }: OutfitPickerProps) {
  return <div className="space-y-5">{(['hat', 'apron'] as const).map(part => <fieldset key={part}>
    <legend className="mb-2 flex w-full items-center justify-between gap-3"><span className="font-display text-xl">{part === 'hat' ? 'Chef’s hat' : 'Apron'}</span><span className="text-xs font-extrabold text-ink/60">{outfitColor(outfit[part]).name}</span></legend>
    <RadioGroup aria-label={part === 'hat' ? 'Hat color' : 'Apron color'} value={outfit[part]} onValueChange={color => { if (isOutfitColor(color)) onChange(part, color); }} className="grid grid-cols-6 gap-1.5 max-[359px]:grid-cols-3">
      {OUTFIT_COLORS.map(color => <label key={color.id} className="flex cursor-pointer flex-col items-center gap-1.5">
        <span className="relative flex size-11 items-center justify-center">
          <RadioGroupItem value={color.id} aria-label={color.name} className={cn('size-11 border-2 border-ink/15 shadow-sm transition-transform duration-150 hover:scale-105 focus-visible:ring-gold focus-visible:ring-offset-paper [&>span]:hidden motion-reduce:transition-none', color.swatch, outfit[part] === color.id && 'border-ink ring-2 ring-ink ring-offset-2 ring-offset-paper')} />
          {outfit[part] === color.id && <Check aria-hidden="true" className={cn('pointer-events-none absolute size-5', color.id === 'tomato' || color.id === 'dusk' ? 'text-paper' : 'text-ink')} strokeWidth={3} />}
        </span><span className="text-[10px] font-extrabold text-ink/75">{color.name}</span>
      </label>)}
    </RadioGroup>
  </fieldset>)}</div>;
}

/** Character selection for cosmetic editing, with immediate per-player persistence. */
export function ChefWardrobe({ className }: { className?: string }) {
  const [open, setOpen] = useState<boolean>(false);
  const [player, setPlayer] = useState<0 | 1>(0);
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const outfit = state.outfits[player];
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button className={cn('game-button min-h-11 text-base', className)}><Palette className="size-5" />Your chefs<span className="ml-auto flex gap-1" aria-hidden="true"><span className={cn('size-3 rounded-full border border-ink/20', outfitColor(state.outfits[0].hat).swatch)} /><span className={cn('size-3 rounded-full border border-ink/20', outfitColor(state.outfits[1].hat).swatch)} /></span></button></DialogTrigger>
    <DialogContent className="paper max-h-[92svh] w-[calc(100%-24px)] max-w-[760px] gap-0 overflow-y-auto p-4 sm:p-6 [&>button]:right-3 [&>button]:top-3 [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center">
      <header className="mb-4 pr-10"><p className="mb-1 text-[10px] font-extrabold tracking-[.2em] text-tomato">THE ROOFTOP CREW</p><DialogTitle className="font-display text-3xl">A little more you.</DialogTitle><DialogDescription className="mt-2 font-bold text-ink/65">Pick a chef. Mix your colors. Make it your shift.</DialogDescription></header>
      <RadioGroup value={String(player)} onValueChange={value => setPlayer(value === '1' ? 1 : 0)} aria-label="Choose chef to customize" className="mb-4 grid grid-cols-2 gap-3">
        {([0, 1] as const).map(id => <label key={id} className={cn('relative flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 [&>span]:pointer-events-none [&>svg]:pointer-events-none', player === id ? 'border-teal bg-teal/10' : 'border-ink/10 bg-ink/5')}>
          <RadioGroupItem value={String(id)} aria-label={`Chef ${id + 1} ${id === 0 ? 'Crocodile' : 'Mouse'}`} className="absolute inset-0 h-full w-full rounded-xl border-0 focus-visible:ring-gold [&>span]:hidden" />
          <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full font-display text-lg text-paper', id === 0 ? 'bg-tomato' : 'bg-[#3B9C98]')}>{id + 1}</span>
          <span aria-hidden="true"><span className="block font-display text-lg leading-tight">{id === 0 ? 'Crocodile' : 'Mouse'}</span><span className="text-[10px] font-extrabold text-ink/55">{id === 1 && state.mode === 'solo' ? 'CO-OP CHEF' : `PLAYER ${id + 1}`}</span></span>
          {player === id && <Check aria-hidden="true" className="ml-auto size-4 shrink-0 text-teal" />}
        </label>)}
      </RadioGroup>
      <div className="grid gap-5 sm:grid-cols-[.85fr_1fr]">
        <section className="relative overflow-hidden rounded-2xl border border-ink/10 bg-teal" aria-label="Outfit preview">
          <div className="absolute left-4 top-3 flex items-center gap-1.5 text-[10px] font-extrabold tracking-widest text-paper/70"><ChefHat className="size-3.5" />CHEF {player + 1}</div>
          {open && <ChefPreview id={player} outfit={outfit} />}
          <p className="pb-3 text-center text-[10px] font-extrabold tracking-widest text-paper/65">YOUR LOOK, IN THE KITCHEN</p>
        </section>
        <section className="flex flex-col justify-center gap-5" aria-label={`Chef ${player + 1} outfit`}>
          <OutfitPicker outfit={outfit} onChange={(part, color) => engine.setOutfitColor(player, part, color)} />
          <button onClick={() => engine.resetOutfit(player)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ink/15 text-sm font-extrabold text-ink/65 hover:bg-ink/5"><RotateCcw className="size-4" />Reset Chef {player + 1} colors</button>
          <p className="text-xs font-bold leading-relaxed text-ink/60">Your player number, scarf and hat band stay the same, so your teammate can always spot you.</p>
        </section>
      </div>
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink/15 pt-4">
        <p role="status" className={cn('flex max-w-[280px] items-start gap-2 text-xs font-bold', state.outfitSaveFailed ? 'text-tomato' : 'text-ink/60')}><ShieldCheck className="mt-0.5 size-4 shrink-0" />{state.outfitSaveFailed ? 'Colors applied for this session. Browser storage is unavailable; choose a color again to retry saving.' : 'Applied instantly. Colors save on this browser.'}</p>
        <DialogClose asChild><button className="game-button game-button-primary min-h-11 flex-1 text-lg sm:flex-none"><Check className="size-5" />Done</button></DialogClose>
      </footer>
    </DialogContent>
  </Dialog>;
}
