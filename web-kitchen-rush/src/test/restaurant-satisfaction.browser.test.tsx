import { expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { GuestSatisfactionBar } from '@/management/GuestSatisfactionBar';
import { RestaurantLabels } from '@/management/RestaurantLabels';
import { RestaurantEngine } from '@/management/engine';
import '@/index.css';

it('shows an accessible current-value meter and changes face, color and fill together', async () => {
  const screen = await render(<GuestSatisfactionBar id={21} value={80} mood="content" stage="waiting" />);
  const meter = screen.getByRole('meter', { name: 'Guest 21 satisfaction' });
  await expect.element(meter).toHaveAttribute('aria-valuenow', '80');
  await expect.element(screen.getByTestId('satisfaction-fill')).toHaveAttribute('width', '80');
  await screen.rerender(<GuestSatisfactionBar id={21} value={45} mood="uneasy" stage="cooking" />);
  await expect.element(meter).toHaveAttribute('data-mood', 'uneasy');
  await expect.element(meter).toHaveAttribute('aria-valuetext', '45% — Getting impatient. Meal being prepared.');
  expect(meter.element().querySelector('.lucide-meh')).not.toBeNull();
  await screen.rerender(<GuestSatisfactionBar id={21} value={10} mood="unhappy" stage="ready" />);
  await expect.element(screen.getByTestId('satisfaction-fill')).toHaveClass('fill-danger');
  expect(meter.element().querySelector('.lucide-frown')).not.toBeNull();
  await screen.rerender(<GuestSatisfactionBar id={21} value={100} mood="served" stage="eating" />);
  await expect.element(meter).toHaveAttribute('aria-valuenow', '100');
  await expect.element(screen.getByTestId('satisfaction-fill')).toHaveClass('fill-teal');
  expect(meter.element().querySelector('.lucide-smile')).not.toBeNull();
});

it('keeps independent guests and an empty unhappy departure without live announcements', async () => {
  const screen = await render(<><GuestSatisfactionBar id={20} value={0} mood="unhappy" stage="leaving" /><GuestSatisfactionBar id={21} value={100} mood="served" stage="leaving" /></>);
  await expect.element(screen.getByRole('meter', { name: 'Guest 20 satisfaction' })).toHaveAttribute('aria-valuenow', '0');
  await expect.element(screen.getByRole('meter', { name: 'Guest 21 satisfaction' })).toHaveAttribute('aria-valuenow', '100');
  expect(screen.container.querySelector('[aria-live]')).toBeNull();
  for (const meter of screen.container.querySelectorAll('[role="meter"]')) {
    expect(getComputedStyle(meter).pointerEvents).toBe('none');
    expect(meter.hasAttribute('tabindex')).toBe(false);
    expect(meter.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  }
});

it('registers every real guest, updates mutable simulation data, and cleans up on reset', async () => {
  const engine = new RestaurantEngine(); engine.open();
  for (let i = 0; i < 430; i++) engine.update(.1);
  const labels = { current: new Map<string, HTMLDivElement>() };
  const screen = await render(<RestaurantLabels state={engine.state} labels={labels} />);
  expect(screen.container.querySelectorAll('[role="meter"]').length).toBe(engine.state.guests.length);
  const guest = engine.state.guests.find(g => g.stage === 'cooking')!;
  const original = labels.current.get(`customer-${guest.id}`)!;
  guest.waiting = 54; engine.notify();
  await screen.rerender(<RestaurantLabels state={engine.state} labels={labels} />);
  expect(labels.current.get(`customer-${guest.id}`)).toBe(original);
  expect(original.querySelector('[role="meter"]')?.getAttribute('data-mood')).toBe('unhappy');
  engine.state.guests = engine.state.guests.filter(g => g.id !== guest.id);
  await screen.rerender(<RestaurantLabels state={engine.state} labels={labels} />);
  expect(labels.current.has(`customer-${guest.id}`)).toBe(false);
  engine.reset(); await screen.rerender(<RestaurantLabels state={engine.state} labels={labels} />);
  expect(labels.current.size).toBe(0); expect(screen.container.querySelector('[role="meter"]')).toBeNull();
});

it.each([320, 390, 768, 1440])('stays compact and non-animated at %ipx, including reduced motion', async width => {
  await page.viewport(width, 844);
  const screen = await render(<GuestSatisfactionBar id={20} value={20} mood="unhappy" stage="waiting" />);
  const meter = screen.getByRole('meter').element(), bounds = meter.getBoundingClientRect();
  expect(bounds.width).toBe(width < 640 ? 56 : 64); expect(bounds.height).toBe(width < 640 ? 20 : 24);
  expect(meter.scrollWidth).toBeLessThanOrEqual(meter.clientWidth);
  expect(getComputedStyle(screen.getByTestId('satisfaction-fill').element()).animationName).toBe('none');
  expect(getComputedStyle(screen.getByTestId('satisfaction-fill').element()).transitionDuration).toBe('0s');
});
