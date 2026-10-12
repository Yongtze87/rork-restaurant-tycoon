import { writeFile } from 'node:fs/promises';

export async function verifyChopMotion(page) {
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await page.getByRole('region', { name: 'Chef dash readiness' }).waitFor();
  await page.evaluate(async () => {
    const { settleScene } = await import('/scripts/inspect.ts'); settleScene();
    const { engine } = await import('/src/game/engine.ts');
    const { activeInput } = await import('/src/scene/KitchenScene.tsx'); activeInput.clear(); engine.start(true);
    const boards = engine.state.stations.filter(s => s.kind === 'board');
    boards.forEach((s, id) => { s.item = { kind: id ? 'lettuce' : 'tomato', state: 'raw' }; Object.assign(engine.state.chefs[id], { x: s.x, z: s.z + 1.25, facing: Math.PI, held: null }); });
    engine.update(0, []); engine.notify();
  });
  const tick = async (seconds = 0) => page.evaluate(async seconds => {
    const { engine } = await import('/src/game/engine.ts');
    const { activeInput } = await import('/src/scene/KitchenScene.tsx');
    const { renderSceneFrame, inspectChefRigs, inspectChopping } = await import('/scripts/inspect.ts');
    for (let t = 0; t < seconds - 1e-9; t += 1 / 120) { engine.update(Math.min(1 / 120, seconds - t), activeInput.read()); renderSceneFrame(false); }
    renderSceneFrame(false); engine.notify();
    return { rigs: inspectChefRigs(), boards: inspectChopping().boards };
  }, seconds);
  const capture = async name => {
    await page.evaluate(async () => {
      const { engine } = await import('/src/game/engine.ts');
      const { renderSceneFrame, frameKnifeGrip } = await import('/scripts/inspect.ts'); renderSceneFrame();
      const st = engine.state.stations.find(s => s.kind === 'board'); frameKnifeGrip(st.x, st.z);
    });
    const session = await page.context().newCDPSession(page);
    const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`scripts/kitchen-chop-motion-${name}.png`, Buffer.from(shot.data, 'base64')); await session.detach();
  };
  await tick(); await page.keyboard.down('f'); await page.keyboard.down('l');
  const lift = await tick(.2); await capture('lift');
  const contact = await tick(.105); await capture('contact');
  for (const sample of [lift, contact]) if (sample.rigs.some(r => r.gripDistance === null || r.gripDistance > .0001)) throw new Error('Palm detached from the knife handle');
  if (contact.boards.some(b => b.knife.handSide !== 1)) throw new Error('South-side chef used the far hand across their face');
  await page.keyboard.up('f'); await page.keyboard.up('l');
  const releasing = await tick(.02); await capture('release');
  if (releasing.rigs.some(r => r.joints.find(j => j.name === 'hand-1').position[1] < 1)) throw new Error('Release snapped the arm down');
  const resting = await tick(.2);
  if (resting.rigs.some(r => r.gripDistance !== null || r.joints.find(j => j.name === 'hand-1').position[1] > .7)) throw new Error('Release never settled');
  // Sample the actual ordered scene callbacks, including all six cuts and completion.
  for (const [dx, dz, shared] of [[0, -1.25, false], [0, 1.25, false], [-1.25, 0, false], [1.25, 0, false], [0, -1.25, true]]) {
    await page.evaluate(async ([dx, dz, shared]) => {
      const { engine } = await import('/src/game/engine.ts'); engine.start(true);
      // Isolate board approaches: adjacent counters otherwise win real targeting from the sides.
      engine.state.stations = engine.state.stations.filter(s => s.kind === 'board');
      if (shared) engine.state.stations = engine.state.stations.slice(0, 1);
      engine.state.stations.forEach((s, id) => { s.item = { kind: id ? 'lettuce' : 'tomato', state: 'raw' }; });
      engine.state.chefs.forEach((c, id) => {
        const s = engine.state.stations[shared ? 0 : id], z = shared && id === 1 ? -dz : dz;
        Object.assign(c, { x: s.x + dx, z: s.z + z, facing: Math.atan2(-dx, -z), held: null });
      }); engine.update(0, []); engine.notify();
    }, [dx, dz, shared]);
    await tick(); await page.keyboard.down('f'); await page.keyboard.down('l');
    const stats = await page.evaluate(async () => {
      const { engine } = await import('/src/game/engine.ts');
      const { activeInput } = await import('/src/scene/KitchenScene.tsx');
      const { renderSceneFrame, inspectChefRigs } = await import('/scripts/inspect.ts');
      let maxGrip = 0, maxJump = 0, jumpFrame = -1, jumpHand = -1; let previous = null;
      for (let frame = 0; frame < 260; frame++) {
        engine.update(1 / 120, activeInput.read()); renderSceneFrame(false);
        const rigs = inspectChefRigs();
        if (frame > 20) for (const rig of rigs) maxGrip = Math.max(maxGrip, rig.gripDistance ?? 0);
        const hands = rigs.flatMap(r => r.joints.filter(j => j.name.startsWith('hand-')).map(j => j.world));
        if (previous) hands.forEach((p, i) => { const jump = Math.hypot(...p.map((v, axis) => v - previous[i][axis])); if (jump > maxJump) { maxJump = jump; jumpFrame = frame; jumpHand = i; } });
        previous = hands;
      }
      engine.notify(); return { maxGrip, maxJump, jumpFrame, jumpHand, ready: engine.state.stations.filter(s => s.kind === 'board').every(s => s.item?.state === 'chopped'), idle: inspectChefRigs().every(r => r.action === 'idle' && r.gripDistance === null) };
    });
    if (stats.maxGrip > .0001 || stats.maxJump > .2 || !stats.ready || !stats.idle) throw new Error(`Chopping discontinuity at ${dx},${dz}, shared=${shared}: ${JSON.stringify(stats)}`);
    await page.keyboard.up('f'); await page.keyboard.up('l');
  }
  console.log('CHOP MOTION: calibrated palms, near-side hand, smooth release, frame-by-frame grip through six contacts/completion, all four approach directions and independent chefs passed');
}
