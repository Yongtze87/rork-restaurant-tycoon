import { writeFile } from 'node:fs/promises';

export async function verifyWardrobe(page) {
  const inspect = async () => page.evaluate(async () => {
    const { renderSceneFrame, inspectChefOutfits } = await import('/scripts/inspect.ts'); renderSceneFrame(false, .02); return inspectChefOutfits();
  });
  const waitForRigs = async count => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if ((await inspect()).length === count) return;
      await page.waitForTimeout(100);
    }
    throw new Error(`Expected ${count} live rigs: ${JSON.stringify(await inspect())}`);
  };
  const capture = async name => {
    await page.waitForTimeout(180);
    const session = await page.context().newCDPSession(page);
    const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`scripts/kitchen-wardrobe-${name}.png`, Buffer.from(shot.data, 'base64')); await session.detach();
  };
  const assertColors = async (id, hat, apron, withPreview = true) => {
    const entries = (await inspect()).filter(c => c.id === id);
    if (entries.length !== (withPreview ? 2 : 1) || entries.some(c => c.hat.hex !== hat || c.apron.hex !== apron)) throw new Error(`Wrong outfit for chef ${id}: ${JSON.stringify(entries)}`);
  };
  const dialog = page.getByRole('dialog');
  const color = (part, name) => dialog.getByRole('radiogroup', { name: `${part} color` }).getByRole('radio', { name, exact: true }).click();
  const open = async () => {
    await page.getByRole('button', { name: 'Your chefs' }).click();
    await dialog.getByRole('img', { name: /preview:/ }).waitFor();
    await waitForRigs(3);
  };
  await page.evaluate(async () => { (await import('/scripts/inspect.ts')).settleScene(); });
  await capture('home');
  await open();
  const initial = await inspect();
  await color('Hat', 'Gold'); await color('Apron', 'Teal');
  await assertColors(0, 'f2b743', '3b9c98'); await assertColors(1, 'fff2d7', 'fff2d7', false);
  const changed = await inspect();
  for (const entry of changed) {
    const before = initial.find(c => c.id === entry.id && c.preview === entry.preview);
    if (!before) throw new Error(`Missing initial rig ${JSON.stringify({ initial, changed })}`);
    if (before.hat.geometry !== entry.hat.geometry || before.apron.geometry !== entry.apron.geometry) throw new Error('Color selection rebuilt the rig');
  }
  await capture('crocodile');
  await dialog.getByRole('radio', { name: 'Chef 2 Mouse' }).click(); await color('Hat', 'Dusk'); await color('Apron', 'Tomato');
  await assertColors(1, '526579', 'dc533c'); await assertColors(0, 'f2b743', '3b9c98', false); await capture('mouse');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  await waitForRigs(2);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('status').filter({ hasText: 'Setting the tables' }).waitFor({ state: 'hidden' });
  await page.evaluate(async () => { (await import('/scripts/inspect.ts')).settleScene(); });
  await waitForRigs(2); await assertColors(0, 'f2b743', '3b9c98', false); await assertColors(1, '526579', 'dc533c', false);
  await page.getByRole('radio', { name: 'Couch co-op' }).click(); await page.getByRole('button', { name: 'Let’s cook' }).click();
  await open(); await dialog.getByRole('radio', { name: 'Chef 2 Mouse' }).click(); await dialog.getByRole('button', { name: 'Reset Chef 2 colors' }).click();
  await assertColors(1, 'fff2d7', 'fff2d7'); await assertColors(0, 'f2b743', '3b9c98', false);
  await color('Hat', 'Dusk'); await color('Apron', 'Tomato');
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(150);
  const layoutCheck = async () => {
    const bad = await dialog.evaluate(el => {
      const box = el.getBoundingClientRect();
      return el.scrollWidth > el.clientWidth || box.left < 0 || box.right > innerWidth || [...el.querySelectorAll('[role="radio"]')].some(r => { const b = r.getBoundingClientRect(); return b.width < 43.9 || b.height < 43.9 || b.right > box.right; });
    });
    if (bad) throw new Error('Wardrobe overflow or undersized touch targets');
  };
  await layoutCheck(); await assertColors(1, '526579', 'dc533c'); await capture('mobile');
  await page.setViewportSize({ width: 320, height: 740 }); await page.waitForTimeout(150); await layoutCheck();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Start shift', exact: true }).click(); await page.getByRole('region', { name: 'Chef dash readiness' }).waitFor();
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.state.chefs.forEach((c, i) => Object.assign(c, { x: i ? 1.5 : -1.5, z: 4.3, facing: 0 })); engine.notify(); });
  await assertColors(0, 'f2b743', '3b9c98', false); await assertColors(1, '526579', 'dc533c', false);
  await page.evaluate(async () => { const { renderSceneFrame, frameChefsDetail } = await import('/scripts/inspect.ts'); for (let i = 0; i < 30; i++) renderSceneFrame(false, .02); frameChefsDetail(); renderSceneFrame(); });
  await capture('gameplay');
  await page.getByRole('button', { name: 'Pause game' }).click();
  await assertColors(0, 'f2b743', '3b9c98', false); await assertColors(1, '526579', 'dc533c', false);
  await page.getByRole('button', { name: 'Keep cooking', exact: true }).click();
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.start(); engine.state.score = 600; engine.finish(); });
  await page.getByRole('heading', { name: 'Shift complete' }).waitFor();
  await assertColors(0, 'f2b743', '3b9c98', false); await assertColors(1, '526579', 'dc533c', false);
  await page.getByRole('button', { name: 'Back to rooftop' }).click(); await page.getByRole('radio', { name: 'Solo', exact: true }).click();
  await page.getByRole('button', { name: /Practice/ }).click(); await page.waitForTimeout(100);
  await assertColors(0, 'f2b743', '3b9c98', false);
  if ((await inspect()).some(c => c.id === 1)) throw new Error('Solo retained a second chef');
  console.log('WARDROBE: both menus, live real-material preview, independent hat/apron and players, no geometry rebuild, persisted reload, per-player reset, mobile 390/320, reduced motion, pause/restart/results/solo passed');
}
