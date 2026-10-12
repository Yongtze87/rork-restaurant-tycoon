import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { vi } from 'vitest';
import { ShareScore } from '@/components/ShareScore';
import { ResultsScreen } from '@/components/KitchenUI';
import { KitchenEngine } from '@/game/engine';
import { canShareScorecard, createScorecard, scorecardDetails, SCORECARD_SIZE } from '@/game/scorecard';
import type { Results } from '@/game/types';
import '@/index.css';

const result: Results = { score: 620, orderPoints: 500, tips: 140, penalties: 20, served: 10, missed: 1, stars: 2, level: 0, mode: 'coop', newBest: true, unlocked: true };
const initialShare = Object.getOwnPropertyDescriptor(navigator, 'share');
const initialCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
function shareSupport(share: Navigator['share'] | undefined, canShare: Navigator['canShare'] | undefined): void {
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare });
}
beforeEach(() => { shareSupport(undefined, undefined); });
afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, descriptor] of [['share', initialShare], ['canShare', initialCanShare]] as const) {
    if (descriptor) Object.defineProperty(navigator, name, descriptor);
    else Reflect.deleteProperty(navigator, name);
  }
});

async function openCard(value: Results = result) {
  const screen = await render(<ShareScore result={value} />);
  await screen.getByRole('button', { name: 'Share Score', exact: true }).click();
  await expect.element(page.getByRole('link', { name: 'Save PNG' })).toBeVisible();
  return screen;
}

test('exports a real high-resolution PNG with accurate result text and earned stars', async () => {
  const drawn = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
  const file = await createScorecard(result);
  expect(file.type).toBe('image/png');
  expect(file.name).toBe('kitchen-rush-golden-hour-coop-620.png');
  const bytes = new Uint8Array(await file.arrayBuffer());
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = new DataView(bytes.buffer);
  expect(header.getUint32(16)).toBe(SCORECARD_SIZE.width);
  expect(header.getUint32(20)).toBe(SCORECARD_SIZE.height);
  const copy = drawn.mock.calls.map(call => call[0]);
  expect(copy).toEqual(expect.arrayContaining(['Golden Hour', 'SHIFT 01  /  COUCH CO-OP', '620', '500', '+140', '−20', '10 SERVED', '1 MISSED', 'NEW PERSONAL BEST', 'CAN YOU BEAT OUR SCORE?']));
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
  expect(Array.from(ctx.getImageData(540, 454, 1, 1).data)).toEqual([242, 183, 67, 255]);
  expect(Array.from(ctx.getImageData(642, 464, 1, 1).data)).toEqual([246, 231, 202, 255]);
});

test('keeps zero and negative scores truthful and does not invent personal bests', async () => {
  const drawn = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
  for (const score of [0, -40]) {
    drawn.mockClear();
    const solo: Results = { ...result, level: 2, mode: 'solo', score, orderPoints: 0, tips: 0, penalties: -score, served: 0, stars: 0, newBest: false };
    await createScorecard(solo);
    const copy = drawn.mock.calls.map(call => call[0]);
    expect(copy).toContain(String(score));
    expect(copy).toContain('SHIFT 03  /  SOLO SERVICE');
    expect(copy).not.toContain('NEW PERSONAL BEST');
    expect(scorecardDetails(solo).text).toContain(`I scored ${score} points`);
    expect(scorecardDetails(solo).filename).toBe(`kitchen-rush-last-call-solo-${score}.png`);
  }
});

test('font failure uses a local fallback instead of blocking image generation', async () => {
  vi.spyOn(document.fonts, 'load').mockRejectedValue(new Error('Offline font'));
  expect((await createScorecard({ ...result, score: 123456, stars: 3 })).size).toBeGreaterThan(1000);
});

test('unsupported or blocked file sharing falls back safely', async () => {
  const file = new File(['image'], 'score.png', { type: 'image/png' });
  expect(canShareScorecard(file)).toBe(false);
  shareSupport(vi.fn(), () => false); expect(canShareScorecard(file)).toBe(false);
  shareSupport(vi.fn(), () => { throw new DOMException('Blocked', 'NotAllowedError'); });
  expect(canShareScorecard(file)).toBe(false);
  await openCard();
  await expect.element(page.getByRole('button', { name: 'Share image' })).not.toBeInTheDocument();
  const link = page.getByRole('link', { name: 'Save PNG' });
  await expect.element(link).toHaveAttribute('download', scorecardDetails(result).filename);
  const url = link.element().getAttribute('href')!;
  expect((await (await fetch(url)).blob()).type).toBe('image/png');
  await expect.element(page.getByRole('img')).toHaveAccessibleName(scorecardDetails(result).description);
});

