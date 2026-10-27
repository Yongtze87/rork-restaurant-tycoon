import { Component, useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { CATALOG, HEIGHT, width, type Furniture, type Point, type RestaurantState } from './types';
import { restaurant } from './engine';
import { placementError } from './layout';
import { RestaurantLabels } from './RestaurantLabels';
import { positionLabels } from './label-layout';
import { createAmbience, stepAmbience } from './iso/ambience';
import { cellAt, fitView, type View } from './iso/projection';
import { usePanTap } from './iso/use-pan-tap';
import { furnitureAt, renderFrame, type HitBox, type Tracked } from './iso/render';

interface SceneProps { state: RestaurantState; building: boolean; draft: Furniture | null; selected: number | null; zoom: number; viewKey?: number; onTile: (point: Point) => void; onSelect: (id: number) => void; }
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { restaurant.pause(true); }
  render() { return this.state.failed ? <div className="flex h-full items-center justify-center p-6"><div className="paper max-w-sm p-6 text-center"><h2 className="text-2xl">Let’s resurface for a moment</h2><p className="my-3">The reef view could not be drawn. Your saved restaurant is safe.</p><button className="game-button mx-auto" onClick={() => window.location.reload()}>Reload</button></div></div> : this.props.children; }
}
/** 2.5D isometric reef view on a 2D canvas. Drawing reads the engine; only taps call back out. */
export default function RestaurantScene(props: SceneProps) {
  const { state, zoom, viewKey = 0 } = props;
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props); latest.current = props;
  const labels = useRef<Map<string, HTMLDivElement>>(new Map());
  const view = useRef<View | null>(null), hits = useRef<HitBox[]>([]);
  const reduced = useReducedMotionQuery();
  const { pan, handlers } = usePanTap(host, zoom, viewKey, p => {
    if (!view.current) return;
    const { building, draft, onTile, onSelect } = latest.current, s = restaurant.state;
    const id = furnitureAt(hits.current, p.x, p.y), cell = cellAt(view.current, p.x, p.y, width(s), HEIGHT);
    if (draft) { if (cell) onTile(cell); return; }
    const tapped = id ?? (cell ? s.furniture.find(item => cell.x >= item.x && cell.z >= item.z && cell.x < item.x + CATALOG[item.kind].size && cell.z < item.z + CATALOG[item.kind].size)?.id : undefined);
    if (tapped !== undefined) onSelect(tapped); else if (building && cell) onTile(cell);
  });
  useEffect(() => {
    const element = canvas.current, ctx = element?.getContext('2d'); if (!element || !ctx) return;
    const ambience = createAmbience(), tracked = new Map<string, Tracked>();
    let frame = 0, last = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(.25, (now - last) / 1000); last = now;
      restaurant.update(dt); // whichever view is showing drives the simulation
      const rect = element.getBoundingClientRect(), w = rect.width, h = rect.height; if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (element.width !== Math.round(w * dpr) || element.height !== Math.round(h * dpr)) { element.width = Math.round(w * dpr); element.height = Math.round(h * dpr); }
      const p = latest.current, s = restaurant.state, columns = width(s), motionless = reduced.matches;
      if (!motionless) stepAmbience(ambience, dt);
      const v = fitView(w, h, columns, HEIGHT, p.zoom, pan.current); view.current = v;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const out = renderFrame(ctx, { state: s, view: v, width: w, height: h, columns, windowTop: rect.top, windowHeight: window.innerHeight, time: now / 1000, ambience, reduced: motionless, building: p.building, draft: p.draft, draftValid: p.draft ? !placementError(s, p.draft) : false, selected: p.selected, tracked }, dt);
      hits.current = out.hits; positionLabels(labels.current, out.anchors);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reduced, pan]);
  return <SceneBoundary><div ref={host} className="relative h-full w-full touch-none select-none" data-testid="reef-view" {...handlers}>
    <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label={`${state.name}: an underwater restaurant with ${state.guests.length} guests and ${state.staff.length} crew. Use the Build panel and on-screen controls to place furniture.`} />
    <RestaurantLabels state={state} labels={labels} receipts={restaurant.incomeReceipts} paused={restaurant.paused} speed={restaurant.speed} />
  </div></SceneBoundary>;
}
