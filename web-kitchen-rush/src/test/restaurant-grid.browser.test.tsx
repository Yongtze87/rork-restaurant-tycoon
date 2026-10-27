import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { vi } from 'vitest';
import ManagementGame from '@/management/ManagementGame';
import { restaurant } from '@/management/engine';
import type { Furniture, Point } from '@/management/types';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: ({ building, draft, onTile, onSelect }: { building: boolean; draft: Furniture | null; onTile: (point: Point) => void; onSelect: (id: number) => void }) => <div data-testid="grid-scene" data-building={building} data-rotation={draft?.rotation}>
  <button onClick={() => onTile({ x: 5, z: 4 })}>Occupied cell</button><button onClick={() => onTile({ x: 0, z: 7 })}>Free cell</button><button onClick={() => onSelect(3)}>Select existing table</button>
</div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });
afterEach(async () => { await page.viewport(1280, 800); });

it('shows grid only while building, selecting or moving and never during service', async () => {
  const screen = await render(<ManagementGame />), scene = screen.getByTestId('grid-scene');
  await expect.element(scene).toHaveAttribute('data-building', 'false');
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await expect.element(scene).toHaveAttribute('data-building', 'true');
  await screen.getByRole('button', { name: 'Close panel' }).click();
  await expect.element(scene).toHaveAttribute('data-building', 'false');
  await screen.getByRole('button', { name: 'Select existing table' }).click();
  await expect.element(scene).toHaveAttribute('data-building', 'true');
  await screen.getByRole('button', { name: 'Move', exact: true }).click();
  await expect.element(screen.getByTestId('placement-grid-readout')).toHaveTextContent('Grid snap · 2 × 2');
  await expect.element(screen.getByTestId('placement-grid-readout')).toHaveTextContent('Col 2 · Row 5');
  await screen.getByRole('button', { name: 'Cancel placement' }).click();
  await expect.element(scene).toHaveAttribute('data-building', 'false');
  await screen.getByRole('button', { name: /Open restaurant/ }).click();
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await expect.element(scene).toHaveAttribute('data-building', 'false');
});

it('updates coordinates, rotation and non-color validity without charging until confirm', async () => {
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: /Coral table/ }).click();
  const readout = screen.getByTestId('placement-grid-readout');
  await expect.element(readout).toHaveTextContent('Col 1 · Row 8');
  await expect.element(readout).toHaveTextContent('Fits here');
  await screen.getByRole('button', { name: 'Occupied cell' }).click();
  await expect.element(readout).toHaveTextContent('Col 6 · Row 5');
  await expect.element(readout).toHaveTextContent('Blocked');
  await expect.element(screen.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
  expect(restaurant.state.cash).toBe(1250);
  await screen.getByRole('button', { name: 'Free cell' }).click();
  await screen.getByRole('button', { name: 'Move furniture right' }).click();
  await expect.element(readout).toHaveTextContent('Col 2 · Row 8');
  await userEvent.keyboard('{ArrowLeft}r');
  await expect.element(readout).toHaveTextContent('Col 1 · Row 8');
  await expect.element(screen.getByTestId('grid-scene')).toHaveAttribute('data-rotation', '1');
  await userEvent.keyboard('rrr');
  await screen.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(restaurant.state.cash).toBe(1070);
  expect(restaurant.state.furniture[restaurant.state.furniture.length - 1]).toMatchObject({ kind: 'table', x: 0, z: 7, rotation: 0 });
  await expect.element(readout).not.toBeInTheDocument();
  await expect.element(screen.getByTestId('grid-scene')).toHaveAttribute('data-building', 'false');
});

it.each([320, 390, 768])('keeps the grid readout, preview area and placement controls separate at %spx', async width => {
  await page.viewport(width, 740);
  const screen = await render(<ManagementGame />);
  await screen.getByRole('button', { name: 'Build', exact: true }).click();
  await screen.getByRole('button', { name: /Coral table/ }).click();
  const region = screen.getByRole('region', { name: 'Furniture placement' }).element();
  const rect = region.getBoundingClientRect(), scene = screen.getByTestId('restaurant-scene').element().getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width);
  expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
  expect(scene.bottom).toBeLessThanOrEqual(rect.top); expect(scene.height).toBeGreaterThan(160);
  if (width < 640) expect(rect.bottom).toBeLessThan(screen.getByRole('navigation', { name: 'Restaurant management' }).element().getBoundingClientRect().top);
  for (const button of region.querySelectorAll('button')) {
    const bounds = button.getBoundingClientRect();
    expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.right).toBeLessThanOrEqual(width); expect(bounds.bottom).toBeLessThan(740);
  }
});
