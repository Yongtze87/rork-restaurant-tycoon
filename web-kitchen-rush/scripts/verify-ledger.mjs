import { strict as assert } from 'node:assert';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const mobile = process.argv.includes('mobile');
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1024, height: 800 }, hasTouch: mobile, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Make it yours', exact: true }).waitFor();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectBulletin()?.generated, null, { timeout: 30000 });
  // Generate twelve genuine service receipts in an isolated engine, not invented chart samples.
  const expected = await page.evaluate(async () => {
    (await import('/scripts/inspect.ts')).settleScene();
    const { RestaurantEngine, restaurant } = await import('/src/management/engine.ts');
    const e = new RestaurantEngine(); e.welcome(); e.open();
    for (let i = 0; i < 40000 && e.state.day < 13; i++) e.update(.1);
    if (e.state.history.length !== 12) throw new Error('Simulation did not reach twelve closed days');
    restaurant.state = structuredClone(e.state); restaurant.notify();
    return { total: e.state.history.filter(r => r.day >= 8).reduce((sum, r) => sum + r.revenue + r.tips, 0), cash: e.state.cash, history: e.state.history };
  });
  await page.getByRole('button', { name: 'Ledger', exact: true }).click();
  await page.getByTestId('revenue-week-label').filter({ hasText: 'Week 2' }).waitFor();
  const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  assert.equal(await page.getByTestId('revenue-week-total').textContent(), money(expected.total));
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).resumeScene());
  await page.waitForFunction(async () => {
    const size = (await import('/scripts/inspect.ts')).inspectScene()?.size, rect = document.querySelector('[data-testid="restaurant-scene"]')?.getBoundingClientRect();
    return size && rect && Math.abs(size.width - rect.width) < 2 && Math.abs(size.height - rect.height) < 2;
  });
  await page.waitForTimeout(300);
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene());
  const bounds = await page.getByRole('complementary', { name: 'The owner’s ledger' }).boundingBox();
  const chart = await page.getByTestId('revenue-chart').boundingBox();
  assert.ok(chart.y > bounds.y && chart.y + chart.height <= bounds.y + bounds.height);
  if (!process.argv.includes('no-shots')) {
    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`scripts/ledger-${mobile ? 'mobile' : 'desktop'}.png`, Buffer.from(data, 'base64')); await cdp.detach();
  }
  await page.getByRole('button', { name: 'Previous revenue week' }).click();
  assert.equal(await page.getByRole('button', { name: 'Previous revenue week' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Next revenue week' }).click();
  await page.getByRole('combobox', { name: 'Explore a day' }).selectOption('8');
  await page.getByRole('button', { name: 'Open Day 8 revenue receipt' }).click();
  await page.getByRole('heading', { name: 'Day 8 summary' }).waitFor();
  assert.equal(await page.getByTestId('report-revenue').textContent(), money(expected.history[7].revenue + expected.history[7].tips));
  await page.getByRole('button', { name: 'Back to ledger' }).click();
  const state = await page.evaluate(async () => { const e = (await import('/src/management/engine.ts')).restaurant; return { paused: e.paused, history: e.state.history }; });
  assert.equal(state.paused, false); assert.deepEqual(state.history, expected.history);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('LEDGER PASSED', JSON.stringify({ mobile, weeklyRevenue: expected.total, receipts: state.history.length, verified: 'real service history, chart, week navigation, selected-day receipt, non-pausing review', errors }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
