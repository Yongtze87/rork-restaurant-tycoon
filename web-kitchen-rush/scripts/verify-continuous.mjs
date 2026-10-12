import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const mobile = process.argv.includes('mobile'), expanded = mobile;
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
  await page.evaluate(async expanded => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); restaurant.welcome(); restaurant.state.expanded = expanded; restaurant.notify(); }, expanded);
  for (let n = 0; n < 60; n++) { await page.evaluate(async () => { const i = await import('/scripts/inspect.ts'); i.settleScene(); i.renderSceneFrame(false, 0); }); if (await page.evaluate(async () => (await import('/scripts/inspect.ts')).inspectBulletin()?.generated)) break; await page.waitForTimeout(100); }
  const session = await page.context().newCDPSession(page);
  const capture = async suffix => { if (process.argv.includes('no-shots')) return; await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectBulletin()?.generated); await page.evaluate(async () => { const i = await import('/scripts/inspect.ts'); i.renderSceneFrame(false, 0); i.settleScene(); }); await page.waitForTimeout(250); const { data } = await session.send('Page.captureScreenshot', { format: 'png' }); await writeFile(`scripts/continuous-${mobile ? 'mobile' : 'desktop'}-${suffix}.png`, Buffer.from(data, 'base64')); };
  await page.getByRole('button', { name: 'Neighborhood view', exact: true }).click();
  const readMap = () => page.evaluate(async () => { const { width } = await import('/src/management/types.ts'), { restaurant } = await import('/src/management/engine.ts'), { cityMapBounds } = await import('/src/management/city-map.ts'), i = await import('/scripts/inspect.ts'); const columns = width(restaurant.state); return i.inspectCityMap(columns, cityMapBounds(columns, 'city')); });
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectCity()?.wide);
  const map = await readMap(); assert(map.instances > 100 && map.hits === 0, 'Outer city missing or intercepts picking');
  assert(map.ndc.every(p => Math.abs(p[0]) < 1 && Math.abs(p[1]) < 1 && Math.abs(p[2]) < 1), `Map clipped: ${JSON.stringify(map)}`);
  await capture('city');
  for (const district of ['Market', 'Gardens', 'Rooftop', 'Whole city']) { await page.getByRole('button', { name: district, exact: true }).click(); await page.getByRole('button', { name: district, exact: true }).getAttribute('aria-pressed').then(v => assert(v === 'true', `District ${district}`)); }
  for (let a = 0; a < 4; a++) { await page.getByRole('button', { name: 'Rotate view', exact: true }).click(); const m = await readMap(); assert(m.ndc.every(p => Math.abs(p[0]) < 1 && Math.abs(p[1]) < 1), 'Rotated map clipped'); }
  await page.getByRole('button', { name: 'Rooftop', exact: true }).click(); await capture('rooftop');
  await page.getByRole('button', { name: /Open restaurant/ }).click();
  await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); for (let i = 0; i < 5000 && e.state.day < 3; i++) e.update(.1); });
  const running = await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); return { day: e.state.day, phase: e.state.phase, history: e.state.history, paused: e.paused }; });
  assert(running.day === 3 && running.phase === 'service' && !running.paused && running.history.length === 2, 'Did not automatically roll days');
  assert(await page.getByRole('dialog').count() === 0, 'Daily receipt interrupted game');
  await page.getByRole('button', { name: 'Read latest report: Day 2' }).click();
  const readClock = await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); const before = e.state.clock; e.update(.2); return { before, after: e.state.clock, paused: e.paused }; });
  assert(!readClock.paused && readClock.after > readClock.before, 'Reading receipt stopped service'); await capture('report');
  await page.getByRole('button', { name: 'Back to ledger' }).click(); await page.getByRole('button', { name: 'Close panel' }).click();
  // Simulate a closed browser using its persisted checkpoint, then reload through the real startup path.
  await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); const { SAVE_KEY } = await import('/src/management/types.ts'); e.suspend(); const data = JSON.parse(localStorage.getItem(SAVE_KEY)); data.lastActiveAt -= 600000; localStorage.setItem(SAVE_KEY, JSON.stringify(data)); });
  // pagehide would normally save the same snapshot; retain the simulated historical timestamp in memory too.
  await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); e.state.lastActiveAt -= 600000; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); return !e.catchingUp && e.state.day > 3; });
  await page.getByRole('heading', { name: 'While you were away' }).waitFor();
  const offline = await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); e.pause(true); return { day: e.state.day, cash: e.state.cash, served: e.state.lifetimeServed, summary: e.awaySummary, history: e.state.history, clock: e.state.clock }; });
  assert(offline.summary.days >= 2 && offline.summary.served > 0, 'Offline results not computed'); await capture('offline');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Resume service' }).waitFor();
  const restored = await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); return { day: e.state.day, cash: e.state.cash, served: e.state.lifetimeServed, clock: e.state.clock }; });
  assert(restored.day === offline.day && restored.cash === offline.cash && restored.served === offline.served && restored.clock === offline.clock, 'Reload duplicated business or lost pause');
  await page.getByRole('button', { name: 'Resume service' }).click(); await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Close for renovation' }).click();
  await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); for (let i = 0; i < 1000 && e.state.phase === 'service'; i++) e.update(.1); });
  await page.getByRole('button', { name: /Olive planter/ }).click();
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).resumeScene());
  await page.waitForFunction(async () => { const i = await import('/scripts/inspect.ts'), s = i.inspectScene(), r = document.querySelector('[data-testid="restaurant-scene"]')?.getBoundingClientRect(); return s && r && Math.abs(s.size.width - r.width) < 2 && Math.abs(s.size.height - r.height) < 2 && !i.inspectCity()?.wide; });
  await page.waitForTimeout(250);
  const tile = await page.evaluate(async expanded => (await import('/scripts/inspect.ts')).restaurantTileScreen(expanded ? 12 : 2, 8), expanded);
  if (mobile) await page.touchscreen.tap(tile.x, tile.y); else await page.mouse.click(tile.x, tile.y);
  await capture('build');
  const cash = await page.evaluate(async () => (await import('/src/management/engine.ts')).restaurant.state.cash);
  await page.getByTestId('placement-grid-readout').filter({ hasText: `Col ${expanded ? 13 : 3} · Row 9` }).waitFor(); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const placed = await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); return { cash: e.state.cash, item: e.state.furniture[e.state.furniture.length - 1] }; });
  assert(placed.cash === cash - 65 && placed.item.z === 8 && placed.item.x === (expanded ? 12 : 2), 'Map broke building');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflows'); assert(errors.length === 0, errors.join('\n'));
  console.log('CONTINUOUS CITY PASSED', JSON.stringify({ mobile, expanded, map, offline, restored, errors }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
