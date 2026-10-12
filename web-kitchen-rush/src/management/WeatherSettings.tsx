import { CloudRain, RefreshCw, Sun, Sunset } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WEATHER_LABELS, type WeatherKind, type WeatherMode } from './weather';

const icons = { auto: RefreshCw, sunset: Sunset, sun: Sun, rain: CloudRain };

/** Explicit scenery-only controls, with native radio keyboard and screen-reader behavior. */
export function WeatherSettings({ mode, onChange }: { mode: WeatherMode; onChange: (mode: WeatherMode) => void }) {
  return <fieldset className="rounded-2xl border border-ink/10 p-3">
    <legend className="px-1 text-sm font-extrabold">City weather</legend>
    <div className="grid grid-cols-2 gap-2">{(['auto', 'sunset', 'sun', 'rain'] as const).map(value => {
      const Icon = icons[value];
      return <label key={value} className="relative cursor-pointer">
        <input className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0" type="radio" name="city-weather" value={value} checked={mode === value} onChange={() => onChange(value)} />
        <span className={cn('flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold', mode === value ? 'border-teal bg-teal text-paper' : 'border-ink/10 bg-white/30 text-ink hover:bg-teal/5')}><Icon size={17} aria-hidden="true" />{WEATHER_LABELS[value]}</span>
      </label>;
    })}</div>
    <p className="mt-2 text-[11px] leading-relaxed text-ink/60">Just a change of scenery — no effect on service or earnings. Auto changes gradually; reduced motion keeps the weather still. Applies to this visit.</p>
  </fieldset>;
}

/** A quiet weather caption alongside the existing save status, not another scene overlay. */
export function WeatherReadout({ kind }: { kind: WeatherKind }) {
  const Icon = icons[kind];
  return <span className="flex shrink-0 items-center gap-1.5" data-testid="weather-readout"><Icon size={14} aria-hidden="true" />{WEATHER_LABELS[kind]}</span>;
}
