import { deepStrictEqual } from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const mobile = process.argv.includes('mobile');
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
let browser, page; const navigation = [], devMessages = [];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: mobile });
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigation.push(frame.url()); });
  page.on('console', message => { if (message.text().includes('[vite]')) devMessages.push(message.text()); });
  page.setDefaultTimeout(15000); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Open restaurant/ }).waitFor();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectBulletin()?.generated, null, { timeout: 35000 });
  await page.waitForTimeout(750);
  await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); e.welcome(); });
  await page.getByRole('button', { name: /Open restaurant/ }).click();
  await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); for (let i = 0; i < 850; i++) e.update(.1); e.pause(true); });
  await page.waitForFunction(() => document.querySelector('[data-special="true"]'));
  const stars = await page.locator('[data-special="true"]').evaluateAll(nodes => nodes.map(n => ({ label: n.getAttribute('aria-valuetext'), pointer: getComputedStyle(n).pointerEvents })));
  assert(stars.every(s => s.label.includes('Star guest') && s.pointer === 'none'), 'Star labels missing or intercept input');
  await page.getByRole('button', { name: 'View daily challenges' }).click();
  await page.locator('section[aria-label="Day 1 challenges"]').waitFor();
  const progress = await page.locator('section[aria-label="Day 1 challenges"]').locator('progress').evaluateAll(nodes => nodes.map(n => ({ value: n.value, max: n.max })));
  assert(progress.length === 3 && progress.some(p => p.value > 0), 'No real challenge progress');
  await page.waitForTimeout(300);
  if (!process.argv.includes('no-shots')) {
    const cdp = await page.context().newCDPSession(page); const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`scripts/challenges-${mobile ? 'mobile' : 'desktop'}.png`, Buffer.from(data, 'base64'));
  }
  await page.locator('button[aria-label="Close panel"]').click();
  const snapshot = await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); e.save(); return { cash: e.state.cash, board: e.state.dailyChallenges, bonus: e.state.lifetimeChallengeBonus }; });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Resume service' }).waitFor();
  const restored = await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); return { cash: e.state.cash, board: e.state.dailyChallenges, bonus: e.state.lifetimeChallengeBonus }; });
  deepStrictEqual(restored, snapshot, 'Reload rerolled board or changed rewards');
  await page.getByRole('button', { name: 'Resume service' }).click();
  const receipt = await page.evaluate(async () => { const { restaurant: e } = await import('/src/management/engine.ts'); for (let i = 0; i < 2600 && e.state.day === 1; i++) e.update(.1); e.pause(true); return e.state.history[0]; });
  assert(receipt.challenges.length === 3 && receipt.challenges.some(c => c.rewarded), 'No earned reward archived');
  await page.getByRole('button', { name: 'Read latest report: Day 1' }).click();
  assert((await page.getByTestId('report-challenge-bonus').textContent()).includes('paid separately'), 'Reward accounting missing');
  await page.getByRole('button', { name: 'Back to ledger' }).click();
  await page.locator('section[aria-label="Day 2 challenges"]').waitFor();
  const bounds = await page.locator('section[aria-label="Day 2 challenges"]').boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= (mobile ? 390 : 1280), 'Board overflows');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflows'); assert(!errors.length, errors.join('\n'));
  console.log('DAILY CHALLENGES PASSED', JSON.stringify({ mobile, stars: stars.length, progress, snapshot, receipt, errors }));
} catch (error) {
  console.error('RUNTIME DIAGNOSTIC', { navigation, devMessages }); throw error;
} finally { await browser?.close(); server.kill('SIGTERM'); }
