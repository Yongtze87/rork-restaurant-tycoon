import { writeFile } from 'node:fs/promises';

/** Exercise real gameplay events, then inspect the rendered facial joints and morphs. */
export async function verifyEmotions(page) {
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await page.getByRole('region', { name: 'Chef dash readiness' }).waitFor();
  const prepare = async () => page.evaluate(async () => {
    const { settleScene } = await import('/scripts/inspect.ts'); settleScene();
    const { engine } = await import('/src/game/engine.ts');
    const { activeInput } = await import('/src/scene/KitchenScene.tsx'); activeInput.clear(); engine.start(true);
    engine.state.chefs.forEach((c, i) => Object.assign(c, { x: i ? 1.5 : -1.5, z: 4.3, facing: 0 })); engine.notify();
  });
  const sample = async (seconds = 0) => {
    await page.evaluate(async seconds => {
      const { engine } = await import('/src/game/engine.ts');
      const { activeInput } = await import('/src/scene/KitchenScene.tsx');
      for (let t = 0; t < seconds - 1e-9; t += .02) engine.update(Math.min(.02, seconds - t), activeInput.read());
      engine.notify();
    }, seconds);
    await page.waitForTimeout(80);
    return page.evaluate(async () => {
      const { renderSceneFrame, inspectChefFaces } = await import('/scripts/inspect.ts');
      for (let i = 0; i < 30; i++) renderSceneFrame(false, .02);
      return inspectChefFaces();
    });
  };
  const capture = async name => {
    await page.evaluate(async () => { const { renderSceneFrame } = await import('/scripts/inspect.ts'); renderSceneFrame(); });
    const session = await page.context().newCDPSession(page);
    const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`scripts/kitchen-emotions-${name}.png`, Buffer.from(shot.data, 'base64')); await session.detach();
  };
  const portrait = async () => {
    await page.evaluate(async () => {
      const { engine } = await import('/src/game/engine.ts');
      engine.state.chefs.forEach((c, i) => Object.assign(c, { x: i ? 1.5 : -1.5, z: 4.3, facing: 0 })); engine.update(0, []); engine.notify();
    });
    await sample(); await page.evaluate(async () => { const { frameChefsDetail } = await import('/scripts/inspect.ts'); frameChefsDetail(); });
  };
  const complete = async () => {
    await page.evaluate(async () => {
      const { engine } = await import('/src/game/engine.ts'); const counters = engine.state.stations.filter(st => st.kind === 'counter');
      engine.state.chefs.forEach((c, i) => {
        const st = counters[i]; st.item = { kind: 'tomato', state: 'chopped' }; c.held = { kind: 'plate', parts: ['lettuce:chopped'] };
        Object.assign(c, { x: st.x, z: st.z + 1.25, facing: Math.PI });
      }); engine.update(0, []); engine.notify();
    });
    await page.keyboard.press('e'); await page.keyboard.press('k');
    return sample(.1);
  };
  const burn = async (ids = [0, 1]) => page.evaluate(async ids => {
    const { engine } = await import('/src/game/engine.ts'); const grills = engine.state.stations.filter(st => st.kind === 'grill');
    for (const id of ids) {
      const c = engine.state.chefs[id], st = grills[id]; st.item = null; st.fire = 0;
      c.held = { kind: 'patty', state: 'raw' }; engine.interact(c, st); st.heat = 14.99; st.item.state = 'cooked';
    }
    engine.update(.02, []); engine.notify();
  }, ids);

  await prepare(); await portrait(); const neutral = await sample();
  if (neutral.some(c => c.emotion !== 'neutral' || c.weights.some(w => w !== 0))) throw new Error('Initial face is not neutral');
  await capture('neutral');
  const entering = await complete();
  if (entering.some(c => c.emotion !== 'happy' || c.weights[0] <= 0 || c.weights[0] >= 1)) throw new Error('Completed recipe did not blend into happiness');
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.pause(true); });
  if (JSON.stringify(await sample(5)) !== JSON.stringify(entering)) throw new Error('Paused facial blend drifted');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100);
  const reduced = await sample();
  if (reduced.some(c => c.weights[0] !== 1 || c.weights[1] !== 0)) throw new Error('Reduced motion hid the happy face');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(100);
  if (JSON.stringify(await sample()) !== JSON.stringify(entering)) throw new Error('Restoring motion lost the frozen expression');
  await page.getByRole('button', { name: 'Keep cooking', exact: true }).click();
  await sample(.3); await portrait(); const happy = await sample(); await capture('happy');
  if (happy.some(c => c.weights[0] !== 1 || c.joints.find(j => j.name === 'smile-eye--1').scale[0] !== 1)) throw new Error('Happy eyes or mouth did not animate');
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts'); const st = engine.state.stations.find(s => s.kind === 'serve');
    engine.state.orders.push({ ...engine.state.orders[0], id: engine.state.nextId++ });
    engine.state.chefs.forEach(c => Object.assign(c, { x: st.x - 1.25, z: st.z, facing: Math.PI / 2 })); engine.update(0, []); engine.notify();
  });
  await page.keyboard.press('e'); await page.keyboard.press('k'); await sample(.3); await portrait();
  const served = await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); return engine.state.served === 2 && engine.state.chefs.every(c => !c.held); });
  if (!served || (await sample()).some(c => c.emotion !== 'happy')) throw new Error('Successful service did not refresh happy faces');
  await capture('served');
  await burn([1]); await sample(.3); const mixed = await sample(); await capture('mixed');
  if (mixed[0].emotion !== 'happy' || mixed[1].emotion !== 'disappointed' || mixed[1].weights[1] !== 1) throw new Error('Co-op facial reactions leaked between chefs');
  await burn([0]); await sample(.3); await capture('disappointed');
  const sad = await sample();
  if (sad.some(c => c.weights[1] !== 1 || c.joints.find(j => j.name === 'brow--1').rotation[2] <= 0)) throw new Error('Disappointed brow or mouth pose missing');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100);
  const sadReduced = await sample(.1), sadLater = await sample(.1);
  if (JSON.stringify(sadReduced) !== JSON.stringify(sadLater)) throw new Error('Reduced-motion sad expression is not static');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(100);
  const expired = await sample(4);
  if (expired.some(c => c.emotion !== 'neutral' || c.weights.some(w => w !== 0))) throw new Error('Expression failed to settle');
  await complete(); await sample(.3); await portrait();
  await page.evaluate(async () => { const { frameChefsDetail } = await import('/scripts/inspect.ts'); frameChefsDetail(false); }); await capture('gameplay');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100); await capture('mobile');
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(100);
  await prepare();
  if ((await sample()).some(c => c.weights.some(w => w !== 0))) throw new Error('Restart retained facial morphs');
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.select(0, 'solo'); engine.start(true); });
  const solo = await sample(); if (solo.length !== 1 || solo[0].emotion !== 'neutral') throw new Error('Solo retained co-op expressions');
  console.log('EMOTIONS: actual E/K recipe completion and service, editable mouth/eyes/brows, smooth entry, independent burnt-food ownership, pause, reduced motion, expiry, restart, solo and mobile passed');
}
