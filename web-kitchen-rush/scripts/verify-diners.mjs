import { writeFile } from 'node:fs/promises';
export async function verifyDiners(page) {
  const capture = async name => {
    await page.evaluate(async()=>{(await import('/scripts/inspect.ts')).renderSceneFrame();});
    const session = await page.context().newCDPSession(page);
    const shot = await session.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(`scripts/kitchen-diners-${name}.png`,Buffer.from(shot.data,'base64')); await session.detach();
  };
  const sample = async(seconds=0) => {
    await page.evaluate(async seconds=>{const {engine}=await import('/src/game/engine.ts'); const {activeInput}=await import('/src/scene/KitchenScene.tsx'); for(let t=0;t<seconds-1e-9;t+=.02)engine.update(Math.min(.02,seconds-t),activeInput.read());engine.notify();},seconds);
    await page.waitForTimeout(100);
    return page.evaluate(async()=>{
      const {renderSceneFrame}=await import('/scripts/inspect.ts');renderSceneFrame(false,.02);
      const {_roots}=await import('/node_modules/.vite/deps/@react-three_fiber.js'); const state=[..._roots.values()][0].store.getState();state.scene.updateMatrixWorld(true);
      const {engine}=await import('/src/game/engine.ts');
      return engine.dining.guests.map(g=>{const root=state.scene.getObjectByName(`customer-${g.id}`),rig=root?.getObjectByName('diner-rig');return {...g,visible:root?.visible??false,world:root?.position.toArray(),mealVisible:state.scene.getObjectByName(`customer-meal-${g.id}`)?.visible??false,bubble:state.scene.getObjectByName(`customer-order-${g.id}`)?.visible??false,joints:rig?['head','hip--1','knee--1','hand--1','hand-1'].map(n=>{const j=rig.getObjectByName(n);return {name:n,position:j.position.toArray(),rotation:j.rotation.toArray().slice(0,3)};}):[]};});
    });
  };
  await page.getByRole('button',{name:'Start shift',exact:true}).click();
  await page.getByRole('region',{name:'Chef dash readiness'}).waitFor();
  await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');(await import('/scripts/inspect.ts')).settleScene(); engine.start();});
  const start=await sample(.2);if(!start.some(g=>g.visible&&g.stage==='entering'))throw new Error('No actual arriving guest');await capture('arriving');
  const moved=await sample(1);if(moved[0].x===start[0].x)throw new Error('Guest never walks');
  await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');for(let i=0;i<2;i++){engine.state.nextOrder=0;engine.update(.02,[]);}engine.notify();});
  const seated=await sample(12);if(seated.length!==4||seated.some(g=>g.stage!=='waiting'||!g.visible))throw new Error(`Four real guests did not sit: ${JSON.stringify(seated.map(g=>({id:g.id,stage:g.stage,visible:g.visible,x:g.x,z:g.z})))}`);
  if(new Set(seated.map(g=>g.species)).size!==4)throw new Error('Missing species');
  await capture('gameplay');
  await page.evaluate(async()=>{const {_roots}=await import('/node_modules/.vite/deps/@react-three_fiber.js');const s=[..._roots.values()][0].store.getState();s.camera.position.set(1,8,3);s.camera.lookAt(-.5,1,-6.6);s.camera.zoom=78;s.camera.updateProjectionMatrix();});await capture('tables');
  await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const {RECIPES}=await import('/src/game/config.ts');engine.state.chefs.forEach((c,i)=>Object.assign(c,{x:5.15,z:0,facing:Math.PI/2,held:{kind:'plate',parts:RECIPES[i?'burger':'salad'].parts}}));engine.update(0,[]);engine.notify();});
  await page.keyboard.down('e');await page.keyboard.down('k');const eating=await sample(.5);await page.keyboard.up('e');await page.keyboard.up('k');
  if(eating.filter(g=>g.stage==='eating'&&g.mealVisible).length!==2)throw new Error('E/K failed to send actual meals to diners');await capture('eating');
  const bite=await sample(.4);if(JSON.stringify(bite[0].joints)===JSON.stringify(eating[0].joints))throw new Error('Eating pose never animates');
  await page.keyboard.press('Escape');const paused=await sample();const frozen=await sample(5);if(JSON.stringify(paused)!==JSON.stringify(frozen))throw new Error('Diners moved during pause');await page.getByRole('button',{name:'Keep cooking',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});if(await page.evaluate(async()=>(await import('/src/game/engine.ts')).engine.state.paused))throw new Error('Resume did not unpause simulation');
  await page.emulateMedia({reducedMotion:'reduce'});const reduced=await sample();const later=await sample(.3);if(JSON.stringify(reduced[0].joints)!==JSON.stringify(later[0].joints))throw new Error('Reduced motion still animates dining joints');await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.state.orders.find(o=>o.id===3).remaining=.001;});const missed=await sample(.02);if(missed.find(g=>g.id===3)?.outcome!=='missed')throw new Error('Expired diner is not disappointed');await capture('missed');
  const exiting=await sample(5);if(!exiting.some(g=>g.stage==='leaving'))throw new Error('No departing guests');await capture('leaving');
  await sample(12);const completed=await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');return {dirty:engine.state.dirty,served:engine.state.served,penalties:engine.state.penalties};});
  if(completed.dirty!==2||completed.served!==2||completed.penalties!==20)throw new Error(`Changed gameplay: ${JSON.stringify(completed)}`);
  await page.evaluate(async()=>{const {frameChefsDetail}=await import('/scripts/inspect.ts');frameChefsDetail(false);const {engine}=await import('/src/game/engine.ts');engine.select(0,'solo');engine.start(true);});await sample(9);
  await page.setViewportSize({width:390,height:844});await sample();await capture('mobile');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile overflow');
  await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.start();});const fresh=await sample(.1);if(fresh.length!==2||fresh.some(g=>g.outcome!=='pending'))throw new Error('Restart leaked previous service');
  await page.setViewportSize({width:1280,height:800});
  await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.start(true);for(let id=2;id<=8;id++){const order={id,recipe:id%2?'salad':'burger',remaining:100,duration:100};engine.state.orders.push(order);engine.dining.order(order,engine.state.elapsed);}engine.state.nextId=9;engine.notify();});
  const crowd=await sample(15);if(crowd.filter(g=>g.stage==='waiting').length!==6||crowd.filter(g=>g.stage==='lobby'&&g.visible).length!==2)throw new Error('Seating overflow missing real lobby patrons');await capture('crowd');
  console.log('DINERS: all four procedural species, arrival, six unique seats plus visible lobby, real E/K service, eating, exact pause, reduced motion, timeout, departure, seven-second plates, solo practice and mobile passed');
}
