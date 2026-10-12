import { writeFile } from 'node:fs/promises';

export async function verifyHighScore(page) {
  const record = page.getByRole('region', { name: 'High score', exact: true });
  const freeze = () => page.evaluate(async () => { (await import('/scripts/inspect.ts')).settleScene(); });
  const expectBest = async (score, mode, shift = 'Golden Hour') => {
    await record.getByText(`${score.toLocaleString('en-US')}`, { exact: true }).waitFor();
    if (!(await record.textContent()).includes(`High Score · ${mode}`) || !(await record.textContent()).includes(shift)) throw new Error('High score has incorrect mode/shift');
  };
  const finish = async score => {
    await page.evaluate(async score => {
      const { engine } = await import('/src/game/engine.ts');
      Object.assign(engine.state, { score, orderPoints: score - 20, tips: 40, penalties: 20, served: 8, missed: 1, time: .001 });
      engine.update(.02, []);
    }, score);
    await page.getByRole('heading', { name: 'Shift complete', exact: true }).waitFor();
  };
  const start = async () => {
    await page.getByRole('button', { name: 'Let’s cook' }).click();
    await page.getByRole('button', { name: 'Start shift', exact: true }).click();
    await page.getByRole('region', { name: 'Active orders' }).waitFor();
    await freeze();
  };
  const home = async () => {
    await page.getByRole('button', { name: 'Back to rooftop', exact: true }).click();
    await record.waitFor();
  };
  const capture = async name => {
    await page.waitForFunction(async () => {
      const { renderSceneFrame, inspectScene } = await import('/scripts/inspect.ts');
      // Wait for the newly selected kitchen to leave asset suspense before capture.
      renderSceneFrame(); renderSceneFrame();
      return (inspectScene()?.render.calls ?? 0) > 300;
    }, null, { timeout: 25000 });
    const session = await page.context().newCDPSession(page);
    const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`scripts/kitchen-high-score-${name}.png`, Buffer.from(shot.data, 'base64'));
    await session.detach();
  };
  await freeze();
  await record.getByText('Set your first record', { exact: true }).waitFor();
  await start(); await finish(620);
  await page.getByText('NEW BEST', { exact: true }).waitFor();
  await home(); await expectBest(620, 'Solo');
  // Assert app readiness directly; soundtrack/asset requests need not become idle.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
  await expectBest(620, 'Solo');
  await page.waitForFunction(async () => ((await import('/scripts/inspect.ts')).inspectScene()?.children ?? 0) > 20, null, { timeout: 25000 });
  await freeze();
  await start(); await finish(400);
  if (await page.getByText('NEW BEST', { exact: true }).count()) throw new Error('Lower score claimed a new best');
  await home(); await expectBest(620, 'Solo');
  await page.getByRole('radio', { name: 'Couch co-op', exact: true }).click();
  await record.getByText('Set your first record', { exact: true }).waitFor();
  await start(); await finish(900); await home(); await expectBest(900, 'Couch co-op');
  await page.getByRole('radio', { name: 'Solo', exact: true }).click();
  await page.getByRole('button', { name: 'Dinner Rush', exact: true }).click();
  await start(); await finish(1250); await home(); await expectBest(1250, 'Solo', 'Dinner Rush');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kitchen-rush-progress-v1')));
  if (JSON.stringify(saved) !== JSON.stringify({ solo: [620, 1250, 0], coop: [900, 0, 0] })) throw new Error('Record persistence lost a shift or mode');
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(async width => (await import('/scripts/inspect.ts')).inspectScene()?.size.width === width, width);
    await page.evaluate(() => window.scrollTo(0, 0));
    const problems = await record.evaluate(el => {
      const b = el.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('button')].filter(button => button.textContent.includes('Let’s cook') || button.getAttribute('role') === 'radio' || button.getAttribute('aria-label') === 'Settings');
      return { clipped: b.left < 0 || b.right > innerWidth || b.bottom > innerHeight || el.scrollWidth > el.clientWidth,
        overlaps: buttons.some(button => { const r = button.getBoundingClientRect(); return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top; }),
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    if (Object.values(problems).some(Boolean)) throw new Error(`High score layout failed at ${width}px: ${JSON.stringify(problems)}`);
    await capture(String(width));
  }
  console.log('HIGH SCORE: first-run invitation, actual finish/save/return/reload flow, lower-score protection, separate solo/co-op records, best across shifts, desktop/tablet/390/320px layout passed');
}
