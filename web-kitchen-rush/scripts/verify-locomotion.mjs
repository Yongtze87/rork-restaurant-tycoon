import { writeFile } from 'node:fs/promises';

/** Interleave real input/simulation/render frames; detect pops rather than only checking end poses. */
export async function verifyLocomotion(page) {
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await page.getByRole('region', { name: 'Chef dash readiness' }).waitFor();
  const prepare = async (z = -1.5) => {
    await page.evaluate(async z => {
      const { settleScene, renderSceneFrame } = await import('/scripts/inspect.ts'); settleScene();
      const { engine } = await import('/src/game/engine.ts');
      const { activeInput } = await import('/src/scene/KitchenScene.tsx'); activeInput.clear(); engine.start(true);
      engine.state.chefs.forEach((c, i) => Object.assign(c, { x: i ? 1.8 : -1.8, z, facing: i ? -Math.PI / 2 : Math.PI / 2, held: i ? { kind: 'tomato', state: 'chopped' } : { kind: 'plate', parts: ['lettuce:chopped', 'tomato:chopped'] } }));
      engine.notify(); renderSceneFrame(false);
    }, z);
    await page.waitForTimeout(80);
    return (await sample())[0];
  };
  const sample = async (seconds = 0, fps = 60) => page.evaluate(async ({ seconds, fps }) => {
    const { engine } = await import('/src/game/engine.ts');
    const { activeInput } = await import('/src/scene/KitchenScene.tsx');
    const { renderSceneFrame, inspectChefLocomotion, inspectChefRigs } = await import('/scripts/inspect.ts');
    const frames = [];
    const read = () => ({ motion: inspectChefLocomotion(), rigs: inspectChefRigs(), physics: engine.state.chefs.map(c => ({ x: c.x, z: c.z, facing: c.facing, moving: c.moving, dash: c.dash })) });
    if (!seconds) { renderSceneFrame(false); frames.push(read()); }
    for (let t = 0; t < seconds - 1e-9; t += 1 / fps) {
      const dt = Math.min(1 / fps, seconds - t); engine.update(dt, activeInput.read()); renderSceneFrame(false, dt); frames.push(read());
    }
    engine.notify(); return frames;
  }, { seconds, fps });
  const capture = async name => {
    await page.evaluate(async () => { const { renderSceneFrame } = await import('/scripts/inspect.ts'); renderSceneFrame(); });
    const session = await page.context().newCDPSession(page);
    const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`scripts/kitchen-motion-${name}.png`, Buffer.from(shot.data, 'base64')); await session.detach();
  };
  const leg = chef => chef.joints.find(j => j.name === 'leg--1').rotation[0];
  const checkFrames = (before, frames) => {
    let previous = before;
    for (const frame of frames) {
      for (const [i, motion] of frame.motion.entries()) {
        if (Math.abs(motion.yaw - previous.motion[i].yaw) > .5) throw new Error('Single-frame yaw snap');
        if (Math.abs(leg(frame.rigs[i]) - leg(previous.rigs[i])) > .3) throw new Error('Single-frame leg pop');
        if (motion.gaitPhase < previous.motion[i].gaitPhase) throw new Error('Step phase reset during movement');
        if (Math.abs(motion.position[0] - frame.physics[i].x) > 1e-7 || Math.abs(motion.position[2] - frame.physics[i].z) > 1e-7) throw new Error('Visual smoothing changed physics location');
        if (Math.abs(leg(frame.rigs[i]) - motion.gait * .52) > 1e-8) throw new Error('Legs and body lost their shared gait');
        if (!frame.rigs[i].joints.find(j => j.name === 'food-socket').children) throw new Error('Turn lost carried food');
      }
      previous = frame;
    }
    return previous;
  };

  let initial = await prepare();
  await page.keyboard.down('d'); await page.keyboard.down('ArrowLeft');
  let walk = checkFrames(initial, await sample(.25));
  await page.keyboard.up('d'); await page.keyboard.down('a');
  const turnFrames = await sample(.3), turned = checkFrames(walk, turnFrames);
  if (Math.abs(turnFrames[0].physics[0].x - walk.physics[0].x + 3.8 / 60) > 1e-6) throw new Error('Reversal made input sluggish');
  if (Math.abs(turnFrames[0].motion[0].yaw - turnFrames[0].physics[0].facing) < .1) throw new Error('Visual reversal snapped to input');
  if (Math.abs(Math.sin(turned.motion[0].yaw - turned.physics[0].facing)) > .04) throw new Error('Visual turn takes too long');
  if (Math.abs(turned.motion[1].yaw + Math.PI / 2) > 1e-6) throw new Error('P1 turn leaked into P2');
  await page.keyboard.up('a'); await page.keyboard.up('ArrowLeft');
  checkFrames(turned, await sample(.5));

  initial = await prepare(); await page.keyboard.down('d'); await page.keyboard.down('ArrowLeft');
  walk = checkFrames(initial, await sample(.2));
  await page.keyboard.up('d'); await page.keyboard.down('w'); await page.keyboard.up('ArrowLeft'); await page.keyboard.down('ArrowDown');
  checkFrames(walk, await sample(.1));
  await page.keyboard.up('w'); await page.keyboard.down('a'); await page.keyboard.up('ArrowDown'); await page.keyboard.down('ArrowRight');
  const midTurn = (await sample(.05)).at(-1);
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.pause(true); });
  const frozen = (await sample(1)).at(-1);
  if (JSON.stringify(frozen) !== JSON.stringify(midTurn)) throw new Error('Paused locomotion or carried joints drifted');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(80);
  const reduced = (await sample())[0];
  if (reduced.motion.some(c => c.body.position[1] !== 0 || c.body.rotation.some(n => n !== 0)) || reduced.rigs.some(c => leg(c) !== 0)) throw new Error('Reduced motion retained turn banking/bounce');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(80);
  if (JSON.stringify((await sample())[0]) !== JSON.stringify(frozen)) throw new Error('Reduced motion altered paused history');
  await page.getByRole('button', { name: 'Keep cooking', exact: true }).click();
  await page.keyboard.up('a'); await page.keyboard.up('ArrowRight');

  initial = await prepare(); await page.keyboard.down('d'); await page.keyboard.down('ArrowRight');
  walk = checkFrames(initial, await sample(.2));
  await page.keyboard.press('Space'); await page.keyboard.press('j');
  const dash = checkFrames(walk, await sample(.3));
  if (Math.abs(dash.physics[0].x - walk.physics[0].x - (10 * .24 + 3.8 * .06)) > 1e-6) throw new Error('Dash distance changed');
  if (dash.motion.some(c => c.dashBlend <= 0 || c.dashBlend >= 1)) throw new Error('Dash exit no longer blends');
  await page.keyboard.up('d'); await page.keyboard.up('ArrowRight');
  const stopped = checkFrames(dash, await sample(.5));
  if (stopped.motion.some(c => c.stride > .0001)) throw new Error('Feet did not settle after stop');

  await prepare(); await page.keyboard.down('w'); await page.keyboard.down('ArrowUp');
  const blocked = (await sample(.9)).at(-1);
  if (blocked.motion.some(c => c.stride > .001) || blocked.physics.some(c => !c.moving)) throw new Error('Blocked input kept running in place');
  await page.keyboard.up('w'); await page.keyboard.up('ArrowUp');
  await prepare(4.3); await page.keyboard.down('d'); await page.keyboard.down('ArrowLeft'); await sample(.2);
  await page.evaluate(async () => { const { frameChefsDetail } = await import('/scripts/inspect.ts'); frameChefsDetail(); });
  await capture('turn-0');
  await page.keyboard.up('d'); await page.keyboard.down('a'); await page.keyboard.up('ArrowLeft'); await page.keyboard.down('ArrowRight');
  await sample(.05); await capture('turn-1'); await sample(.05); await capture('turn-2'); await sample(.1); await capture('turn-3');
  await page.keyboard.up('a'); await page.keyboard.up('ArrowRight');
  await page.evaluate(async () => { const { frameChefsDetail } = await import('/scripts/inspect.ts'); frameChefsDetail(false); });
  await capture('gameplay');

  const reset = await prepare();
  if (reset.motion.some(c => c.gaitPhase !== 0 || c.angularVelocity !== 0 || c.stride !== 0 || c.lean !== 0)) throw new Error('Restart retained turn momentum');
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.select(0, 'solo'); engine.start(true); });
  await page.waitForTimeout(80); const solo = (await sample())[0];
  if (solo.motion.length !== 1 || solo.motion[0].gaitPhase !== 0) throw new Error('Solo inherited co-op gait');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); const { activeInput } = await import('/src/scene/KitchenScene.tsx'); Object.assign(engine.state.chefs[0], { x: 0, z: -1.5 }); activeInput.touch.x = 1; });
  await sample(.2);
  await page.evaluate(async () => { const { activeInput } = await import('/src/scene/KitchenScene.tsx'); activeInput.touch.x = -1; });
  const touch = await sample(.2);
  if (!(touch.at(-1).physics[0].x < touch[0].physics[0].x)) throw new Error('Touch reversal failed');
  await capture('mobile');
  console.log('LOCOMOTION: real co-op input, 90/180-degree turns, frame-by-frame yaw/gait continuity, immediate physics, carrying, pause/reduced motion, walk/dash/stop, blocked input, restart/solo/touch passed');
}
