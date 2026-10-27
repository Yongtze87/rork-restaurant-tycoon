import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { ScreenPoint } from './projection';

const DRAG_THRESHOLD = 6;

/**
 * Drag to look around, tap to act. A press that moves more than a few pixels pans the view
 * (clamped by zoom) and never counts as a tap. `viewKey` changes reset the pan.
 */
export function usePanTap(host: RefObject<HTMLDivElement | null>, zoom: number, viewKey: number, onTap: (point: ScreenPoint) => void) {
  const pan = useRef<ScreenPoint>({ x: 0, y: 0 }), drag = useRef<{ id: number; x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const tap = useRef(onTap); tap.current = onTap;
  useEffect(() => { pan.current = { x: 0, y: 0 }; }, [viewKey]);
  const local = (event: ReactPointerEvent) => { const rect = host.current!.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      const p = local(event); drag.current = { id: event.pointerId, x: p.x, y: p.y, panX: pan.current.x, panY: pan.current.y, moved: false };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic or already-released pointer */ }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current; if (!d || d.id !== event.pointerId) return;
      const p = local(event), dx = p.x - d.x, dy = p.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true; const rect = host.current!.getBoundingClientRect(), limitX = rect.width * .5 * zoom, limitY = rect.height * .5 * zoom;
      pan.current = { x: Math.max(-limitX, Math.min(limitX, d.panX + dx)), y: Math.max(-limitY, Math.min(limitY, d.panY + dy)) };
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => { const d = drag.current; drag.current = null; if (d && !d.moved) tap.current(local(event)); },
    onPointerCancel: () => { drag.current = null; },
  };
  return { pan, handlers };
}
