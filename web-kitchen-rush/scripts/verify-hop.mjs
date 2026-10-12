import { writeFile } from 'node:fs/promises';

/** Real keyboard/touch input through the live simulation and procedural rigs. */
export async function verifyHop(page) {
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await page.getByRole('region', { name: 'Chef dash readiness' }).waitFor();
  const prepare = async () => {
    await page.evaluate(async () => {
      const { settleScene } = await import('/scripts/inspect.ts'); settleScene();
      const { engine } = await import('/src/game/engine.ts');
      const { activeInput } = await import('/src/scene/KitchenScene.tsx'); activeInput.clear(); engine.start(true);
      engine.state.chefs.forEach((c, id) => Object.assign(c, { x: id ? 1.8 : -1.8, z: -1.5, facing: id ? -Math.PI / 2 : Math.PI / 2, held: id ? { kind: 'tomato', state: 'chopped' } : { kind: 'plate', parts: ['tomato:chopped', 'lettuce:chopped'] } }));
      engine.notify();
    });
    await page.waitForTimeout(80); return sample();
  };
  const sample = async (seconds = 0) => {
    await page.evaluate(async seconds => {
      const { engine } = await import('/src/game/engine.ts');
      const { activeInput } = await import('/src/scene/KitchenScene.tsx');
      const { renderSceneFrame } = await import('/scripts/inspect.ts');
      for (let t = 0; t < seconds - 1e-9; t += .01) { engine.update(Math.min(.01, seconds - t), activeInput.read()); renderSceneFrame(false); }
      engine.notify();
    }, seconds);
    await page.waitForTimeout(80);
    return page.evaluate(async () => {
      const { engine } = await import('/src/game/engine.ts');
      const { renderSceneFrame, inspectActionEffects, inspectChefRigs, inspectChefLocomotion } = await import('/scripts/inspect.ts'); renderSceneFrame(false);
      return { elapsed: engine.state.elapsed, cues: [...engine.chefHops], physics: engine.state.chefs, poses: inspectActionEffects().chefs, rigs: inspectChefRigs(), motion: inspectChefLocomotion() };
    });
  };
  const capture = async name => {
    await page.evaluate(async () => { const { renderSceneFrame } = await import('/scripts/inspect.ts'); renderSceneFrame(); });
    const session = await page.context().newCDPSession(page);
    const image = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`scripts/kitchen-hop-${name}.png`, Buffer.from(image.data, 'base64')); await session.detach();
  };
  const lift = (frame, id = 0) => frame.poses[id].lift;
  const near = (actual, expected, message) => { if (Math.abs(actual - expected) > 1e-7) throw new Error(`${message}: ${actual} vs ${expected}`); };

  const initial = await prepare(); await page.keyboard.press('e'); await sample(.01); const apex = await sample(.19);
  near(lift(apex), .22, 'P1 hop apex'); near(lift(apex, 1), 0, 'P2 reacted to P1');
  apex.rigs.forEach((rig, i) => {
    const food = rig.joints.find(j => j.name === 'food-socket');
    if (!food.children) throw new Error('Hop detached carried food');
    near(rig.position[1], .1, 'Hop moved grounded root/ring');
    near(food.world[1] - initial.rigs[i].joints.find(j => j.name === 'food-socket').world[1], lift(apex, i) + apex.motion[i].body.position[1] - initial.motion[i].body.position[1], 'Food did not follow body lift');
  });
  await page.keyboard.press('e'); const tapped = await sample(.01);
  if (JSON.stringify(tapped.cues) !== JSON.stringify(apex.cues)) throw new Error('Rapid tap restarted the airborne hop');
  await page.keyboard.press('k'); const both = await sample(.05);
  if (!(lift(both, 1) > 0 && both.cues.length === 2)) throw new Error('P2 independent hop missing');
  await page.keyboard.press('Escape'); const paused = await sample(1);
  near(paused.elapsed, both.elapsed, 'Pause advanced hop time');
  if (JSON.stringify(paused.poses) !== JSON.stringify(both.poses)) throw new Error('Pause moved hop transforms');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(80);
  const reduced = await sample(); if (reduced.poses.some(c => c.lift !== 0 || c.scale.some(s => s !== 1))) throw new Error('Reduced motion kept the hop');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(80);
  if (JSON.stringify((await sample()).poses) !== JSON.stringify(paused.poses)) throw new Error('Reduced motion mutated hop history');
  await page.getByRole('button', { name: 'Keep cooking', exact: true }).click();
  const landed = await sample(.5); if (landed.cues.length || landed.poses.some(c => c.lift !== 0)) throw new Error('Hop never landed');

  await prepare(); await page.keyboard.down('d'); await page.keyboard.down('ArrowLeft'); await page.keyboard.press('e'); await page.keyboard.press('k');
  const running = await sample(.2);
  near(running.physics[0].x, -1.8 + 3.8 * .2, 'Hop slowed walking');
  if (!(lift(running) > .2 && running.motion[0].stride > .9)) throw new Error('Hop interrupted running gait');
  await page.keyboard.up('d'); await page.keyboard.up('ArrowLeft');
  await capture('gameplay');
  await prepare(); await page.keyboard.press('Space'); await page.keyboard.press('e'); const dash = await sample(.2);
  near(dash.physics[0].x, -1.8 + 10 * .2, 'Hop changed dash distance');
  if (!(lift(dash) > .2 && dash.physics[0].dash > 0)) throw new Error('Hop cannot overlap dash');

  await prepare();
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts'); const boards = engine.state.stations.filter(s => s.kind === 'board');
    engine.state.chefs.forEach((c, id) => Object.assign(c, { x: boards[id].x, z: boards[id].z - 1.25, facing: 0, held: { kind: id ? 'lettuce' : 'tomato', state: 'raw' } })); engine.notify();
  });
  await page.keyboard.press('e'); await page.keyboard.press('k');
  const placed = await sample(.01); if (placed.physics.some(c => c.held)) throw new Error('Hop delayed placement');
  await page.keyboard.down('f'); await page.keyboard.down('l'); const working = await sample(.19);
  if (working.rigs.some(c => c.action !== 'chop' || c.gripDistance === null || c.gripDistance > .0001)) throw new Error('Hop broke knife IK');
  near(lift(working), .22, 'Chop removed active interaction hop');
  await sample(.3); await page.keyboard.up('f'); await page.keyboard.up('l');

  await prepare();
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts'); const sink = engine.state.stations.find(s => s.kind === 'sink');
    sink.item = { kind: 'dirty' }; sink.progress = .999;
    Object.assign(engine.state.chefs[0], { x: sink.x, z: sink.z + 1.25, facing: Math.PI, held: null }); engine.notify();
  });
  await page.keyboard.down('f'); await sample(.01); await page.keyboard.up('f');
  await page.keyboard.press('e'); const clean = await sample(.01);
  if (clean.physics[0].held?.kind !== 'plate') throw new Error('Hop delayed clean plate pickup');
  const washHop = await sample(.19); near(lift(washHop), .22, 'Wash and interaction hops stacked');

  await prepare();
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts'); const { frameChefsDetail } = await import('/scripts/inspect.ts');
    engine.state.chefs.forEach((c, id) => Object.assign(c, { x: id ? 1.1 : -1.1, z: 4.3, facing: 0 })); frameChefsDetail();
  });
  await capture('ground'); await page.keyboard.press('e'); await page.keyboard.press('k'); await sample(.01); await sample(.095); await capture('rising'); await sample(.095); await capture('apex'); await sample(.19); await capture('landed');
  const reset = await prepare(); if (reset.cues.length || reset.poses.some(c => c.lift !== 0)) throw new Error('Restart retained a hop');

  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.select(0, 'solo'); engine.start(true); });
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  await page.waitForTimeout(100);
  const button = page.getByRole('button', { name: 'Pick / place', exact: true }); await button.waitFor({ state: 'visible' });
  const box = await button.boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touch = await sample(.2); if (touch.rigs.length !== 1 || touch.cues.length !== 1 || lift(touch) < .2) throw new Error('Actual touch button did not hop the solo chef');
  await capture('mobile'); await cdp.detach();
  console.log('HOP: E/K, independent co-op, held food/rings, rapid taps, pause/reduced motion, walk/dash, immediate placement, knife IK, wash overlap, restart and real mobile touch passed');
}
