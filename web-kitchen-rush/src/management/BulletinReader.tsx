import { useEffect, useState, useSyncExternalStore } from 'react';
import { Radio, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { restaurant, type RestaurantEngine } from './engine';
import { readBulletin } from './bulletin';

/** An accessible close-up of the street display; live data without changing service or camera state. */
export function BulletinReader({ engine = restaurant }: { engine?: RestaurantEngine }) {
  useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [open, setOpen] = useState<boolean>(false);
  const state = engine.state, data = readBulletin(state, engine.paused);
  useEffect(() => { setOpen(false); }, [state]);
  return <Dialog open={open && !engine.catchingUp} onOpenChange={setOpen}>
    <DialogTrigger asChild><button aria-label="Read street bulletin" title="Read street bulletin" className="grid size-11 place-items-center rounded-xl border border-paper/60 bg-paper/85 text-teal shadow-sm transition hover:bg-paper active:scale-95"><Radio size={18} /></button></DialogTrigger>
    <DialogContent className="max-h-[85svh] w-[calc(100%-24px)] max-w-md overflow-y-auto rounded-3xl border-paper bg-paper p-5 text-ink sm:p-6">
      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-teal"><Radio size={17} />Neighborhood live · Day {data.day}</div>
      <DialogTitle className="font-display text-3xl">Street bulletin</DialogTitle>
      <DialogDescription>{data.name} · {data.status.toLowerCase()}. Updates from the corner by the park.</DialogDescription>
      <div className="flex items-center gap-4 rounded-2xl bg-teal p-5 text-paper"><Users size={30} className="text-gold" /><div><p className="font-display text-5xl tabular-nums" data-testid="bulletin-count">{data.guests}</p><p className="text-sm font-bold">Guests now</p></div><p className="ml-auto max-w-[150px] text-xs leading-relaxed text-paper/80">{data.seated} seated<br />Includes arrivals & departures. Excludes street and park visitors.</p></div>
      <ul className="space-y-3" aria-label="Restaurant announcements">{data.notices.map(notice => <li key={notice.id} className="rounded-2xl border border-teal/10 bg-teal/5 p-4"><p className="text-[10px] font-extrabold uppercase tracking-widest text-teal">{notice.label}</p><h3 className="mt-1 font-display text-xl">{notice.title}</h3><p className="mt-1 text-sm text-ink/70">{notice.detail}</p></li>)}</ul>
      <p className="text-xs text-ink/60">Read-only updates. Service continues unless you pause it.</p>
    </DialogContent>
  </Dialog>;
}
