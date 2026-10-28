import { useSyncExternalStore } from 'react';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import TownScene from '@/management/TownScene';
import { restaurant } from '@/management/engine';
import { claimableRegions } from '@/management/ocean';
import { PARCEL, TOWN_SIZE } from '@/management/town';
import { buildOn } from './town-helpers';
import { regionBlock, regionCenter } from '@/management/world';
import { fitView, toScreen } from '@/management/iso/projection';
import '@/index.css';

beforeEach(async () => {
  restaurant.reset(); await page.viewport(900, 700);
  const s = restaurant.state; s.town.zones.push('reef', 'twilight'); s.cash = 200_000;
  for (const id of ['1,0', '0,1', '1,1']) expect(restaurant.claimRegion(id)).toBeNull();
  const c = regionCenter(1, 0); buildOn(restaurant, 'branch', c.x, c.z);
});
const ZOOM = .45;
function Host(props: { onTile: (p: { x: number; z: number }) => void; onRegion: (id: string) => void; onLook?: (id: string) => void }) {
  useSyncExternalStore(restaurant.subscribe, restaurant.getSnapshot);
  return <div style={{ width: 800, height: 600, position: 'relative' }}><TownScene selected={null} zoom={ZOOM} {...props} /></div>;
}
const tapAt = (element: Element, x: number, y: number) => {
  const rect = element.getBoundingClientRect();
  for (const type of ['pointerdown', 'pointerup']) element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: rect.left + x, clientY: rect.top + y }));
};
const view = (element: Element) => { const rect = element.getBoundingClientRect(); return fitView(rect.width, rect.height, TOWN_SIZE, TOWN_SIZE, ZOOM); };

it('draws the home town, claimed and claimable regions and fog in one scene, and taps reach plots and regions anywhere', async () => {
  const onTile = vi.fn(), onRegion = vi.fn(), onLook = vi.fn();
  const screen = await render(<Host onTile={onTile} onRegion={onRegion} onLook={onLook} />);
  const host = screen.getByTestId('town-view').element();
  await expect.element(screen.getByRole('img', { name: new RegExp(`4 regions claimed, ${claimableRegions(restaurant.state.ocean).length} to claim`) })).toBeVisible();
  await new Promise(resolve => setTimeout(resolve, 150));
  expect(onLook).toHaveBeenCalledWith('0,0');
  const v = view(host), canvas = host.querySelector('canvas')!, ctx = canvas.getContext('2d')!, dpr = canvas.width / host.getBoundingClientRect().width;
  const pixel = (p: { x: number; y: number }) => Array.from(ctx.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data);
  // A plot in a claimed region far from home is tappable.
  const plot = { x: regionBlock(1, 1).x0 + 1, z: regionBlock(1, 1).z0 + 1 }, p = toScreen(v, plot.x + .1, plot.z + .1);
  tapAt(host, p.x, p.y); expect(onTile).toHaveBeenLastCalledWith({ x: plot.x * PARCEL + 2, z: plot.z * PARCEL + 2 });
  // A claimable region's floating label opens its details; so does its seabed.
  const b = regionBlock(-1, 0), label = toScreen(v, b.x0 + b.size / 2 - .5, b.z0 + b.size / 2 - .5, 40);
  tapAt(host, label.x, label.y); expect(onRegion).toHaveBeenLastCalledWith('-1,0');
  const seabed = toScreen(v, regionBlock(0, -1).x0, regionBlock(0, -1).z0 + 3); tapAt(host, seabed.x, seabed.y); expect(onRegion).toHaveBeenLastCalledWith('0,-1');
  // Fog two rings out does nothing; claimed, claimable and fogged ground look different.
  const fog = toScreen(v, regionBlock(-2, -1).x0 + 3, regionBlock(-2, -1).z0 + 3), calls = onTile.mock.calls.length + onRegion.mock.calls.length;
  if (fog.x > 0 && fog.y > 0 && fog.x < 800 && fog.y < 600) { tapAt(host, fog.x, fog.y); expect(onTile.mock.calls.length + onRegion.mock.calls.length).toBe(calls); }
  const ground = [toScreen(v, regionBlock(0, 1).x0 + .5, regionBlock(0, 1).z0 + .5), toScreen(v, regionBlock(-1, 1).x0 + .5, regionBlock(-1, 1).z0 + .5), toScreen(v, regionBlock(-1, -2).x0 + 3, regionBlock(-1, -2).z0 + 3)];
  const colors = ground.filter(q => q.x > 0 && q.y > 0 && q.x < 800 && q.y < 600).map(q => pixel(q).join());
  expect(colors.length).toBeGreaterThanOrEqual(2); expect(new Set(colors).size).toBe(colors.length);
});

it('drags across the world past the home town and recentres with a new view key', async () => {
  const onLook = vi.fn();
  const Wide = ({ viewKey }: { viewKey: number }) => <div style={{ width: 800, height: 600, position: 'relative' }}><TownScene selected={null} zoom={ZOOM} viewKey={viewKey} onTile={() => undefined} onLook={onLook} /></div>;
  const screen = await render(<Wide viewKey={0} />);
  const host = screen.getByTestId('town-view').element(), rect = host.getBoundingClientRect();
  await new Promise(resolve => setTimeout(resolve, 100));
  // Drag the view left and up so the south-east region comes to the middle.
  const v = view(host), target = toScreen(v, regionCenter(1, 1).x, regionCenter(1, 1).z), steps = 6;
  host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: rect.left + 400, clientY: rect.top + 300 }));
  for (let i = 1; i <= steps; i++) host.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: rect.left + 400 - (target.x - 400) * i / steps, clientY: rect.top + 300 - (target.y - 300) * i / steps }));
  host.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3, clientX: rect.left + 400 - (target.x - 400), clientY: rect.top + 300 - (target.y - 300) }));
  await vi.waitFor(() => expect(onLook).toHaveBeenLastCalledWith('1,1'));
  await screen.rerender(<Wide viewKey={1} />);
  await vi.waitFor(() => expect(onLook).toHaveBeenLastCalledWith('0,0'));
});
