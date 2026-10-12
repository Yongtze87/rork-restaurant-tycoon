import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const mobile = process.argv.includes('mobile');
const expanded = process.argv.includes('expanded');
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: mobile ? { width: 320, height: 740 } : { width: 1440, height: 960 }, hasTouch: mobile, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Make it yours', exact: true }).waitFor();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectScene()?.render.calls > 200);
  const inspect = () => page.evaluate(async () => (await import('/scripts/inspect.ts')).inspectBuildGrid());
  const fit = async () => {
    await page.evaluate(async () => (await import('/scripts/inspect.ts')).resumeScene());
    await page.waitForFunction(async () => { const scene = (await import('/scripts/inspect.ts')).inspectScene(), rect = document.querySelector('[data-testid="restaurant-scene"]')?.getBoundingClientRect(); return scene && rect && Math.abs(scene.size.width - rect.width) < 2 && Math.abs(scene.size.height - rect.height) < 2; });
    await page.waitForTimeout(180);
  };
  const pick = async (x, z, height = .1) => {
    await fit();
    const p = await page.evaluate(async ([x, z, height]) => (await import('/scripts/inspect.ts')).restaurantTileScreen(x, z, height), [x, z, height]);
    if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  };
  const capture = async suffix => {
    await fit(); await page.evaluate(async () => (await import('/scripts/inspect.ts')).settleScene());
    const session = await page.context().newCDPSession(page);
    const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`scripts/grid-${mobile ? 'mobile' : 'desktop'}-${suffix}.png`, Buffer.from(data, 'base64'));
    await session.detach(); await page.evaluate(async () => (await import('/scripts/inspect.ts')).resumeScene());
  };
  if (!expanded) {
  if ((await inspect()).visible) throw new Error('Grid visible outside editing');
  await page.getByRole('button', { name: 'Make it yours', exact: true }).click();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectBuildGrid().cells === 100);
  await page.getByRole('button', { name: /Bistro table/ }).click();
  await page.getByTestId('placement-grid-readout').filter({ hasText: '2 × 2' }).waitFor();
  await pick(2, 7);
  await page.getByTestId('placement-grid-readout').filter({ hasText: 'Col 3 · Row 8' }).waitFor();
  const first = await inspect();
  if (!first.guides || first.footprint?.x !== 2 || !first.footprint.valid) throw new Error(`Grid picking failed ${JSON.stringify(first)}`);
  await capture('valid');
  await pick(9, 8);
  await page.getByTestId('placement-grid-readout').filter({ hasText: 'Blocked' }).waitFor();
  if (!(await page.getByRole('button', { name: 'Confirm', exact: true }).isDisabled())) throw new Error('Invalid placement can be confirmed');
  if ((await inspect()).footprint?.valid) throw new Error('Footprint not marked invalid');
  await capture('blocked');
  await pick(2, 7);
  await page.getByRole('button', { name: 'Rotate view', exact: true }).click();
  await pick(0, 7);
  await page.getByTestId('placement-grid-readout').filter({ hasText: 'Col 1 · Row 8' }).waitFor();
  await page.getByRole('button', { name: 'Rotate furniture', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate furniture', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate furniture', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate furniture', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.waitForFunction(async () => !(await import('/scripts/inspect.ts')).inspectBuildGrid().visible);
  const added = await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); return { cash: restaurant.state.cash, table: restaurant.state.furniture[restaurant.state.furniture.length - 1] }; });
  if (added.cash !== 1070 || added.table.x !== 0 || added.table.z !== 7) throw new Error(`Confirmed placement wrong: ${JSON.stringify(added)}`);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await pick(.5, 7.3, 1.1);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByTestId('placement-grid-readout').filter({ hasText: 'Fits here' }).waitFor();
  await pick(2, 7);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const moved = await page.evaluate(async id => { const { restaurant } = await import('/src/management/engine.ts'); return { cash: restaurant.state.cash, table: restaurant.state.furniture.find(f => f.id === id) }; }, added.table.id);
  if (moved.cash !== added.cash || moved.table.x !== 2 || moved.table.z !== 7) throw new Error(`Move changed finances or missed snap: ${JSON.stringify(moved)}`);
  await page.getByRole('button', { name: /Open restaurant/ }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  if ((await inspect()).visible) throw new Error('Grid visible in service');
  await page.getByRole('button', { name: 'Close panel' }).click();
  } else {
  // Verify expanded-grid width without purchasing upgrades in this isolated browser fixture.
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); restaurant.welcome(); restaurant.state.expanded = true; restaurant.notify(); });
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectBuildGrid().cells === 140);
  await page.getByRole('button', { name: /Olive planter/ }).click();
  await pick(12, 8);
  await capture('expanded');
  await page.getByTestId('placement-grid-readout').filter({ hasText: 'Col 13 · Row 9' }).waitFor();
  await page.getByRole('button', { name: 'Cancel placement', exact: true }).click();
  await page.waitForFunction(async () => !(await import('/scripts/inspect.ts')).inspectBuildGrid().visible);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('GRID PASSED', JSON.stringify({ mobile, expanded, tested: expanded ? '140-cell expanded grid, far-edge snap, cancel' : 'real grid taps, valid/invalid full footprints, rotated camera, rotate/confirm/move, unchanged cash on move, service hiding', errors }));
} finally { await browser?.close(); server.kill('SIGTERM'); }
