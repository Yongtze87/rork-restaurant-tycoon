import { useEffect, useRef } from 'react';
import { useReducedMotionQuery } from '@/hooks/use-reduced-motion';
import { restaurant } from './engine';
import { SceneBoundary } from './RestaurantScene';
import { PARCEL, TOWN_SIZE, plotOfTile, type Spot } from './town';
import { claimableRegions, regionAt, regionStatus, worldBounds } from './ocean';
import { REGION_PITCH, cellOf, regionId } from './world';
import { sceneNight } from './light';
import { createAmbience, stepAmbience } from './iso/ambience';
import { fitView, toGrid, toScreen, type View } from './iso/projection';
import { renderTown, type BuildingBox, type RegionLabel } from './iso/town-render';
import { usePanTap, type PanLimits } from './iso/use-pan-tap';

interface TownSceneProps {
  /** The tapped tile, in tile coordinates. */
  selected: { x: number; z: number } | null; selectedRegion?: string | null; zoom: number; viewKey?: number;
  /** A building being placed or moved (`id` when moving), and whether it fits. */
  draft?: { spot: Spot; ok: boolean; id?: number } | null;
  roadMode?: boolean;
  /** A tile was tapped; `building` is set when the tap hit a building's art. */
  onTile: (tile: { x: number; z: number }, building?: number) => void; onRegion?: (id: string) => void;
  /** The region under the middle of the screen, whenever it changes. */
  onLook?: (id: string) => void;
  /** Centre the camera on a world plot whenever `n` changes (e.g. a region picked in the panel). */
  focus?: { x: number; z: number; n: number } | null;
}

