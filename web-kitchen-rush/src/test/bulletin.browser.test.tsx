import { expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { BulletinReader } from '@/management/BulletinReader';
import { RestaurantEngine } from '@/management/engine';
import { readBulletin } from '@/management/bulletin';
import { paintBulletin } from '@/management/bulletin-screen';
import '@/index.css';

it('opens an accessible live readout, updates without pausing, and resets cleanly', async () => {
  const engine = new RestaurantEngine(); const screen = await render(<BulletinReader engine={engine} />);
  await screen.getByRole('button', { name: 'Read street bulletin' }).click();
  const dialog = page.getByRole('dialog', { name: 'Street bulletin' });
  await expect.element(dialog).toBeVisible(); await expect.element(page.getByTestId('bulletin-count')).toHaveTextContent('0');
  await expect.element(page.getByText('Grand opening', { exact: true })).toBeVisible();
  engine.open(); for (let i = 0; i < 350; i++) engine.update(.1);
  await expect.element(page.getByTestId('bulletin-count')).toHaveTextContent(String(engine.state.guests.length)); expect(engine.paused).toBe(false);
  engine.pause(true); await expect.element(page.getByText(/Little Rooftop · paused/)).toBeVisible();
  engine.reset(); await expect.element(dialog).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Read street bulletin' }).click(); await expect.element(page.getByTestId('bulletin-count')).toHaveTextContent('0');
});

it('reflects menu edits while open and closes with the native dialog control', async () => {
  const engine = new RestaurantEngine(); const screen = await render(<BulletinReader engine={engine} />);
  await screen.getByRole('button', { name: 'Read street bulletin' }).click();
  engine.setDish('salad', true, 29); engine.setDish('burger', false, 38);
  await expect.element(page.getByText('$29 · Made with love on the rooftop.', { exact: true })).toBeVisible();
  await expect.element(page.getByText('Sunset burger', { exact: true })).not.toBeInTheDocument();
  await page.getByRole('button', { name: 'Close', exact: true }).click(); await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
});

it.each([320, 390, 768, 1440])('fits the reading dialog and touch target at %ipx', async width => {
  await page.viewport(width, 844); const engine = new RestaurantEngine(); const screen = await render(<BulletinReader engine={engine} />);
  const trigger = screen.getByRole('button', { name: 'Read street bulletin' }); const bounds = trigger.element().getBoundingClientRect(); expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
  await trigger.click(); const dialog = page.getByRole('dialog').element(); const rect = dialog.getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width); expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
});

it('draws a real canvas screen with distinct count, status and announcement content', () => {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 640; const ctx = canvas.getContext('2d')!;
  const e = new RestaurantEngine(); const data = readBulletin(e.state, false); paintBulletin(ctx, data, 0); const first = canvas.toDataURL();
  paintBulletin(ctx, data, 1); expect(canvas.toDataURL()).not.toBe(first);
  paintBulletin(ctx, { ...data, guests: 9 }, 0); expect(canvas.toDataURL()).not.toBe(first);
  expect(Array.from(ctx.getImageData(48, 243, 1, 1).data)).toEqual([255, 242, 215, 255]);
});
