import { writeFile } from 'node:fs/promises';

export async function verifyRewards(page) {
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await page.getByRole('region', { name: 'Score', exact: true }).waitFor();
  await page.evaluate(async () => {
    const { settleScene } = await import('/scripts/inspect.ts'); settleScene();
    const { engine } = await import('/src/game/engine.ts'); engine.start();
    const { activeInput } = await import('/src/scene/KitchenScene.tsx'); activeInput.clear();
    const { RECIPES } = await import('/src/game/config.ts'); const st = engine.state.stations.find(s => s.kind === 'serve');
    engine.state.chefs.forEach((chef, i) => Object.assign(chef, { x: st.x - 1.3, z: st.z + (i ? .12 : -.12), facing: Math.PI / 2, held: { kind: 'plate', parts: [...RECIPES[i ? 'burger' : 'salad'].parts] } }));
    engine.notify();
  });
  const sample = async (seconds = 0) => {
    await page.evaluate(async seconds => {
      const { engine } = await import('/src/game/engine.ts'); const { activeInput } = await import('/src/scene/KitchenScene.tsx');
      for (let t = 0; t < seconds - 1e-9; t += .02) engine.update(Math.min(.02, seconds - t), activeInput.read());
      engine.notify();
    }, seconds);
    await page.waitForTimeout(80);
    await page.evaluate(async () => { const { renderSceneFrame } = await import('/scripts/inspect.ts'); renderSceneFrame(false); });
    return page.locator('[data-service-reward]').evaluateAll(nodes => nodes.map(el => {
      const rect = el.getBoundingClientRect();
      return { id: el.dataset.serviceReward, text: el.textContent, transform: el.style.transform, opacity: el.style.opacity, glint: el.querySelector('[data-reward-glints]').style.opacity, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, pointer: getComputedStyle(el).pointerEvents };
    }));
  };
  const capture = async name => {
    await page.evaluate(async () => { const { renderSceneFrame } = await import('/scripts/inspect.ts'); renderSceneFrame(); });
    const session = await page.context().newCDPSession(page);
    const image = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`scripts/kitchen-rewards-${name}.png`, Buffer.from(image.data, 'base64')); await session.detach();
  };
  await page.keyboard.press('e'); await page.keyboard.press('k');
  const popped = await sample(.16);
  if (popped.length !== 2 || popped[0].text !== '+70incl. +20 tip' || popped[1].text !== '+105incl. +25 tip' || popped.some(p => p.opacity !== '1' || p.pointer !== 'none')) throw new Error(`Incorrect earned rewards: ${JSON.stringify(popped)}`);
  if (popped[0].bottom > popped[1].y) throw new Error('Simultaneous rewards overlap');
  await capture('desktop');
  const risen = await sample(.4);
  if (risen[0].y >= popped[0].y) throw new Error('Reward did not fly upward');
  await page.keyboard.press('Escape'); const frozen = await sample(2);
  if (JSON.stringify(frozen) !== JSON.stringify(risen)) throw new Error('Reward continued during pause');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reduced = await sample();
  if (reduced.some(p => p.glint !== '0' || !p.transform.endsWith('scale(1)'))) throw new Error('Reduced motion retained bounce/glints');
  await page.getByRole('button', { name: 'Keep cooking', exact: true }).click();
  const still = await sample(.3);
  if (still.some((p, i) => p.transform !== reduced[i].transform)) throw new Error('Reduced motion reward drifted');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(async width => { const { inspectScene } = await import('/scripts/inspect.ts'); return inspectScene()?.size.width === width; }, width);
    await page.evaluate(async () => { const { renderSceneFrame } = await import('/scripts/inspect.ts'); renderSceneFrame(); });
    const small = await sample();
    if (small.some(p => p.x < 0 || p.right > width || p.y < 120 || p.bottom > 650)) throw new Error(`Reward clipped at ${width}px: ${JSON.stringify(small)}`);
    await capture(`mobile-${width}`);
  }
  await sample(1.2);
  if (await page.locator('[data-service-reward]').count()) throw new Error('Expired rewards remain');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts'); const { RECIPES } = await import('/src/game/config.ts');
    engine.select(0, 'solo'); engine.start(true);
    const st = engine.state.stations.find(s => s.kind === 'serve');
    Object.assign(engine.state.chefs[0], { x: st.x - 1.3, z: st.z, facing: Math.PI / 2, held: { kind: 'plate', parts: [...RECIPES.salad.parts] } });
    const { activeInput } = await import('/src/scene/KitchenScene.tsx'); activeInput.touch.pick = true;
  });
  const practice = await sample(.18);
  if (practice.length !== 1 || practice[0].text !== '+70incl. +20 tip') throw new Error('Solo practice touch delivery missing');
  if (practice[0].x < 0 || practice[0].right > 320) throw new Error('Mobile pop clips the reward');
  const statusWidth = await page.getByRole('status').filter({ hasText: 'Beautifully served' }).evaluate(el => el.getBoundingClientRect().width);
  if (statusWidth > 1) throw new Error('Old service toast obscures reward');
  await capture('mobile-pop');
  const fading = await sample(1.4);
  if (fading.length !== 1 || Number(fading[0].opacity) >= 1 || Number(fading[0].opacity) <= 0) throw new Error('Reward did not fade before expiry');
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.start(true); });
  await sample();
  if (await page.locator('[data-service-reward]').count()) throw new Error('Restart left rewards behind');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  console.log('REWARDS: exact totals/tips, E/K co-op, separated simultaneous cues, rising/fading, pause, live reduced motion, 390/320px, solo practice touch and restart passed');
}
