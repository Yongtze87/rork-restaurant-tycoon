import { writeFile } from 'node:fs/promises';

export async function verifyMenu(page) {
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  const board = page.getByRole('complementary', { name: 'Kitchen menu' });
  await board.getByRole('button', { name: 'Hide kitchen menu' }).waitFor();
  await page.evaluate(async () => {
    const { settleScene } = await import('/scripts/inspect.ts'); settleScene();
    const { engine } = await import('/src/game/engine.ts'); engine.start();
    for (let t = 0; t < 12; t += .02) engine.update(.02, []);
    engine.notify();
  });
  const capture = async name => {
    await page.evaluate(async () => { const { renderSceneFrame } = await import('/scripts/inspect.ts'); renderSceneFrame(); });
    const session = await page.context().newCDPSession(page);
    const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`scripts/kitchen-menu-${name}.png`, Buffer.from(shot.data, 'base64')); await session.detach();
  };
  await capture('desktop');
  if (await board.getByRole('article').count() !== 2) throw new Error('Incomplete cookable menu');
  const overlap = await page.evaluate(() => {
    const menu = document.querySelector('[aria-label="Kitchen menu"]').getBoundingClientRect();
    const orders = document.querySelector('[aria-label="Active orders"]').getBoundingClientRect();
    return menu.left < orders.right && menu.top < orders.bottom;
  });
  if (overlap) throw new Error('Menu overlaps order tickets');
  await board.getByRole('button', { name: 'Hide kitchen menu' }).click();
  await board.getByRole('button', { name: 'Show kitchen menu' }).focus();
  await page.keyboard.press('Space');
  await board.getByRole('button', { name: 'Hide kitchen menu' }).waitFor();
  if (await page.evaluate(async () => { const { activeInput } = await import('/src/scene/KitchenScene.tsx'); return activeInput.read()[0].dash; })) throw new Error('Opening menu triggered dash');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Keep cooking', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts'); const { RECIPES } = await import('/src/game/config.ts');
    engine.state.chefs[0].held = { kind: 'plate', parts: [...RECIPES.salad.parts] };
    engine.interact(engine.state.chefs[0], engine.state.stations.find(station => station.kind === 'serve')); engine.notify();
  });
  const served = await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); return { served: engine.state.served, oldTicketPresent: engine.state.orders.some(order => order.id === 1), counts: ['salad', 'burger'].map(recipe => engine.state.orders.filter(order => order.recipe === recipe).length) }; });
  if (served.served !== 1 || served.oldTicketPresent) throw new Error('Test delivery did not fulfill its ticket');
  for (const [index, name] of ['Garden salad', 'Rooftop burger'].entries()) await board.getByRole('article', { name }).getByText(served.counts[index] ? `${served.counts[index]} ordered` : 'No orders', { exact: true }).waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    // The responsive transition collapses once; explicitly close between narrow widths.
    const hide = board.getByRole('button', { name: 'Hide kitchen menu' });
    if (await hide.isVisible()) await hide.click();
    await board.getByRole('button', { name: 'Show kitchen menu' }).click();
    const overflow = await board.evaluate(el => el.scrollWidth > el.clientWidth || el.getBoundingClientRect().right > innerWidth || el.getBoundingClientRect().left < 0);
    if (overflow) throw new Error(`Menu overflow at ${width}px`);
    await capture(`mobile-${width}`);
  }
  await board.getByRole('button', { name: 'Hide kitchen menu' }).click();
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.select(0, 'solo'); engine.start(true); });
  await capture('practice');
  await board.getByRole('button', { name: 'Show kitchen menu' }).click();
  await board.getByText('Practice any dish. Serve at the right hatch.').waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await board.getByRole('button', { name: 'Hide kitchen menu' }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  console.log('MENU: recipes, live service counts, desktop/mobile 390/320, keyboard toggle without dash, pause/resume, practice and reduced motion passed');
}
