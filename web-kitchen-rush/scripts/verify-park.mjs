import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const mobile = process.argv.includes('mobile'), expanded = process.argv.includes('expanded');
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
let browser;
const assert = (value, message) => { if (!value) throw new Error(message); };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, hasTouch: mobile, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(25000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Open restaurant/ }).waitFor();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectPark()?.ready, null, { timeout: 40000 });
  await page.waitForTimeout(1200);
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectPark()?.ready);
  const read = () => page.evaluate(async () => (await import('/scripts/inspect.ts')).inspectPark());
  const step = seconds => page.evaluate(async seconds => { const i = await import('/scripts/inspect.ts'); for (let j = 0; j < Math.round(seconds * 20); j++) i.renderSceneFrame(false, .05); }, seconds);
  await page.evaluate(async expanded => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); restaurant.welcome(); restaurant.state.expanded = expanded; restaurant.notify(); const i = await import('/scripts/inspect.ts'); i.settleScene(); i.renderSceneFrame(false, 0); }, expanded);
  await page.getByRole('button', { name: 'Neighborhood view', exact: true }).click();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectCity()?.wide);
  // Reset + Vite's dependency optimization can replace the Canvas after the first ready frame.
  for (let attempt = 0; attempt < 100; attempt++) {
    await page.evaluate(async () => { const i = await import('/scripts/inspect.ts'); i.renderSceneFrame(false, 0); });
    if ((await read())?.ready) break;
    await page.waitForTimeout(100);
  }
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene());
  const first = await read();
  assert(first.ready && first.benches.length === 2 && first.visitors.length === 2, `Missing park: ${JSON.stringify({first, errors})}`);
  assert(first.benches.every(bench => bench.size[0] > 2 && bench.size[1] > .6 && bench.size[1] < 1.6 && bench.seatHeight > .2 && bench.seatHeight < .9), `Bench scale / seat probe incorrect: ${JSON.stringify(first.benches)}`);
  assert(first.visitors.some(v => v.stage === 'resting') && first.visitors.some(v => v.stage === 'waiting'), 'No seated and waiting poses');
  assert(first.hits === 0, 'Park intercepts picking');
  assert(first.ndc.every(p => Math.abs(p[0]) < 1 && Math.abs(p[1]) < 1), 'Park outside neighborhood frame');
  const session = await page.context().newCDPSession(page);
  const capture = async name => { await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene()); const { data } = await session.send('Page.captureScreenshot', { format: 'png' }); await writeFile(`scripts/park-${mobile ? 'mobile' : 'desktop'}-${name}.png`, Buffer.from(data, 'base64')); };
  await capture('wide');
  const stages = new Set(), poseAtStart = JSON.stringify(first.visitors);
  for (let s = 0; s < 56; s++) { await step(1); const p = await read(); p.visitors.forEach(v => stages.add(v.stage)); assert(Math.abs(p.visitors[0].position[0] - p.visitors[1].position[0]) > 2, 'Park visitors overlap'); }
  assert(['waiting', 'walking', 'sitting', 'resting', 'standing'].every(s => stages.has(s)), `Missing visitor stages: ${[...stages]}`);
  assert(JSON.stringify((await read()).visitors) !== poseAtStart || (await read()).time > 55, 'Park never moved');
  const finances = await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); return [restaurant.state.cash, restaurant.state.totals.served, restaurant.state.guests.length]; });
  assert(JSON.stringify(finances) === JSON.stringify([1250, 0, 0]), 'Park mutated restaurant finances/orders');
  await page.evaluate(async () => { const i = await import('/scripts/inspect.ts'); i.frameParkDetail(); }); await capture('detail');
  await page.evaluate(async () => (await import('/src/management/engine.ts')).restaurant.pause(true));
  const paused = await read(); await step(2); assert(JSON.stringify((await read()).visitors) === JSON.stringify(paused.visitors), 'Paused park moved');
  await page.evaluate(async () => (await import('/src/management/engine.ts')).restaurant.pause(false));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches); await step(.1);
  const reduced = await read(); await step(2); assert((await read()).time === reduced.time && JSON.stringify((await read()).visitors) === JSON.stringify(reduced.visitors), 'Reduced motion did not freeze park');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForFunction(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = await read(); await step(2); assert((await read()).time === hidden.time, 'Hidden park moved');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.state.phase = 'service'; restaurant.setSpeed(3); });
  const slow = await read(); await step(1); assert(Math.abs((await read()).time - slow.time - 3) < .001, 'Park ignored 3x service');
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.state.phase = 'report'; restaurant.notify(); });
  const report = await read(); await step(2); assert((await read()).time === report.time, 'Report park moved');
  await page.evaluate(async expanded => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); restaurant.welcome(); restaurant.state.expanded = expanded; restaurant.notify(); (await import('/scripts/inspect.ts')).renderSceneFrame(false, 0); }, expanded);
  assert((await read()).time === 0, 'Reset did not restart visitors');
  await page.getByRole('button', { name: 'Rotate view', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectBuildGrid().visible);
  assert((await page.evaluate(async () => (await import('/scripts/inspect.ts')).inspectBuildGrid())).cells === (expanded ? 140 : 100), 'Build grid damaged');
  assert(!(await page.evaluate(async () => (await import('/scripts/inspect.ts')).inspectCity())).wide, 'Build kept wide park camera');
  const fit = async () => {
    await page.evaluate(async () => (await import('/scripts/inspect.ts')).resumeScene());
    await page.waitForFunction(async () => { const s = (await import('/scripts/inspect.ts')).inspectScene(), rect = document.querySelector('[data-testid="restaurant-scene"]')?.getBoundingClientRect(); return s && rect && Math.abs(s.size.width - rect.width) < 2 && Math.abs(s.size.height - rect.height) < 2; });
    await page.waitForTimeout(180);
  };
  await fit(); await capture('build');
  await page.getByRole('button', { name: /Olive planter/ }).click(); await fit();
  const tileX = expanded ? 12 : 2;
  const tile = await page.evaluate(async x => (await import('/scripts/inspect.ts')).restaurantTileScreen(x, 8), tileX);
  if (mobile) await page.touchscreen.tap(tile.x, tile.y); else await page.mouse.click(tile.x, tile.y);
  await page.getByTestId('placement-grid-readout').filter({ hasText: `Col ${tileX + 1} · Row 9` }).waitFor();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const placed = await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); return { cash: restaurant.state.cash, item: restaurant.state.furniture[restaurant.state.furniture.length - 1] }; });
  assert(placed.cash === 1185 && placed.item.x === tileX && placed.item.z === 8, `Park interfered with placement: ${JSON.stringify(placed)}`);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflow');
  assert(errors.length === 0, errors.join('\n'));
  console.log('PARK PASSED', JSON.stringify({ mobile, expanded, stages: [...stages], benches: first.benches, render: first.render, errors }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