test('shares the prepared PNG and co-op caption only after an explicit click', async () => {
  let resolveShare: (() => void) | undefined;
  const nativeShare = vi.fn(() => new Promise<void>(resolve => { resolveShare = resolve; }));
  shareSupport(nativeShare, () => true);
  await openCard();
  expect(nativeShare).not.toHaveBeenCalled();
  await page.getByRole('button', { name: 'Share image' }).click();
  expect(nativeShare).toHaveBeenCalledTimes(1);
  const payload = nativeShare.mock.calls[0] as unknown as [ShareData];
  expect(payload[0].files?.[0]).toBeInstanceOf(File);
  expect(payload[0].files?.[0].type).toBe('image/png');
  expect(payload[0].text).toBe(scorecardDetails(result).text);
  await expect.element(page.getByRole('button', { name: 'Sharing…' })).toBeDisabled();
  resolveShare?.();
  await expect.element(page.getByRole('status')).toHaveTextContent('Scorecard shared. Nicely served!');
});

test('canceling native share preserves the preview and download', async () => {
  shareSupport(vi.fn().mockRejectedValue(new DOMException('Canceled', 'AbortError')), () => true);
  await openCard(); await page.getByRole('button', { name: 'Share image' }).click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Sharing canceled. Your scorecard is still ready.');
  await expect.element(page.getByRole('link', { name: 'Save PNG' })).toBeVisible();
  await expect.element(page.getByRole('button', { name: 'Share image' })).toBeEnabled();
});

test('native share failure offers the PNG instead of reporting false success', async () => {
  shareSupport(vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')), () => true);
  await openCard(); await page.getByRole('button', { name: 'Share image' }).click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Save the PNG and attach it in your favorite app.');
  await expect.element(page.getByRole('link', { name: 'Save PNG' })).toBeVisible();
});

test('export failure can be retried without losing the results', async () => {
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementationOnce(callback => callback(null));
  const screen = await render(<ShareScore result={result} />);
  await screen.getByRole('button', { name: 'Share Score' }).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('Your score is safe');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.element(page.getByRole('link', { name: 'Save PNG' })).toBeVisible();
  expect(encode).toHaveBeenCalledTimes(2);
});

test('closing disposes the image, restores focus, and reopening reflects the latest result', async () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const screen = await openCard();
  const oldURL = page.getByRole('link', { name: 'Save PNG' }).element().getAttribute('href');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => revoke.mock.calls.some(([url]) => url === oldURL)).toBe(true);
  await expect.element(screen.getByRole('button', { name: 'Share Score' })).toHaveFocus();
  await screen.rerender(<ShareScore result={{ ...result, score: 1100, level: 2 }} />);
  await screen.getByRole('button', { name: 'Share Score' }).click();
  await expect.element(page.getByRole('link', { name: 'Save PNG' })).toHaveAttribute('download', 'kitchen-rush-last-call-coop-1100.png');
});

test('closing while an image is encoding does not create a leaked preview URL', async () => {
  let finishEncoding: BlobCallback | undefined;
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => { finishEncoding = callback; });
  const createURL = vi.spyOn(URL, 'createObjectURL');
  const screen = await render(<ShareScore result={result} />);
  await screen.getByRole('button', { name: 'Share Score' }).click();
  await expect.poll(() => typeof finishEncoding).toBe('function');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  finishEncoding?.(new Blob(['image'], { type: 'image/png' }));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(createURL).not.toHaveBeenCalled();
});

test('results expose Share Score without changing replay or rooftop navigation', async () => {
  const game = new KitchenEngine(); game.state.results = result;
  const start = vi.fn(); const go = vi.fn();
  const screen = await render(<ResultsScreen state={game.state} start={start} go={go} />);
  await expect.element(screen.getByRole('button', { name: 'Share Score' })).toBeVisible();
  await screen.getByRole('button', { name: 'Play again' }).click(); expect(start).toHaveBeenCalledWith(false);
  await screen.getByRole('button', { name: 'Back to rooftop' }).click(); expect(go).toHaveBeenCalledWith('/');
});
