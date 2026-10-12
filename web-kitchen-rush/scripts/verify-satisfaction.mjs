import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const mobile = process.argv.includes('mobile');
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: mobile ? { width: 320, height: 740 } : { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', e => errors.push(e.stack ?? e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open restaurant', exact: false }).waitFor();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectScene()?.render.calls > 200);
  await page.evaluate(async () => {
    const { restaurant } = await import('/src/management/engine.ts');
    restaurant.welcome(); restaurant.open();
    const { settleScene, renderSceneFrame } = await import('/scripts/inspect.ts'); settleScene();
    for (let i = 0; i < 430; i++) { restaurant.update(.1); renderSceneFrame(false, .1); }
    restaurant.pause(true);
    (await import('/scripts/inspect.ts')).resumeScene();
  });
  await page.getByRole('meter').first().waitFor();
  const verify = async () => {
    await page.waitForFunction(async () => {
      const { restaurant } = await import('/src/management/engine.ts');
      const { guestPatienceSeconds } = await import('/src/management/types.ts');
      const { guestSatisfaction } = await import('/src/management/satisfaction.ts');
      const meters = document.querySelectorAll('[role="meter"][data-guest-id]');
      return meters.length === restaurant.state.guests.length && [...meters].every(el => {
        const guest = restaurant.state.guests.find(g => String(g.id) === el.dataset.guestId);
        return guest && +el.getAttribute('aria-valuenow') === guestSatisfaction(guest, guestPatienceSeconds(restaurant.state));
      });
    });
  };
  await verify();
  const initial = await page.getByRole('meter').evaluateAll(els => els.map(el => ({ id: el.dataset.guestId, value: el.getAttribute('aria-valuenow') })));
  if (initial.length < 3) {
    const state = await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); return { phase: restaurant.state.phase, elapsed: restaurant.state.elapsed, paused: restaurant.paused, guests: restaurant.state.guests.map(g => ({ id: g.id, stage: g.stage })), event: restaurant.event }; });
    throw new Error(`Expected a live service with several customers: ${JSON.stringify({ initial, state, errors })}`);
  }
  await page.waitForTimeout(250);
  if (JSON.stringify(initial) !== JSON.stringify(await page.getByRole('meter').evaluateAll(els => els.map(el => ({ id: el.dataset.guestId, value: el.getAttribute('aria-valuenow') }))))) throw new Error('Paused meters changed');
  // Isolated browser-only fixture to inspect warning colors together on the real rigs.
  await page.evaluate(async () => {
    const { restaurant } = await import('/src/management/engine.ts');
    const { guestPatienceSeconds } = await import('/src/management/types.ts');
    const pending = restaurant.state.guests.filter(g => !['eating', 'leaving', 'arriving'].includes(g.stage));
    pending.forEach((guest, i) => { guest.waiting = guestPatienceSeconds(restaurant.state) * (i % 2 ? .9 : .65); });
    restaurant.notify();
    const { resumeScene } = await import('/scripts/inspect.ts'); resumeScene();
  });
  await verify(); await page.waitForTimeout(400);
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene());
  const meters = await page.getByRole('meter').evaluateAll(els => els.map(el => {
    const rect = el.getBoundingClientRect();
    return { id: el.dataset.guestId, mood: el.dataset.mood, x: rect.x, y: rect.y, w: rect.width, h: rect.height, pointer: getComputedStyle(el).pointerEvents, right: rect.right, bottom: rect.bottom };
  }));
  if (meters.some(m => m.x < 0 || m.right > (mobile ? 320 : 1440) || m.y < 0 || m.bottom > (mobile ? 740 : 960) || m.pointer !== 'none')) throw new Error(`Invalid meters: ${JSON.stringify(meters)}`);
  for (let i = 0; i < meters.length; i++) for (let j = i + 1; j < meters.length; j++) {
    const a = meters[i], b = meters[j];
    if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) throw new Error(`Overlapping meters ${a.id}/${b.id}`);
  }
  const session = await page.context().newCDPSession(page);
  const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`scripts/satisfaction-${mobile ? 'mobile' : 'desktop'}.png`, Buffer.from(data, 'base64'));
  await page.getByRole('button', { name: 'Rotate view', exact: true }).click();
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).resumeScene()); await page.waitForTimeout(400);
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene());
  const rotated = await page.getByRole('meter').first().boundingBox();
  if (Math.abs(rotated.x - meters[0].x) < 1 && Math.abs(rotated.y - meters[0].y) < 1) throw new Error('Meters did not follow camera rotation');
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByRole('heading', { name: 'Your little team' }).waitFor();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); });
  await page.waitForFunction(() => document.querySelectorAll('[role="meter"][data-guest-id]').length === 0);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('SATISFACTION PASSED', JSON.stringify({ mobile, liveGuests: initial.length, meters, errors }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
