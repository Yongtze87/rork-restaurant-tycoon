import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Info as InfoIcon, X, type LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface WindowTab<T extends string> { id: T; label: string; badge?: number }

/**
 * A game menu window: full screen on phones, a centred card on larger screens.
 * One title bar, optional tabs, and a scrolling body. The scene stays dimmed behind it.
 */
export function GameWindow<T extends string>({ open, onClose, title, Icon, tabs, tab, onTab, children, footer, wide = false }: {
  open: boolean; onClose: () => void; title: string; Icon: LucideIcon; children: ReactNode;
  tabs?: WindowTab<T>[]; tab?: T; onTab?: (tab: T) => void; footer?: ReactNode; wide?: boolean;
}) {
  return <DialogPrimitive.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-abyss/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content aria-describedby={undefined} className={cn('fixed inset-2 z-50 flex flex-col overflow-hidden rounded-2xl border border-teal/30 bg-paper text-ink shadow-[0_0_0_1px_#A57BFF33,0_24px_60px_#00000080] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(680px,88svh)] sm:w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2', wide ? 'sm:max-w-[760px]' : 'sm:max-w-[560px]')}>
        <div className="flex shrink-0 items-center gap-2 border-b border-ink/10 py-1 pl-3 pr-1">
          <Icon size={18} className="shrink-0 text-teal" aria-hidden="true" />
          <DialogPrimitive.Title className="min-w-0 flex-1 truncate font-display text-lg leading-tight">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-ink/5"><X size={18} /></DialogPrimitive.Close>
        </div>
        {tabs && tab && onTab && <div role="tablist" aria-label={`${title} sections`} className="flex shrink-0 gap-1 overflow-x-auto border-b border-ink/10 px-2 py-1.5">
          {tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)} className={cn('relative flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-extrabold transition', tab === t.id ? 'bg-teal text-paper' : 'text-ink/65 hover:bg-ink/5')}>
            {t.label}{t.badge ? <span className="grid h-4 min-w-4 place-items-center rounded-full bg-violet px-1 text-[10px] leading-none text-abyss">{t.badge}</span> : null}
          </button>)}
        </div>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 text-sm">{children}</div>
        {footer && <div className="shrink-0 border-t border-ink/10 p-2">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

/** A small ⓘ that holds the explanation, so cards can stay short. */
export function Info({ children, label = 'More info' }: { children: ReactNode; label?: string }) {
  return <Popover>
    <PopoverTrigger aria-label={label} className="-m-2 inline-grid size-9 shrink-0 place-items-center rounded-full text-ink/50 hover:text-teal"><InfoIcon size={15} /></PopoverTrigger>
    <PopoverContent className="z-[60] w-72 rounded-xl border-teal/30 bg-paper p-3 text-xs leading-relaxed text-ink/80">{children}</PopoverContent>
  </Popover>;
}

/** A compact stat tile: big number, small label. */
export function Stat({ label, value, tone, testId }: { label: string; value: ReactNode; tone?: 'teal' | 'gold' | 'danger'; testId?: string }) {
  return <div data-testid={testId} className="min-w-0 rounded-xl bg-ink/[.06] px-2.5 py-2"><p className={cn('truncate font-display text-base leading-tight tabular-nums', tone === 'teal' && 'text-teal', tone === 'gold' && 'text-gold', tone === 'danger' && 'text-danger')}>{value}</p><p className="truncate text-[10px] font-bold text-ink/55">{label}</p></div>;
}
