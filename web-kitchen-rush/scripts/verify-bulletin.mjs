import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const mobile = process.argv.includes('mobile'), expanded = process.argv.includes('expanded');
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
let browser;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, hasTouch: mobile });
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Open restaurant/ }).waitFor();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectBulletin()?.generated, null, { timeout: 40000 });
  await page.waitForTimeout(1000);
  await page.evaluate(async expanded => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); restaurant.welcome(); restaurant.state.expanded = expanded; restaurant.notify(); const i = await import('/scripts/inspect.ts'); i.settleScene(); i.renderSceneFrame(false, 0); }, expanded);
  await page.getByRole('button', { name: 'Neighborhood view', exact: true }).click();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectCity()?.wide && (await import('/scripts/inspect.ts')).inspectBulletin()?.generated);
  await page.evaluate(async () => { await document.fonts.ready; const i = await import('/scripts/inspect.ts'); i.settleScene(); i.renderSceneFrame(false, 0); });
  const read = () => page.evaluate(async () => (await import('/scripts/inspect.ts')).inspectBulletin());
  const step = seconds => page.evaluate(async seconds => { const i = await import('/scripts/inspect.ts'); for (let j = 0; j < Math.round(seconds * 20); j++) i.renderSceneFrame(false, .05); }, seconds);
  // Asset Suspense can briefly remount while Vite finishes optimizing imports after reset.
  for (let attempt = 0; attempt < 100; attempt++) {
    await page.evaluate(async () => { const i = await import('/scripts/inspect.ts'); i.settleScene(); i.renderSceneFrame(false, 0); });
    if ((await read())?.generated) { await page.waitForTimeout(100); if ((await read())?.generated) break; }
    await page.waitForTimeout(100);
  }
  const first = await read();
  console.log('BULLETIN LOADED', JSON.stringify({ size: first.size, generated: first.generated, errors }));
  assert(first.readout.guests === 0 && first.screens.length === 2 && first.generated, `Missing screen/model: ${JSON.stringify(first)}`);
  assert(first.screens[0].texture === first.screens[1].texture, 'Display allocates duplicate textures');
  assert(first.hits === 0, 'Board blocks scene picking');
  assert(first.ndc.every(p => Math.abs(p[0]) < 1 && Math.abs(p[1]) < 1), 'Board outside neighborhood framing');
  const session = await page.context().newCDPSession(page);
  const capture = async suffix => { await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene()); const { data } = await session.send('Page.captureScreenshot', { format: 'png' }); await writeFile(`scripts/bulletin-${mobile ? 'mobile' : 'desktop'}-${suffix}.png`, Buffer.from(data, 'base64')); };
  await capture('wide');
  await step(8); assert((await read()).page !== first.page, 'Notice rotation did not advance');
  await page.evaluate(async () => (await import('/src/management/engine.ts')).restaurant.pause(true)); await step(.1);
  const paused = await read(); await step(10); assert((await read()).time === paused.time && (await read()).screens[0].version === paused.screens[0].version, 'Paused board animates/redraws');
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.pause(false); restaurant.setDish('salad', true, 29); restaurant.setDish('burger', false, 38); }); await step(.1);
  assert((await read()).readout.notices.some(n => n.id === 'salad' && n.detail.includes('$29')) && !(await read()).readout.notices.some(n => n.id === 'burger'), 'Stale menu');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reduced = await read(); await step(9); assert((await read()).time === reduced.time, 'Reduced motion rotates notices');
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.open(); for (let i = 0; i < 400; i++) restaurant.update(.1); }); await step(.1);
  const service = await read(); const trueCount = await page.evaluate(async () => (await import('/src/management/engine.ts')).restaurant.state.guests.length);
  assert(service.readout.guests === trueCount && trueCount > 0 && service.readout.status === 'OPEN NOW', 'Readout not tied to actual service');
  assert(service.time === reduced.time, 'Reduced motion did not remain static when data changed');
  await page.getByRole('button', { name: 'Read street bulletin' }).click();
  await page.getByRole('dialog', { name: 'Street bulletin' }).waitFor();
  assert(Number(await page.getByTestId('bulletin-count').textContent()) === trueCount, 'Accessible count disagrees with screen');
  await capture('reader'); await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).frameBulletinDetail()); await capture('detail');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForFunction(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = await read(); await step(2); assert((await read()).time === hidden.time, 'Hidden board rotates');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.evaluate(async () => (await import('/src/management/engine.ts')).restaurant.setSpeed(3)); const beforeSpeed = await read(); await step(1); assert(Math.abs((await read()).time - beforeSpeed.time - 3) < .001, 'Board ignores 3x');
  await page.evaluate(async () => (await import('/src/management/engine.ts')).restaurant.closeEarly()); await step(.1); assert((await read()).readout.notices[0].id === 'closing', 'No last orders notice');
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); for (let i = 0; i < 1600 && restaurant.state.phase === 'service'; i++) restaurant.update(.1); }); await step(.1);
  const next = await read(); assert(next.readout.status === 'BEFORE SERVICE' && next.readout.guests === 0, 'Wrong renovation count/status');
  assert(next.time < 1 && next.page === 0 && !next.readout.notices.some(n => n.id === 'opening'), 'Automatic next day did not reset board');
  await page.evaluate(async expanded => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); restaurant.welcome(); restaurant.state.expanded = expanded; restaurant.notify(); (await import('/scripts/inspect.ts')).renderSceneFrame(false, 0); }, expanded);
  assert((await read()).time === 0 && (await read()).readout.guests === 0, 'Reset kept stale news/count');
  await page.getByRole('button', { name: 'Rotate view', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click(); await page.getByRole('button', { name: /Olive planter/ }).click();
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).resumeScene());
  await page.waitForFunction(async () => { const i = await import('/scripts/inspect.ts'), s = i.inspectScene(), rect = document.querySelector('[data-testid="restaurant-scene"]')?.getBoundingClientRect(); return s && rect && Math.abs(s.size.width - rect.width) < 2 && Math.abs(s.size.height - rect.height) < 2 && !i.inspectCity()?.wide; });
  await page.waitForTimeout(180); const x = expanded ? 12 : 2;
  const tile = await page.evaluate(async x => (await import('/scripts/inspect.ts')).restaurantTileScreen(x, 8), x);
  if (mobile) await page.touchscreen.tap(tile.x, tile.y); else await page.mouse.click(tile.x, tile.y);
  await page.getByTestId('placement-grid-readout').filter({ hasText: `Col ${x + 1} · Row 9` }).waitFor(); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const placed = await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); return { cash: restaurant.state.cash, item: restaurant.state.furniture[restaurant.state.furniture.length - 1] }; });
  assert(placed.cash === 1185 && placed.item.x === x && placed.item.z === 8, 'Board affected placement/economy');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow'); assert(errors.length === 0, errors.join('\n'));
  console.log('BULLETIN PASSED', JSON.stringify({ mobile, expanded, guests: trueCount, model: first.size, render: first.render, errors }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
