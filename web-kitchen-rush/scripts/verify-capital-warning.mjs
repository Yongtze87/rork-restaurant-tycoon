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
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1024, height: 740 }, hasTouch: mobile, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Make it yours', exact: true }).waitFor();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectBulletin()?.generated, null, { timeout: 30000 });
  const initial = await page.evaluate(async () => {
    (await import('/scripts/inspect.ts')).settleScene();
    const { RestaurantEngine, restaurant } = await import('/src/management/engine.ts');
    const { getCapitalWarning } = await import('/src/management/capital-warning.ts');
    const e = new RestaurantEngine(); e.welcome();
    // Real recruitment, training and ingredient charges produce low capital, not fixture income.
    for (const error of [e.train(10), e.train(10), e.train(11), e.hire('chef'), e.hire('server'), e.open()]) if (error) throw new Error(error);
    for (let i = 0; i < 600 && !getCapitalWarning(e.state, e.operatingCost()); i++) e.update(.1);
    if (!getCapitalWarning(e.state, e.operatingCost())) throw new Error('No warning reached');
    restaurant.state = structuredClone(e.state); restaurant.notify();
    return { cash: e.state.cash, bills: e.operatingCost(), guests: e.state.guests.length };
  });
  await page.getByTestId('capital-warning').waitFor();
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).resumeScene());
  await page.waitForFunction(async () => {
    const size = (await import('/scripts/inspect.ts')).inspectScene()?.size, rect = document.querySelector('[data-testid="restaurant-scene"]')?.getBoundingClientRect();
    return size && rect && Math.abs(size.width - rect.width) < 2 && Math.abs(size.height - rect.height) < 2;
  });
  await page.waitForTimeout(300);
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene());
  const banner = await page.getByTestId('capital-warning').boundingBox(), scene = await page.getByTestId('restaurant-scene').boundingBox();
  assert.ok(scene.y >= banner.y + banner.height); assert.ok(scene.height > 100);
  if (!process.argv.includes('no-shots')) {
    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`scripts/capital-${mobile ? 'mobile' : 'desktop'}.png`, Buffer.from(data, 'base64')); await cdp.detach();
  }
  await page.getByRole('button', { name: 'Close for renovation', exact: true }).click();
  await page.getByRole('heading', { name: 'Closing for renovation' }).waitFor();
  const closed = await page.evaluate(async () => {
    const { restaurant: e } = await import('/src/management/engine.ts');
    const ids = e.state.guests.map(g => g.id), day = e.state.day;
    for (let i = 0; i < 1000 && e.state.phase === 'service'; i++) {
      e.update(.1); if (e.state.guests.some(g => !ids.includes(g.id))) throw new Error('New arrivals after closure');
    }
    const cash = e.state.cash;
    for (let i = 0; i < 100; i++) e.update(.1);
    if (e.state.cash !== cash) throw new Error('Charged an idle day');
    return { phase: e.state.phase, day: e.state.day, expectedDay: day + 1, cash, receipts: e.state.history.length, guests: e.state.guests.length };
  });
  assert.equal(closed.phase, 'planning'); assert.equal(closed.day, closed.expectedDay); assert.equal(closed.receipts, 1); assert.equal(closed.guests, 0);
  await page.getByRole('button', { name: 'Review finances', exact: true }).click();
  await page.getByRole('complementary', { name: 'The owner’s ledger' }).waitFor();
  const panel = await page.getByRole('complementary').boundingBox(), warning = await page.getByTestId('capital-warning').boundingBox();
  assert.ok(panel.y >= warning.y + warning.height);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('CAPITAL WARNING PASSED', JSON.stringify({ mobile, initial, closed, errors }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
