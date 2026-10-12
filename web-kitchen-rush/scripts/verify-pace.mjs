import { writeFile } from 'node:fs/promises';

export async function verifyPace(page) {
  const capture = async name => {
    await page.evaluate(async () => { (await import('/scripts/inspect.ts')).renderSceneFrame(); });
    const session = await page.context().newCDPSession(page);
    const image = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`scripts/kitchen-pace-${name}.png`, Buffer.from(image.data, 'base64'));
    await session.detach();
  };
  const sample = async seconds => {
    await page.evaluate(async seconds => {
      const { engine } = await import('/src/game/engine.ts');
      for (let t = 0; t < seconds - 1e-9; t += .02) engine.update(Math.min(.02, seconds - t), []);
      engine.notify();
    }, seconds);
    await page.waitForTimeout(80);
    return page.evaluate(async () => {
      (await import('/scripts/inspect.ts')).renderSceneFrame(false);
      const { engine } = await import('/src/game/engine.ts');
      return { orders: engine.state.orders, nextOrder: engine.state.nextOrder, missed: engine.state.missed, elapsed: engine.state.elapsed, paused: engine.state.paused };
    });
  };
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts');
    (await import('/scripts/inspect.ts')).settleScene();
    // Unlock in-memory only, so the real selection UI can exercise every shift.
    engine.state.progress = { solo: [1000, 1000, 1000], coop: [1000, 1000, 1000] }; engine.notify();
  });
  await page.getByRole('button', { name: 'Back to kitchens' }).click();
  await page.getByRole('radio', { name: 'Solo', exact: true }).click();
  await page.getByRole('button', { name: 'Last Call', exact: true }).click();
  await page.getByRole('button', { name: 'Let’s cook' }).click();
  const note = page.getByRole('note', { name: 'Service pace' });
  await note.getByText('Arrivals every 17s · Guests wait 70s', { exact: true }).waitFor();
  await capture('desktop');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(async width => (await import('/scripts/inspect.ts')).inspectScene()?.size.width === width, width);
    await note.scrollIntoViewIfNeeded();
    const clipped = await note.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return bounds.left < 0 || bounds.right > innerWidth || el.scrollWidth > el.clientWidth;
    });
    if (clipped) throw new Error(`Service pace note clips at ${width}px`);
    await capture(`mobile-${width}`);
  }
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await page.getByRole('region', { name: 'Active orders' }).waitFor();
  await page.evaluate(async () => { (await import('/src/game/engine.ts')).engine.start(); window.scrollTo(0, 0); });
  const initial = await sample(16.9);
  if (initial.orders.length !== 2 || initial.orders.some(o => o.duration !== 70)) throw new Error('Wrong Last Call opening orders');
  const arrived = await sample(.2);
  if (arrived.orders.length !== 3 || arrived.orders[2].duration !== 70) throw new Error('Scheduled diner did not arrive after 17 seconds');
  const orders = page.getByRole('region', { name: 'Active orders' });
  if (await orders.getByRole('article').count() !== 3) throw new Error('Scheduled ticket missing from HUD');
  for (const bar of await orders.getByRole('progressbar').all()) {
    if (await bar.getAttribute('max') !== '70') throw new Error('HUD is using stale patience');
  }
  await page.getByRole('button', { name: 'Pause game' }).click();
  const paused = await sample(0);
  if (!paused.paused || JSON.stringify(paused) !== JSON.stringify(await sample(5))) throw new Error('Paused pacing changed');
  await page.getByRole('button', { name: 'Keep cooking', exact: true }).click();
  const expired = await sample(53);
  if (expired.missed !== 2 || expired.orders.some(o => o.id <= 2)) throw new Error('Opening guests did not expire at their 70-second deadline');
  const outcomes = await page.evaluate(async () => (await import('/src/game/engine.ts')).engine.dining.guests.filter(g => g.id <= 2).map(g => g.outcome));
  if (outcomes.length !== 2 || outcomes.some(outcome => outcome !== 'missed')) throw new Error('Deadline did not reach the real diners');
  await page.getByRole('button', { name: 'Pause game' }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  const restarted = await sample(0);
  if (restarted.orders.length !== 2 || restarted.orders[0].remaining !== 70 || restarted.nextOrder !== 17 || restarted.missed !== 0) throw new Error('Restart kept an old pacing timer');
  console.log('PACE: real shift/mode selection, desktop and 390/320px briefing, 17-second arrival, 70-second HUD/diner deadline, pause and restart passed');
}
