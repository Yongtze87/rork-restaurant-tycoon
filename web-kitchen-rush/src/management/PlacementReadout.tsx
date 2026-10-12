import { Check, Grid2X2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATALOG, type Furniture } from './types';

/** Text equivalents for grid position, full footprint and the scene's placement colors. */
export function PlacementReadout({ item, error }: { item: Furniture; error: string | null }) {
  const size = CATALOG[item.kind].size;
  return <div data-testid="placement-grid-readout" className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-ink/5 px-2 py-1.5 text-[10px] font-extrabold sm:text-xs">
    <span className="flex items-center gap-1.5"><Grid2X2 size={13} aria-hidden="true" />Grid snap · {size} × {size}</span>
    <span className="tabular-nums" aria-label={`Column ${item.x + 1}, row ${item.z + 1}`}>Col {item.x + 1} · Row {item.z + 1}</span>
    <span className={cn('flex items-center gap-1', error ? 'text-tomato' : 'text-teal')}>{error ? <X size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}{error ? 'Blocked' : 'Fits here'}</span>
  </div>;
}