/** The whole world in one scene: the home town, claimed regions, claimable regions and fog. Drawing reads the engine; taps select a plot or a region. */
export default function TownScene(props: TownSceneProps) {
  const { zoom, viewKey = 0 } = props;
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), view = useRef<View | null>(null), labels = useRef<RegionLabel[]>([]), boxes = useRef<BuildingBox[]>([]), looking = useRef('');
  const size = useRef({ w: 0, h: 0 }), focused = useRef(0), lastScale = useRef(0);
  const latest = useRef(props); latest.current = props;
  const reduced = useReducedMotionQuery();
  // Drag across everything claimed plus the claimable ring (never less than the usual half screen).
  const limits = (): PanLimits | null => {
    const v = view.current; if (!v) return null;
    const { w, h } = size.current, b = worldBounds(restaurant.state.ocean), base = { ...v, originX: v.originX - pan.current.x, originY: v.originY - pan.current.y };
    const corners = [[b.x0, b.y0], [b.x1 + 1, b.y0], [b.x0, b.y1 + 1], [b.x1 + 1, b.y1 + 1]].map(([x, y]) => toScreen(base, x * REGION_PITCH - .5, y * REGION_PITCH - .5));
    const xs = corners.map(p => p.x), ys = corners.map(p => p.y), lx = w * .5 * zoom, ly = h * .5 * zoom;
    return { x0: Math.min(-lx, w / 2 - Math.max(...xs)), x1: Math.max(lx, w / 2 - Math.min(...xs)), y0: Math.min(-ly, h / 2 - Math.max(...ys)), y1: Math.max(ly, h / 2 - Math.min(...ys)) };
  };
  const { pan, handlers } = usePanTap(host, zoom, viewKey, p => {
    const v = view.current; if (!v) return;
    const label = labels.current.find(l => p.x >= l.left && p.x <= l.right && p.y >= l.top && p.y <= l.bottom);
    if (label) { latest.current.onRegion?.(label.id); return; }
    const { draft, roadMode } = latest.current, g = toGrid(v, p.x, p.y), tx = Math.floor((g.x + .5) * PARCEL), tz = Math.floor((g.z + .5) * PARCEL);
    // A tap on a building's art picks it (the one drawn nearest the finger when pictures overlap), unless a building or road is being placed.
    const hit = draft || roadMode ? undefined : boxes.current.filter(b => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom).sort((a, b) => Math.hypot(p.x - a.cx, p.y - a.cy) - Math.hypot(p.x - b.cx, p.y - b.cy) || b.depth - a.depth)[0];
    const building = hit && restaurant.state.town.buildings.find(b => b.id === hit.id);
    if (building) { latest.current.onTile({ x: building.x, z: building.z }, building.id); return; }
    if (plotOfTile(restaurant.state.town, tx, tz)) { latest.current.onTile({ x: tx, z: tz }); return; }
    const x = Math.round(g.x), z = Math.round(g.z);
    const c = cellOf(x, z), id = regionId(c.x, c.y), status = regionStatus(restaurant.state.ocean, id);
    if (status === 'claimable' || status === 'claimed') latest.current.onRegion?.(id);
  }, limits);
  useEffect(() => {
    const element = canvas.current, ctx = element?.getContext('2d'); if (!element || !ctx) return;
    const ambience = createAmbience(91);
    let frame = 0, last = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(.25, (now - last) / 1000); last = now;
      restaurant.update(dt); // whichever view is showing drives the simulation
      const rect = element.getBoundingClientRect(), w = rect.width, h = rect.height; if (!w || !h) return;
      size.current = { w, h };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (element.width !== Math.round(w * dpr) || element.height !== Math.round(h * dpr)) { element.width = Math.round(w * dpr); element.height = Math.round(h * dpr); }
      if (!reduced.matches) stepAmbience(ambience, dt);
      // The Home Reef is centred by default; narrow phones start closer in, and the rest of the world is a drag away.
      const scale = latest.current.zoom * (w < 520 ? 1.3 : 1), focus = latest.current.focus;
      if (focus && focus.n !== focused.current) {
        focused.current = focus.n;
        const p = toScreen(fitView(w, h, TOWN_SIZE, TOWN_SIZE, scale), focus.x, focus.z);
        pan.current = { x: w / 2 - p.x, y: h / 2 - p.y }; lastScale.current = 0;
      }
      let v = fitView(w, h, TOWN_SIZE, TOWN_SIZE, scale, pan.current);
      // Zooming (or the panel resizing the scene) keeps the same spot of the world in the middle.
      if (lastScale.current && v.scale !== lastScale.current) { const k = v.scale / lastScale.current; pan.current = { x: pan.current.x * k, y: pan.current.y * k }; v = fitView(w, h, TOWN_SIZE, TOWN_SIZE, scale, pan.current); }
      lastScale.current = v.scale; view.current = v;
      const centre = toGrid(v, w / 2, h / 2), cell = cellOf(Math.round(centre.x), Math.round(centre.z)), look = regionId(cell.x, cell.y);
      if (look !== looking.current) { looking.current = look; latest.current.onLook?.(look); }
      const state = restaurant.state, lookStatus = regionStatus(state.ocean, look);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const drawn = renderTown(ctx, {
        town: state.town, ocean: state.ocean, cash: state.cash, view: v, width: w, height: h, windowTop: rect.top, windowHeight: window.innerHeight, time: now / 1000, now: Date.now(),
        ambience, reduced: reduced.matches, selected: latest.current.selected, selectedRegion: latest.current.selectedRegion, draft: latest.current.draft, roadMode: latest.current.roadMode, night: sceneNight(state),
        biome: lookStatus === 'fog' ? 'home' : regionAt(cell.x, cell.y).biome,
        plotPrice: (x, z) => restaurant.plotPrice(x, z), claim: id => ({ price: restaurant.claimPrice(id), error: restaurant.claimError(id) }),
      });
      labels.current = drawn.labels; boxes.current = drawn.buildings;
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reduced, pan]);
  const state = restaurant.state, town = state.town, built = town.buildings.length, building = town.buildings.filter(b => b.job).length;
  return <SceneBoundary><div ref={host} className="relative h-full w-full touch-none select-none" data-testid="town-view" {...handlers}>
    <canvas ref={canvas} className="absolute inset-0 h-full w-full" role="img" aria-label={`Your reef world: ${state.ocean.regions.length + 1} ${state.ocean.regions.length ? 'regions' : 'region'} claimed, ${claimableRegions(state.ocean).length} to claim, ${town.plots.filter(p => p.owned).length} plots owned, ${built} buildings, ${building} under construction. ${town.roads.length} road tiles. Tap a plot or a region, or use the town panel, to unlock, build, lay roads and claim.`} />
  </div></SceneBoundary>;
}
