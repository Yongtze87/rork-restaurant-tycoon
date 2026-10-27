import { useEffect, useRef } from 'react';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { restaurant } from './engine';
import { SceneBoundary } from './RestaurantScene';
import { TOWN_SIZE } from './town';
import { sceneNight } from './light';
import { createAmbience, stepAmbience } from './iso/ambience';
import { cellAt, fitView, type View } from './iso/projection';
import { renderTown } from './iso/town-render';
import { biomeOf } from './iso/render';
import { usePanTap } from './iso/use-pan-tap';

interface TownSceneProps { selected: { x: number; z: number } | null; zoom: number; viewKey?: number; onPlot: (plot: { x: number; z: number }) => void; }

/** The reef town map: plots around the restaurant. Drawing reads the engine; taps select a plot. */
export default function TownScene(props: TownSceneProps) {
  const { zoom, viewKey = 0 } = props;
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), view = useRef<View | null>(null);
  const latest = useRef(props); latest.current = props;
  const reduced = useReducedMotionQuery();
  const { pan, handlers } = usePanTap(host, zoom, viewKey, p => {
    const plot = view.current && cellAt(view.current, p.x, p.y, TOWN_SIZE, TOWN_SIZE);
    if (plot) latest.current.onPlot(plot);
  });
  useEffect(() => {
    const element = canvas.current, ctx = element?.getContext('2d'); if (!element || !ctx) return;
    const ambience = createAmbience(91);
    let frame = 0, last = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(.25, (now - last) / 1000); last = now;
      restaurant.update(dt); // whichever view is showing drives the simulation
      const rect = element.getBoundingClientRect(), w = rect.width, h = rect.height; if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (element.width !== Math.round(w * dpr) || element.height !== Math.round(h * dpr)) { element.width = Math.round(w * dpr); element.height = Math.round(h * dpr); }
      if (!reduced.matches) stepAmbience(ambience, dt);
      // Narrow phones start closer in; the outer rings are a drag away.
      const v = fitView(w, h, TOWN_SIZE, TOWN_SIZE, latest.current.zoom * (w < 520 ? 1.3 : 1), pan.current); view.current = v;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderTown(ctx, { town: restaurant.state.town, cash: restaurant.state.cash, view: v, width: w, height: h, windowTop: rect.top, windowHeight: window.innerHeight, time: now / 1000, now: Date.now(), ambience, reduced: reduced.matches, selected: latest.current.selected, night: sceneNight(restaurant.state), biome: biomeOf(restaurant.state), price: restaurant.plotPrice() });
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reduced, pan]);
  const town = restaurant.state.town, built = town.plots.filter(p => p.building).length, building = town.plots.filter(p => p.job).length;
  return <SceneBoundary><div ref={host} className="relative h-full w-full touch-none select-none" data-testid="town-view" {...handlers}>
    <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label={`Your reef town: ${town.plots.filter(p => p.owned).length} plots owned, ${built} buildings, ${building} under construction. Tap a plot, or use the town panel, to unlock and build.`} />
  </div></SceneBoundary>;
}
