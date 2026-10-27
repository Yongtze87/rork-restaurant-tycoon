import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { restaurant } from '@/management/engine';
import ManagementGame from '@/management/ManagementGame';
import { DailyReport } from '@/management/DailyReport';
import { TIDES } from '@/management/tides';
import { createAmbience } from '@/management/iso/ambience';
import { fitView } from '@/management/iso/projection';
import { renderFrame } from '@/management/iso/render';
import { HEIGHT, width, type Report } from '@/management/types';
import '@/index.css';

vi.mock('@/management/RestaurantScene', () => ({ default: () => <div>Restaurant world</div> }));
beforeEach(async () => { restaurant.reset(); restaurant.welcome(); await page.viewport(1280, 800); });

it.each([320, 1280])('shows today’s tide next to the daily challenges at %spx', async size => {
  await page.viewport(size, 800); const screen = await render(<ManagementGame />);
  const card = screen.getByTestId('tide-card');
  await expect.element(card).toHaveTextContent(TIDES[restaurant.state.tide].name);
  restaurant.state.tide = 'whale'; restaurant.notify();
  await expect.element(card).toHaveTextContent('Whale passing');
  await expect.element(card).toHaveTextContent('Guests arrive 15% more often · tips +15%');
  await expect.element(screen.getByRole('group', { name: /Day 1 tide: Whale passing/ })).toBeVisible();
  const rect = card.element().getBoundingClientRect(); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(size);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(size);
});

it('names the day’s tide on its receipt', async () => {
  const report: Report = { challenges: [], day: 4, revenue: 300, tips: 20, ingredients: 90, wages: 60, rent: 30, debtPayment: 0, profit: 140, served: 10, missed: 2, rating: 4, tide: 'shoal', branch: 0 };
  const screen = await render(<DailyReport report={report} restaurantName="Little Reef" closing={false} onContinue={() => undefined} onClose={() => undefined} />);
  await expect.element(screen.getByTestId('report-tide')).toHaveTextContent('Shoal run · Fish 30% cheaper');
});

it('darkens the reef late in the evening while lanterns keep glowing', () => {
  const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!, state = restaurant.state, view = fitView(800, 600, width(state), HEIGHT);
  const frame = (elapsed: number) => {
    restaurant.state.phase = 'service'; restaurant.state.elapsed = elapsed; ctx.clearRect(0, 0, 800, 600);
    renderFrame(ctx, { state, view, width: 800, height: 600, columns: width(state), windowTop: 0, windowHeight: 600, time: 0, ambience: createAmbience(), reduced: true, building: false, draft: null, draftValid: false, selected: null, tracked: new Map() }, .016);
    const data = ctx.getImageData(0, 0, 800, 600).data; let sum = 0; for (let i = 0; i < data.length; i += 4 * 97) sum += data[i] + data[i + 1] + data[i + 2]; return sum;
  };
  const dusk = frame(0), night = frame(140);
  expect(night).toBeLessThan(dusk * .8); expect(night).toBeGreaterThan(0);
  restaurant.reset();
});
