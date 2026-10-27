import { CloudFog, Fish, Sprout, UtensilsCrossed, Waves, Wind, type LucideProps } from 'lucide-react';
import { TIDES, tideEffectText, type TideKind } from './tides';

const icons: Record<TideKind, typeof Waves> = { calm: Waves, feast: UtensilsCrossed, current: Wind, whale: Fish, plankton: Sprout, shoal: Fish, murky: CloudFog };
export function TideIcon({ tide, ...props }: { tide: TideKind } & LucideProps) { const Icon = icons[tide]; return <Icon aria-hidden="true" {...props} />; }

/** Today's ocean event: name and effect, both from the tide catalog the engine applies. */
export function TideCard({ tide, day }: { tide: TideKind; day: number }) {
  const info = TIDES[tide], effect = tideEffectText(tide);
  return <div data-testid="tide-card" data-tutorial="tide" role="group" aria-label={`Day ${day} tide: ${info.name}. ${effect}.`} title={info.description} className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-0.5">
    <TideIcon tide={tide} size={16} className="shrink-0 text-violet" />
    <span className="min-w-0 flex-1 text-[11px] leading-tight"><strong className="block">{info.name} <span className="font-semibold text-ink/60">· today’s tide</span></strong><span className="text-ink/60">{effect}</span></span>
  </div>;
}
