import { writeFile } from 'node:fs/promises';

export async function verifyDinerEmotions(page) {
  const sample = async (seconds = 0) => {
    await page.evaluate(async seconds => {
      const { engine } = await import('/src/game/engine.ts');
      const { activeInput } = await import('/src/scene/KitchenScene.tsx');
      for (let t = 0; t < seconds - 1e-9; t += .02) engine.update(Math.min(.02, seconds - t), activeInput.read());
      engine.notify();
    }, seconds);
    await page.waitForTimeout(80);
    return page.evaluate(async () => {
      (await import('/scripts/inspect.ts')).renderSceneFrame();
      const { engine } = await import('/src/game/engine.ts');
      const { _roots } = await import('/node_modules/.vite/deps/@react-three_fiber.js');
      const state = [..._roots.values()][0].store.getState();
      return [...document.querySelectorAll('[data-diner-emotion]')].map(el => {
        const id = Number(el.dataset.dinerEmotion), guest = engine.dining.guests.find(g => g.id === id);
        const anchor = state.scene.getObjectByName(`customer-emotion-${id}`), bounds = el.getBoundingClientRect();
        return { id, kind: el.dataset.emotion, hidden: el.hidden, opacity: Number(el.style.opacity), transform: el.style.transform,
          label: el.getAttribute('aria-label'), rect: { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height },
          anchor: anchor?.position.toArray(), guest: guest ? { x: guest.x, z: guest.z, stage: guest.stage, outcome: guest.outcome } : null,
          dish: state.scene.getObjectByName(`customer-order-${id}`)?.visible,
          blocksInput: [el, el.parentElement, el.parentElement.parentElement].some(node => getComputedStyle(node).pointerEvents !== 'none'),
          faces: [...el.querySelectorAll('svg')].filter(svg => getComputedStyle(svg).display !== 'none').map(svg => svg.classList.contains('lucide-angry') ? 'angry' : 'happy') };
      });
    });
  };
  const visible = badges => badges.filter(b => !b.hidden);
  const capture = async name => {
    const session = await page.context().newCDPSession(page);
    const image = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(`scripts/kitchen-diner-emotions-${name}.png`, Buffer.from(image.data, 'base64')); await session.detach();
  };
  const assertBadges = (badges, width) => {
    for (const b of visible(badges)) {
      if (b.faces.length !== 1 || b.faces[0] !== b.kind) throw new Error(`Wrong face: ${JSON.stringify(b)}`);
      if (b.dish || b.blocksInput) throw new Error('Badge overlaps dish bubble or blocks input');
      if (b.anchor[0] !== b.guest.x || b.anchor[2] !== b.guest.z) throw new Error('Badge detached from guest');
      if (b.rect.width < 30 || b.rect.x < 0 || b.rect.right > width || b.rect.y < 0 || b.rect.bottom > 844) throw new Error(`Badge clips or is too small at ${width}px: ${JSON.stringify(b)}`);
    }
    const boxes = visible(badges).map(b => b.rect);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y) throw new Error(`Diner badges overlap at ${width}px`);
    }
  };
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await page.getByRole('region', { name: 'Active orders' }).waitFor();
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts');
    (await import('/scripts/inspect.ts')).settleScene(); engine.start();
    for (let i = 0; i < 2; i++) { engine.state.nextOrder = 0; engine.update(.02, []); }
  });
  if (visible(await sample(12)).length) throw new Error('Comfortable guests have false emotions');
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts');
    engine.state.orders.forEach(o => { o.remaining = o.duration * .2 + .05; });
  });
  const angry = visible(await sample(.1));
  if (angry.length !== 4 || angry.some(b => b.kind !== 'angry')) throw new Error('20% warning missing for one of the four species');
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts'); const { RECIPES } = await import('/src/game/config.ts');
    engine.state.chefs.forEach((c, i) => Object.assign(c, { x: 5.15, z: 0, facing: Math.PI / 2, held: { kind: 'plate', parts: [...RECIPES[i ? 'burger' : 'salad'].parts] } }));
    engine.update(0, []);
  });
  await page.keyboard.down('e'); await page.keyboard.down('k'); await sample(.4); await page.keyboard.up('e'); await page.keyboard.up('k');
  const mixed = visible(await sample());
  if (mixed.filter(b => b.kind === 'happy').map(b => b.id).join() !== '1,2' || mixed.filter(b => b.kind === 'angry').length !== 2) throw new Error('E/K changed the wrong guests');
  assertBadges(mixed, 1280); await capture('desktop');
  await page.getByRole('button', { name: 'Pause game' }).click();
  const paused = await sample(); if (JSON.stringify(paused) !== JSON.stringify(await sample(5))) throw new Error('Paused icons changed');
  await page.getByRole('button', { name: 'Keep cooking', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await sample(), later = await sample(.3);
  for (const b of still) {
    const next = later.find(n => n.id === b.id);
    if (b.transform !== next.transform || b.opacity !== next.opacity) throw new Error('Reduced motion animates icons');
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(async width => (await import('/scripts/inspect.ts')).inspectScene()?.size.width === width, width);
    // Refresh camera matrices after resize before sampling Html in the frozen render loop.
    await page.evaluate(async () => { (await import('/scripts/inspect.ts')).renderSceneFrame(); });
    const badges = await sample(); assertBadges(badges, width); await capture(`mobile-${width}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Emotion overlay introduced mobile overflow');
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const faded = await sample(2.1);
  if (faded.filter(b => b.kind === 'happy').some(b => b.opacity >= .6)) throw new Error('Happy cue does not fade');
  const ended = await sample(.3);
  if (visible(ended).some(b => b.kind === 'happy')) throw new Error('Thank-you did not expire');
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.state.orders.find(o => o.id === 3).remaining = .001; });
  const missed = (await sample(.02)).find(b => b.id === 3);
  if (missed.kind !== 'angry' || !missed.label.includes('left after')) throw new Error('Timeout icon/accessible label is wrong');
  const departing = (await sample(1)).find(b => b.id === 3);
  if (departing.guest.stage !== 'leaving' || departing.kind !== 'angry' || departing.anchor[2] === missed.anchor[2]) throw new Error('Anger does not follow departing guest');
  await sample(16);
  if (await page.locator('[data-diner-emotion="3"]').count()) throw new Error('Departed guest left an orphan badge');
  await page.evaluate(async () => { const { engine } = await import('/src/game/engine.ts'); engine.select(0, 'solo'); engine.start(true); });
  const practice = await sample(200); if (visible(practice).length) throw new Error('Untimed practice generated impatience');
  await page.evaluate(async () => {
    const { engine } = await import('/src/game/engine.ts'); const { RECIPES } = await import('/src/game/config.ts');
    Object.assign(engine.state.chefs[0], { x: 5.15, z: 0, facing: Math.PI / 2, held: { kind: 'plate', parts: [...RECIPES.salad.parts] } }); engine.update(0, []);
  });
  await page.getByText('Pick / place', { exact: true }).dispatchEvent('pointerdown', { pointerId: 1 });
  const practiced = await sample(.4); await page.getByText('Pick / place', { exact: true }).dispatchEvent('pointerup', { pointerId: 1 });
  if (!visible(practiced).some(b => b.kind === 'happy')) throw new Error('Solo touch service has no thank-you');
  await page.evaluate(async () => { (await import('/src/game/engine.ts')).engine.start(); });
  if (visible(await sample()).length) throw new Error('Restart leaked icons');
  await page.evaluate(async () => { (await import('/src/game/engine.ts')).engine.setPhase('menu'); }); await sample();
  if (await page.locator('[data-diner-emotion]').count()) throw new Error('Menu ambience shows gameplay emotion icons');
  console.log('DINER EMOTIONS: four species, exact 20% threshold, E/K matching service, distinct faces, head anchors, no bubble conflicts, pause, live reduced motion, 390/320px readability, fade, departure cleanup, solo practice touch and reset passed');
}
