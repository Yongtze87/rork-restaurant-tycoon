import { useEffect, useRef } from 'react';
import { buildingLook, type BuildingKind } from './town';
import { drawBuilding } from './iso/town-art';
import { drawSprite } from './iso/sprites';

/** A building's picture at a level, drawn small for cards: the real art when it has loaded, the placeholder until then. */
export function BuildingThumb({ kind, level = 1, size = 44 }: { kind: BuildingKind; level?: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), look = buildingLook(kind, level);
    canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size * .74); ctx.scale(size / 72, size / 72);
    if (!drawSprite(ctx, `building.${kind}.${look}`)) drawBuilding(ctx, kind, look, 0);
  }, [kind, level, size]);
  return <canvas ref={ref} aria-hidden="true" className="shrink-0" style={{ width: size, height: size }} />;
}
