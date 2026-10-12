import { deepStrictEqual, strict as assert } from 'node:assert';
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
  page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Make it yours', exact: true }).waitFor();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectBulletin()?.generated, null, { timeout: 35000 });
  const fit = async () => {
    await page.evaluate(async () => (await import('/scripts/inspect.ts')).resumeScene());
    await page.waitForFunction(async () => { const scene = (await import('/scripts/inspect.ts')).inspectScene(), rect = document.querySelector('[data-testid="restaurant-scene"]')?.getBoundingClientRect(); const inspector = document.querySelector('[aria-label="Furniture placement"]')?.getBoundingClientRect(); return scene && rect && (!inspector || Math.abs(rect.width - innerWidth) < 2 && rect.bottom <= inspector.top) && Math.abs(scene.size.width - rect.width) < 2 && Math.abs(scene.size.height - rect.height) < 2; });
    await page.waitForTimeout(300);
    // Bound software-WebGL work between interactions; each pick/capture resumes and fits the real scene.
    await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene());
  };
  const pick = async (x, z) => {
    await page.locator('[aria-label="Furniture placement"]').waitFor();
    await page.waitForFunction(async () => Boolean((await import('/scripts/inspect.ts')).inspectBuildGrid().footprint));
    await fit();
    const point = await page.evaluate(async ([x, z]) => (await import('/scripts/inspect.ts')).restaurantTileScreen(x, z, .1), [x, z]);
    if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y, { delay: 80 });
    await page.getByTestId('placement-grid-readout').filter({ hasText: `Col ${x + 1} · Row ${z + 1}` }).waitFor();
  };
  const capture = async suffix => {
    if (process.argv.includes('no-shots')) return;
    await fit(); const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`scripts/interiors-${mobile ? 'mobile' : 'desktop'}-${suffix}.png`, Buffer.from(data, 'base64')); await cdp.detach();
  };
  const snapshot = () => page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); return { cash: e.state.cash, furniture: e.state.furniture }; });
  await page.getByRole('button', { name: 'Make it yours', exact: true }).click();
  await page.getByRole('heading', { name: 'Interiors', exact: true }).waitFor();
  await capture('shop');
  await page.getByRole('button', { name: 'Dining', exact: true }).click();
  await page.getByRole('button', { name: /Preview Bistro table/ }).click();
  assert.equal((await snapshot()).cash, 1250);
  await pick(9, 8);
  await page.getByTestId('placement-grid-readout').filter({ hasText: 'Blocked' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Confirm', exact: true }).isDisabled(), true);
  await pick(2, 7);
  await page.getByTestId('placement-grid-readout').filter({ hasText: 'Col 3 · Row 8' }).waitFor();
  await capture('placement');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const placed = await snapshot(); assert.equal(placed.cash, 1070); assert.equal(placed.furniture.length, 9);
  const table = placed.furniture[placed.furniture.length - 1]; assert.equal(table.x, 2); assert.equal(table.z, 7);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: /In your room/ }).click();
  await page.getByRole('button', { name: 'Edit Bistro table at column 3, row 8' }).click();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await pick(0, 7); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const moved = await snapshot(); assert.equal(moved.cash, 1070); assert.equal(moved.furniture.find(f => f.id === table.id).x, 0);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Decor', exact: true }).click();
  await page.getByRole('button', { name: /Preview Olive planter/ }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const bought = await snapshot(); assert.equal(bought.cash, 1005);
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene());
  // Release the SwiftShader canvas before reopening the same origin with its existing local save.
  await page.goto('about:blank', { waitUntil: 'commit' });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('button', { name: /Open restaurant/ }).waitFor();
  deepStrictEqual(await snapshot(), bought);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('INTERIORS PASSED', JSON.stringify({ mobile, placed: table, bought: bought.cash, verified: 'raycast blocked/valid, paid table+decor, owned selection, free move, reload', errors }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
