import { useSyncExternalStore } from 'react';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import RestaurantScene from '@/management/RestaurantScene';
import { restaurant } from '@/management/engine';
import { HEIGHT, width, type Furniture, type Point } from '@/management/types';
import { cellAt, fitView, toScreen } from '@/management/iso/projection';
import '@/index.css';

beforeEach(async () => { restaurant.reset(); await page.viewport(900, 700); });

function Host(props: { draft: Furniture | null; building: boolean; onTile: (p: Point) => void; onSelect: (id: number) => void }) {
  useSyncExternalStore(restaurant.subscribe, restaurant.getSnapshot);
  return <div style={{ width: 800, height: 600, position: 'relative' }}><RestaurantScene state={restaurant.state} selected={null} zoom={1} {...props} /></div>;
}
const tap = (element: Element, x: number, z: number) => {
  const rect = element.getBoundingClientRect(), view = fitView(rect.width, rect.height, width(restaurant.state), HEIGHT), p = toScreen(view, x, z);
  for (const type of ['pointerdown', 'pointerup']) element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: rect.left + p.x, clientY: rect.top + p.y }));
  return cellAt(view, p.x, p.y, width(restaurant.state), HEIGHT);
};

it('paints the reef and reports the tapped floor cell while placing furniture', async () => {
  const onTile = vi.fn(), onSelect = vi.fn();
  const screen = await render(<Host draft={{ id: -1, kind: 'plant', x: 0, z: 7, rotation: 0, level: 1 }} building onTile={onTile} onSelect={onSelect} />);
  const host = screen.getByTestId('reef-view').element();
  await expect.element(screen.getByRole('img', { name: /Little Reef: an underwater restaurant/ })).toBeVisible();
  await new Promise(resolve => setTimeout(resolve, 100));
  const canvas = host.querySelector('canvas')!, pixel = canvas.getContext('2d')!.getImageData(2, 2, 1, 1).data;
  expect(pixel[3]).toBe(255); expect(pixel[2]).toBeGreaterThan(pixel[0]); // painted open water in the corner, not a blank canvas
  expect(tap(host, 6, 7)).toEqual({ x: 6, z: 7 });
  expect(onTile).toHaveBeenCalledWith({ x: 6, z: 7 }); expect(onSelect).not.toHaveBeenCalled();
});

it('selects furniture on tap and ignores drags used to look around', async () => {
  const onTile = vi.fn(), onSelect = vi.fn();
  const screen = await render(<Host draft={null} building={false} onTile={onTile} onSelect={onSelect} />);
  const host = screen.getByTestId('reef-view').element();
  await new Promise(resolve => setTimeout(resolve, 100));
  const grill = restaurant.state.furniture.find(item => item.kind === 'grill')!;
  tap(host, grill.x, grill.z); expect(onSelect).toHaveBeenLastCalledWith(grill.id);
  const rect = host.getBoundingClientRect();
  host.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: rect.left + 400, clientY: rect.top + 300 }));
  host.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 2, clientX: rect.left + 460, clientY: rect.top + 330 }));
  host.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientX: rect.left + 460, clientY: rect.top + 330 }));
  expect(onSelect).toHaveBeenCalledTimes(1); expect(onTile).not.toHaveBeenCalled();
});

it('positions guest meters over guests during real service', async () => {
  restaurant.open();
  const screen = await render(<Host draft={null} building={false} onTile={() => undefined} onSelect={() => undefined} />);
  for (let i = 0; i < 40 && !restaurant.state.guests.length; i++) restaurant.update(.25);
  expect(restaurant.state.guests.length).toBeGreaterThan(0);
  const meter = screen.getByRole('meter').first();
  await expect.element(meter).toBeVisible();
  const host = screen.getByTestId('reef-view').element().getBoundingClientRect(), box = meter.element().getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(host.left); expect(box.right).toBeLessThanOrEqual(host.right);
  restaurant.pause(true);
});
