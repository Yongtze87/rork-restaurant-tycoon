import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const mobile = process.argv.includes('mobile');
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: mobile ? { width: 320, height: 740 } : { width: 1440, height: 960 }, hasTouch: mobile, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Open restaurant/ }).waitFor();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectScene()?.render.calls > 200);
  if (await page.getByTestId('cash-income').count()) throw new Error('Unrequested initial cash effect');
  await page.getByRole('button', { name: /Open restaurant/ }).click();
  const payment = await page.evaluate(async () => {
    const { restaurant } = await import('/src/management/engine.ts');
    const inspect = await import('/scripts/inspect.ts'); inspect.settleScene();
    for (let i = 0; i < 1000 && !restaurant.incomeReceipts.length; i++) { restaurant.update(.1); inspect.renderSceneFrame(false, .1); }
    for (let i = 0; i < 4; i++) restaurant.update(.1);
    restaurant.pause(true); inspect.resumeScene();
    return { ...restaurant.incomeReceipts[0], balance: restaurant.state.cash };
  });
  await page.getByTestId('guest-payment').waitFor(); await page.getByTestId('cash-income').waitFor();
  const read = () => page.getByTestId('guest-payment').evaluate(el => ({ text: el.textContent, time: el.getAnimations()[0]?.currentTime, state: el.getAnimations()[0]?.playState, transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity }));
  const initial = await read();
  if (!initial.text.includes(`+$${payment.amount}`) || !initial.text.includes(`$${payment.tip} tip`) || initial.state !== 'paused') throw new Error(`Wrong payment ${JSON.stringify({ initial, payment })}`);
  if (mobile) {
    const overlapsControl = await page.getByTestId('cash-income').evaluate(el => { const r = el.getBoundingClientRect(); return [...document.querySelectorAll('button')].some(button => { const b = button.getBoundingClientRect(); return b.width && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top; }); });
    if (overlapsControl) throw new Error('Cash notice covers a control');
  }
  const frozenCash = await page.getByTestId('cash').textContent();
  await page.waitForTimeout(250);
  if (JSON.stringify(initial) !== JSON.stringify(await read()) || frozenCash !== await page.getByTestId('cash').textContent()) throw new Error('Paused feedback changed');
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene());
  const session = await page.context().newCDPSession(page);
  const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`scripts/cash-${mobile ? 'mobile' : 'desktop'}.png`, Buffer.from(data, 'base64'));
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.pause(false); });
  await page.waitForFunction(balance => document.querySelector('[data-testid="cash"]')?.textContent === new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(balance), payment.balance);
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.pause(true); (await import('/scripts/inspect.ts')).resumeScene(); });
  await page.waitForTimeout(200);
  const bounds = await page.getByTestId('guest-payment').evaluate(el => {
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, pointer: getComputedStyle(el).pointerEvents };
  });
  if (bounds.x < 0 || bounds.right > (mobile ? 320 : 1440) || bounds.pointer !== 'none') throw new Error(`Bad payment bounds ${JSON.stringify(bounds)}`);
  const register = await page.getByTestId('cash-register').boundingBox();
  if (register.x < 0 || register.x + register.width > (mobile ? 320 : 1440)) throw new Error('Register overflow');
  // The combined label reserves the animated receipt's full travel above all satisfaction meters.
  const overlap = await page.evaluate(() => {
    const payment = document.querySelector('[data-testid="guest-payment"]').getBoundingClientRect();
    return [...document.querySelectorAll('[role="meter"]')].some(el => { const r = el.getBoundingClientRect(); return payment.left < r.right && payment.right > r.left && payment.top < r.bottom && payment.bottom > r.top; });
  });
  if (overlap) throw new Error('Payment obscures a satisfaction meter');
  await page.getByRole('button', { name: 'Rotate view', exact: true }).click();
  await page.evaluate(async () => (await import('/scripts/inspect.ts')).resumeScene()); await page.waitForTimeout(200);
  const rotated = await page.getByTestId('guest-payment').boundingBox();
  if (Math.abs(rotated.x - bounds.x) < 1 && Math.abs(rotated.y - bounds.y) < 1) throw new Error('Payment did not follow camera');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="guest-payment"]')).animationName === 'none');
  const reduced = await read(); if (reduced.transform !== 'none' || reduced.opacity !== '1') throw new Error(`Reduced motion not static ${JSON.stringify(reduced)}`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.querySelector('[data-testid="guest-payment"]').getAnimations()[0]?.playState === 'paused');
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); });
  await page.waitForFunction(() => !document.querySelector('[data-testid="guest-payment"]') && !document.querySelector('[data-testid="cash-income"]'));
  if (await page.getByTestId('cash').textContent() !== '$1,250') throw new Error('Reset balance not settled');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('CASH PASSED', JSON.stringify({ mobile, payment, bounds, paused: initial.state, reduced, errors }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
