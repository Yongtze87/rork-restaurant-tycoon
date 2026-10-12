import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const mobile = process.argv.includes('mobile'), expanded = process.argv.includes('expanded');
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
let browser;
const assert = (value, message) => { if (!value) throw new Error(message); };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, hasTouch: mobile, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    window.audioMeters = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createStereoPanner() {
        const pan = super.createStereoPanner(), meter = this.createAnalyser(), silent = this.createGain();
        meter.fftSize = 1024; silent.gain.value = 0; pan.connect(meter); meter.connect(silent); silent.connect(this.destination);
        window.audioMeters.push(meter); return pan;
      }
    };
  });
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Open restaurant/ }).waitFor();
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectCity()?.cars.length === 6);
  await page.waitForTimeout(1200);
  await page.waitForFunction(async () => (await import('/scripts/inspect.ts')).inspectCity()?.cars.length === 6);
  const read = () => page.evaluate(async () => (await import('/scripts/inspect.ts')).inspectTrafficAudio());
  const step = seconds => page.evaluate(async seconds => { const i = await import('/scripts/inspect.ts'); i.settleScene(); for (let n = 0; n < Math.round(seconds * 10); n++) i.renderSceneFrame(false, .1); }, seconds);
  const data = () => page.evaluate(async () => JSON.stringify((await import('/src/management/engine.ts')).restaurant.state));
  const rms = () => page.evaluate(() => Math.max(0, ...window.audioMeters.map(meter => { const values = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(values); return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length); })));
  assert(!(await read()).unlocked, 'Audio auto-started without a gesture');
  await page.evaluate(async expanded => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); restaurant.welcome(); if (expanded) { restaurant.state.expanded = true; restaurant.notify(); } }, expanded);
  await page.getByRole('button', { name: 'Neighborhood view' }).click();
  for (let attempt = 0; attempt < 100; attempt++) {
    const status = await read();
    if (status?.ready && status.engines === 6) break;
    await page.waitForTimeout(100);
  }
  await step(.1); const before = await data(), first = await read();
  assert(first.active && first.engines === 6 && first.context === 'running', `Real WebAudio engine sources did not start: ${JSON.stringify({ first, scene: await page.evaluate(async () => (await import('/scripts/inspect.ts')).inspectCity()), paused: await page.evaluate(async () => (await import('/src/management/engine.ts')).restaurant.paused), errors })}`);
  await page.waitForTimeout(350); const energy = await rms(); assert(energy > .00005 && energy < .2, `Invalid decoded audio output ${energy}`);
  await step(40); const passing = await read();
  assert(passing.horns >= 1, 'No horn from nearby car passes');
  assert(passing.voices.some((v, i) => Math.abs(v.pan - first.voices[i].pan) > .1), 'Audio did not follow car positions');
  assert(passing.voices.reduce((sum, v) => sum + v.gain, 0) <= .220001, 'Traffic mix exceeded volume budget');
  assert(await data() === before, 'Traffic audio changed restaurant data');
  await page.getByRole('button', { name: 'Rotate view' }).click(); await step(.1);
  const rotated = await read(); assert(rotated.voices.some((v, i) => Math.abs(v.pan - passing.voices[i].pan) > .1), 'Pan ignored camera rotation');
  await page.getByRole('button', { name: 'Restaurant settings' }).click();
  await page.getByRole('switch', { name: 'City traffic', exact: true }).click();
  assert(!(await read()).active, 'Mute did not stop sounds without RAF');
  await page.waitForTimeout(150); assert(await rms() < .00001, 'Mute left audible sources');
  await page.getByRole('switch', { name: 'City traffic', exact: true }).click(); await page.keyboard.press('Escape'); await step(.1);
  assert((await read()).active, 'Traffic did not resume after enabling');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches); await step(.1);
  assert(!(await read()).active, 'Static reduced-motion cars kept their engines');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches); await step(.1);
  await page.evaluate(async () => (await import('/src/management/engine.ts')).restaurant.pause(true));
  assert(!(await read()).active, 'Pause waited for RAF to silence audio');
  await page.evaluate(async () => (await import('/src/management/engine.ts')).restaurant.pause(false)); await step(.1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert(!(await read()).active, 'Hidden tab kept traffic audio');
  await page.evaluate(async () => { delete document.hidden; const { restaurant } = await import('/src/management/engine.ts'); restaurant.pause(false); }); await step(.1);
  await page.getByRole('button', { name: 'Build', exact: true }).click(); await page.waitForTimeout(50); await step(.1);
  const build = await read(); assert(build.engines === 6 && build.voices.reduce((sum, v) => sum + v.gain, 0) < .15, 'Build audio not subdued');
  const buildHorns = build.horns; await step(40); assert((await read()).horns === buildHorns, 'Horn sounded in Build');
  await page.getByRole('button', { name: /Open restaurant/ }).click();
  await page.getByRole('button', { name: '3x speed' }).click();
  await step(1); assert((await read()).voices.every(v => v.rate < 1.1), 'Service speed made engine audio shrill');
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.state.phase = 'report'; restaurant.notify(); });
  assert(!(await read()).active, 'Report kept playing traffic');
  await page.evaluate(async () => { const { restaurant } = await import('/src/management/engine.ts'); restaurant.reset(); restaurant.welcome(); });
  assert(!(await read()).active, 'Reset retained sources'); await step(.1); assert((await read()).engines === 6, 'Reset duplicated or lost engines');
  assert(errors.length === 0, errors.join('\n'));
  console.log('TRAFFIC AUDIO PASSED', JSON.stringify({ mobile, expanded, engines: first.engines, horns: passing.horns, decodedOutputRMS: energy, errors }));
} finally { server.kill('SIGTERM'); await browser?.close(); }
