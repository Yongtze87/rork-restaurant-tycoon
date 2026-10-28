import { useContext, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject, type WheelEvent as ReactWheelEvent } from 'react';
import { ZoomContext } from './zoom-context';
import type { ScreenPoint } from './projection';

const DRAG_THRESHOLD = 6;
/** Allowed pan offsets in CSS pixels. */
export interface PanLimits { x0: number; x1: number; y0: number; y1: number; }

/**
 * Drag to look around, tap to act. A press that moves more than a few pixels pans the view
 * and never counts as a tap. The pan is clamped by zoom, or by `limits` (e.g. the extent of a growing world).
 * `viewKey` changes reset the pan. Two fingers pinch to zoom and the mouse wheel zooms, through `ZoomContext`.
 */
export function usePanTap(host: RefObject<HTMLDivElement | null>, zoom: number, viewKey: number, onTap: (point: ScreenPoint) => void, limits?: () => PanLimits | null) {
  const pan = useRef<ScreenPoint>({ x: 0, y: 0 }), drag = useRef<{ id: number; x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const tap = useRef(onTap); tap.current = onTap;
  const bounds = useRef(limits); bounds.current = limits;
  const zoomBy = useContext(ZoomContext), zoomRef = useRef(zoomBy); zoomRef.current = zoomBy;
  // Every finger on the scene; with two, the distance between them drives the zoom.
  const points = useRef(new Map<number, ScreenPoint>()), pinch = useRef<number | null>(null);
  useEffect(() => { pan.current = { x: 0, y: 0 }; }, [viewKey]);
  const local = (event: ReactPointerEvent) => { const rect = host.current!.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      const p = local(event); points.current.set(event.pointerId, p);
      if (points.current.size === 2) { const [a, b] = [...points.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y); if (drag.current) drag.current.moved = true; return; }
      drag.current = { id: event.pointerId, x: p.x, y: p.y, panX: pan.current.x, panY: pan.current.y, moved: false };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic or already-released pointer */ }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (points.current.has(event.pointerId)) points.current.set(event.pointerId, local(event));
      if (pinch.current !== null && points.current.size >= 2) {
        const [a, b] = [...points.current.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current > 0 && dist > 0) zoomRef.current?.(dist / pinch.current); pinch.current = dist; return;
      }
      const d = drag.current; if (!d || d.id !== event.pointerId) return;
      const p = local(event), dx = p.x - d.x, dy = p.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true; const rect = host.current!.getBoundingClientRect(), limitX = rect.width * .5 * zoom, limitY = rect.height * .5 * zoom;
      const l = bounds.current?.() ?? { x0: -limitX, x1: limitX, y0: -limitY, y1: limitY };
      pan.current = { x: Math.max(l.x0, Math.min(l.x1, d.panX + dx)), y: Math.max(l.y0, Math.min(l.y1, d.panY + dy)) };
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      points.current.delete(event.pointerId);
      if (pinch.current !== null) { if (points.current.size < 2) pinch.current = null; drag.current = null; return; }
      const d = drag.current; drag.current = null; if (d && !d.moved) tap.current(local(event));
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => { points.current.delete(event.pointerId); if (points.current.size < 2) pinch.current = null; drag.current = null; },
    onWheel: (event: ReactWheelEvent<HTMLDivElement>) => { if (event.deltaY) zoomRef.current?.(Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * .0015)); },
  };
  return { pan, handlers };
}
