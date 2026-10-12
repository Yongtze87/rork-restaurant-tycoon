import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const mode=process.argv[2]??'home';
const server=spawn('bunx',['vite','--host','127.0.0.1','--port','5173'],{stdio:'inherit'});
let browser;
try {
 for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:5173')).ok)break;}catch{}await new Promise(r=>setTimeout(r,300));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:mode==='mobile'?{width:390,height:844}:{width:1280,height:800}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE ERROR',m.text());}});
 await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle',timeout:25000});
 await page.getByRole('status').filter({hasText:'Setting the tables'}).waitFor({state:'hidden',timeout:25000});
 await page.waitForTimeout(500);
 if(mode==='wardrobe')await (await import('./verify-wardrobe.mjs')).verifyWardrobe(page);
 if(mode==='high-score')await (await import('./verify-high-score.mjs')).verifyHighScore(page);
 if(mode!=='home'&&mode!=='model'&&mode!=='mobile'&&mode!=='wardrobe'&&mode!=='high-score'){
  await page.getByRole('radio',{name:'Couch co-op'}).click();
  await page.getByRole('button',{name:'Let’s cook'}).click();
  await page.getByRole('button',{name:'Start shift',exact:true}).waitFor();
  if(mode==='share'){
   await page.getByRole('button',{name:'Start shift',exact:true}).click();
   await page.getByRole('region',{name:'Chef dash readiness'}).waitFor();
   await page.evaluate(async()=>{
    const {settleScene}=await import('/scripts/inspect.ts');settleScene();
    const {engine}=await import('/src/game/engine.ts');
    Object.assign(engine.state,{score:620,orderPoints:500,tips:140,penalties:20,served:10,missed:1});engine.finish();
   });
   await page.getByRole('heading',{name:'Shift complete'}).waitFor();
   await page.waitForURL('**/results');
   await page.evaluate(async()=>{const {settleScene}=await import('/scripts/inspect.ts');settleScene();});
   await page.getByRole('button',{name:'Share Score',exact:true}).focus();
   await page.keyboard.press('Enter');
   const save=page.getByRole('link',{name:'Save PNG'});await save.waitFor();
   const image=page.getByRole('dialog').getByRole('img');
   await image.evaluate(img=>img.decode());
   const dimensions=await image.evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
   if(dimensions.width!==1080||dimensions.height!==1350)throw new Error('Scorecard resolution is incorrect');
   const downloadPromise=page.waitForEvent('download');await save.click();const download=await downloadPromise;
   if(download.suggestedFilename()!=='kitchen-rush-golden-hour-coop-620.png')throw new Error('Scorecard filename lost shift results');
   await download.saveAs('scripts/kitchen-scorecard.png');
   await page.getByRole('button',{name:'Close',exact:true}).click();
   await page.getByRole('dialog').waitFor({state:'hidden'});
   await page.setViewportSize({width:390,height:844});
   await page.getByRole('button',{name:'Share Score',exact:true}).click();await save.waitFor();
   await image.evaluate(img=>img.decode());
   const overflow=await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth||el.getBoundingClientRect().right>window.innerWidth);
   if(overflow)throw new Error('Scorecard dialog overflows on mobile');
   console.log('SHARE SCORE: results entry, real PNG download, 1080x1350 resolution, filename, close/reopen and mobile layout passed');
  }
  if(mode==='emotions')await (await import('./verify-emotions.mjs')).verifyEmotions(page);
  if(mode==='locomotion')await (await import('./verify-locomotion.mjs')).verifyLocomotion(page);
  if(mode==='hop')await (await import('./verify-hop.mjs')).verifyHop(page);
  if(mode==='diners')await (await import('./verify-diners.mjs')).verifyDiners(page);
  if(mode==='diner-emotions')await (await import('./verify-diner-emotions.mjs')).verifyDinerEmotions(page);
  if(mode==='menu')await (await import('./verify-menu.mjs')).verifyMenu(page);
  if(mode==='rewards')await (await import('./verify-rewards.mjs')).verifyRewards(page);
  if(mode==='pace')await (await import('./verify-pace.mjs')).verifyPace(page);
  if(mode==='chop-motion')await (await import('./verify-chop-motion.mjs')).verifyChopMotion(page);
  if(mode==='chefs'){
   await page.getByRole('button',{name:'Start shift',exact:true}).click();
   await page.getByRole('region',{name:'Chef dash readiness'}).waitFor();
   const prepare=async()=>page.evaluate(async()=>{
    const {settleScene}=await import('/scripts/inspect.ts');settleScene();
    const {engine}=await import('/src/game/engine.ts');const {activeInput}=await import('/src/scene/KitchenScene.tsx');activeInput.clear();engine.start(true);
    engine.state.chefs.forEach((c,i)=>Object.assign(c,{x:i?1.1:-1.1,z:4.3,facing:0}));engine.update(0,[]);engine.notify();
   });
   const sample=async(seconds=0)=>{
    await page.evaluate(async seconds=>{const {engine}=await import('/src/game/engine.ts');const {activeInput}=await import('/src/scene/KitchenScene.tsx');const {renderSceneFrame}=await import('/scripts/inspect.ts');for(let t=0;t<seconds-1e-9;t+=.02){engine.update(Math.min(.02,seconds-t),activeInput.read());renderSceneFrame(false);}engine.notify();},seconds);
    await page.waitForTimeout(80);
    return page.evaluate(async()=>{const {renderSceneFrame,inspectChefRigs}=await import('/scripts/inspect.ts');for(let i=0;i<30;i++)renderSceneFrame(false,.02);return inspectChefRigs();});
   };
   const capture=async name=>{
    await page.evaluate(async()=>{const {renderSceneFrame}=await import('/scripts/inspect.ts');renderSceneFrame();});
    const session=await page.context().newCDPSession(page);const shot=await session.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`scripts/kitchen-chefs-${name}.png`,Buffer.from(shot.data,'base64'));await session.detach();
   };
   await prepare();const idle=await sample();if(idle.length!==2||idle[0].species!=='crocodile'||idle[1].species!=='mouse')throw new Error('Animal rig not installed');
   for(const chef of idle)for(const side of [-1,1]){
    const shoulder=chef.joints.find(j=>j.name===`upper-arm-${side}`).position;
    const elbow=chef.joints.find(j=>j.name===`forearm-${side}`).position;
    const hand=chef.joints.find(j=>j.name===`hand-${side}`).position;
    if(Math.abs(shoulder[0])>=.33||Math.abs(elbow[0])>=.55||elbow[1]>=shoulder[1]-.13||hand[1]>=.62)throw new Error('Resting arms returned to flared, detached sleeve pose');
   }
   await page.evaluate(async()=>{const {frameChefsDetail}=await import('/scripts/inspect.ts');frameChefsDetail();});await capture('portrait');
   await page.keyboard.down('d');await page.keyboard.down('ArrowLeft');const walk=await sample(.14);
   if(walk.some(c=>Math.abs(c.joints.find(j=>j.name==='leg--1').rotation[0])<.1))throw new Error('Independent walking gait missing');
   await page.keyboard.up('d');await page.keyboard.up('ArrowLeft');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.state.chefs.forEach((c,i)=>Object.assign(c,{x:i?1.1:-1.1,facing:0}));engine.state.chefs[0].held={kind:'plate',parts:['lettuce:chopped','tomato:chopped']};engine.state.chefs[1].held={kind:'tomato',state:'chopped'};engine.notify();});
   const carry=await sample(.02);if(carry.some(c=>!c.joints.find(j=>j.name==='food-socket').children))throw new Error('Food socket lost its item');await capture('carry');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const boards=engine.state.stations.filter(s=>s.kind==='board');boards.forEach((st,id)=>{st.item={kind:id?'lettuce':'tomato',state:'raw'};Object.assign(engine.state.chefs[id],{x:st.x,z:st.z-1.25,facing:0,held:null});});engine.update(0,[]);engine.notify();});
   await page.keyboard.down('f');await page.keyboard.down('l');const lift=await sample(.2);
   if(lift.some(c=>c.action!=='chop'||c.gripDistance===null||c.gripDistance>.0001))throw new Error(`Hands missed lifting knife ${JSON.stringify(lift.map(c=>c.gripDistance))}`);
   const contact=await sample(.12);if(contact.some(c=>c.gripDistance>.0001))throw new Error('Hands missed knife contact');
   await page.evaluate(async()=>{const {frameChefsDetail}=await import('/scripts/inspect.ts');frameChefsDetail(true,-.4);});await capture('chop');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.pause(true);});const paused=await sample(2);
   if(JSON.stringify(paused)!==JSON.stringify(contact))throw new Error('Paused joints drifted');
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);const reduced=await sample();
   if(reduced.some(c=>c.joints.filter(j=>['leg--1','leg-1','toque','tail','scarf'].includes(j.name)).some(j=>j.rotation.some(n=>n!==0))))throw new Error('Reduced-motion joints kept moving');
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);const restored=await sample();if(JSON.stringify(restored)!==JSON.stringify(contact))throw new Error('Pause pose was not restored');
   await page.getByRole('button',{name:'Keep cooking',exact:true}).click();await page.keyboard.up('f');await page.keyboard.up('l');const released=await sample(.1);if(released.some(c=>c.action!=='idle'||c.gripDistance!==null))throw new Error('Released work retained grip');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const st=engine.state.stations.find(s=>s.kind==='sink');st.item={kind:'dirty'};Object.assign(engine.state.chefs[1],{x:st.x,z:st.z+1.25,facing:Math.PI,held:null});engine.update(0,[]);engine.notify();});
   await page.keyboard.down('l');const washing=await sample(.2);if(washing[1].action!=='wash'||washing[0].action!=='idle')throw new Error('Co-op wash was not independent');await page.keyboard.up('l');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const st=engine.state.stations.find(s=>s.kind==='board');st.item={kind:'tomato',state:'raw'};st.progress=0;engine.state.chefs.forEach((c,i)=>Object.assign(c,{x:st.x,z:st.z+(i?1.25:-1.25),facing:i?Math.PI:0,held:null}));engine.update(0,[]);engine.notify();});
   await page.keyboard.down('f');await page.keyboard.down('l');const shared=await sample(.18);
   if(shared.filter(c=>c.gripDistance!==null).length!==1||shared[0].gripDistance>.0001||shared.some(c=>c.action!=='chop'))throw new Error('Shared board must have one knife owner and an independent assisting chef');
   await page.keyboard.up('f');const transfer=await sample(.08);if(transfer[0].gripDistance!==null||transfer[1].gripDistance===null||transfer[1].gripDistance>.0001)throw new Error('Knife ownership did not transfer across opposite sides');await page.keyboard.up('l');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const st=engine.state.stations.find(s=>s.kind==='grill');st.item={kind:'patty',state:'burnt'};st.fire=1;Object.assign(engine.state.chefs[0],{x:st.x,z:st.z+1.25,facing:Math.PI,held:{kind:'extinguisher'}});engine.update(0,[]);engine.notify();});
   await page.keyboard.down('f');const fire=await sample(.1);if(fire[0].action!=='extinguish'||!fire[0].joints.find(j=>j.name==='food-socket').children)throw new Error('Extinguisher hold pose failed');await page.keyboard.up('f');
   await prepare();const reset=await sample();if(reset.some(c=>c.action!=='idle'||c.gripDistance!==null||c.joints.find(j=>j.name==='food-socket').children))throw new Error('Restart left stale attachments');
   await page.evaluate(async()=>{const {frameChefsDetail}=await import('/scripts/inspect.ts');frameChefsDetail(false);});await capture('gameplay');
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await capture('mobile');await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(100);
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.state.practice=false;engine.state.score=600;engine.finish();});await page.getByRole('heading',{name:'Shift complete'}).waitFor();
   const celebration=await sample();if(celebration.some(c=>c.action!=='celebrate'||c.joints.find(j=>j.name==='hand--1').position[1]<1.4))throw new Error('Procedural victory pose did not reach results');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.select(0,'solo');engine.start(true);});const solo=await sample();if(solo.length!==1||solo[0].action!=='idle')throw new Error('Solo retained the second chef or victory pose');
   console.log('CHEFS: animal rigs, gait, carry sockets, precise co-op knife IK, shared-board handoff from opposite sides, pause, reduced motion, washing, extinguisher, victory, restart and solo passed');
  }
  if(mode==='chopping'){
   await page.getByRole('button',{name:'Start shift',exact:true}).click();
   await page.getByRole('region',{name:'Chef dash readiness'}).waitFor();
   await page.evaluate(async()=>{
    const {settleScene}=await import('/scripts/inspect.ts');settleScene();
    const {engine}=await import('/src/game/engine.ts');const {activeInput}=await import('/src/scene/KitchenScene.tsx');
    activeInput.clear();engine.start(true);
    const boards=engine.state.stations.filter(s=>s.kind==='board');
    boards.forEach((st,id)=>{st.item={kind:id?'lettuce':'tomato',state:'raw'};Object.assign(engine.state.chefs[id],{x:st.x,z:st.z+1.25,facing:Math.PI,held:null});});
    window.chopSounds=[];const play=engine.onSound;engine.onSound=event=>{play(event);if(event==='chop')window.chopSounds.push(engine.state.elapsed);};
    engine.update(0,[]);engine.notify();
   });
   const sample=async(seconds=0)=>{
    await page.evaluate(async seconds=>{const {engine}=await import('/src/game/engine.ts');const {activeInput}=await import('/src/scene/KitchenScene.tsx');const {renderSceneFrame}=await import('/scripts/inspect.ts');for(let t=0;t<seconds-1e-9;t+=.02){engine.update(Math.min(.02,seconds-t),activeInput.read());renderSceneFrame(false);}engine.notify();},seconds);
    await page.waitForTimeout(80);
    return page.evaluate(async()=>{const {renderSceneFrame,inspectChopping,inspectActionEffects}=await import('/scripts/inspect.ts');renderSceneFrame(false);return {chopping:inspectChopping(),effects:inspectActionEffects(),sounds:window.chopSounds};});
   };
   const capture=async(name)=>{
    await page.evaluate(async()=>{const {renderSceneFrame}=await import('/scripts/inspect.ts');renderSceneFrame();});
    const session=await page.context().newCDPSession(page);const shot=await session.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`scripts/kitchen-chopping-${name}.png`,Buffer.from(shot.data,'base64'));await session.detach();
   };
   const raw=await sample();if(raw.chopping.boards.some(b=>b.pieces.length!==0||!b.remainder||b.knife.active))throw new Error('Raw board or idle knife is incorrect');await capture('raw');
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await capture('mobile-raw');await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(100);
   await page.keyboard.down('f');await page.keyboard.down('l');
   const lift=await sample(.2);if(lift.chopping.boards.some(b=>b.knife.position[1]<1.78||b.pieces.length))throw new Error('Knife did not lift before first contact');
   const contact=await sample(.12);
   if(contact.sounds.length!==2||contact.chopping.boards.some(b=>b.pieces.length!==1||Math.abs(b.knife.position[1]-1.47)>.001))throw new Error('Knife, first slice and co-op sounds are out of sync');
   if(contact.effects.pools[0].count!==14||contact.effects.pools[1].count!==0||contact.effects.pools[2].count!==0)throw new Error('Chopping must render only seven low flecks per board');
   const partial=await sample(.6);if(partial.chopping.boards.some(b=>b.pieces.length!==3||!b.remainder))throw new Error('Half-prepared food did not reveal three cuts');await capture('partial');
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await capture('mobile-partial');await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(100);
   await page.evaluate(async()=>{const {frameChoppingDetail}=await import('/scripts/inspect.ts');frameChoppingDetail();});await capture('partial-detail');
   await page.evaluate(async()=>{const {frameChoppingDetail}=await import('/scripts/inspect.ts');frameChoppingDetail(false);});
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.pause(true);});
   const frozen=await sample(2);if(JSON.stringify(frozen)!==JSON.stringify(partial))throw new Error('Paused chopping drifted');
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
   const reduced=await sample();if(reduced.effects.pools.some(p=>p.visible)||reduced.chopping.boards.some(b=>b.pieces.length!==3||Math.abs(b.knife.rotation[2])>.00001||Math.abs(b.knife.position[1]-1.47)>.001))throw new Error(`Reduced motion did not keep static cut stages without particles: ${JSON.stringify({knives:reduced.chopping.boards.map(b=>b.knife),pools:reduced.effects.pools.map(p=>({name:p.name,visible:p.visible})),cuts:reduced.chopping.boards.map(b=>b.pieces.length)})}`);
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches);
   const restored=await sample();if(JSON.stringify(restored)!==JSON.stringify(partial))throw new Error('Paused chopping failed to restore precisely');
   await page.getByRole('button',{name:'Keep cooking',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
   await page.keyboard.up('f');await page.keyboard.up('l');
   const stopped=await sample(.3);if(stopped.chopping.boards.some(b=>b.knife.active||b.pieces.length!==3))throw new Error('Released work kept chopping');
   await page.keyboard.down('f');await page.keyboard.down('l');
   const ready=await sample(.88);if(ready.chopping.boards.some(b=>b.pieces.length!==6||b.remainder)||ready.sounds.length!==12)throw new Error('Six completed cuts or sound count is wrong');
   await page.keyboard.up('f');await page.keyboard.up('l');await sample(.25);await capture('ready');
   await page.evaluate(async()=>{const {frameChoppingDetail}=await import('/scripts/inspect.ts');frameChoppingDetail(true,1.6);});await capture('lettuce-detail');
   await page.evaluate(async()=>{const {frameChoppingDetail}=await import('/scripts/inspect.ts');frameChoppingDetail(false);});
   await page.keyboard.press('e');await page.keyboard.press('k');const held=await sample(.02);
   if(held.chopping.carried.length!==2||held.chopping.carried.some(c=>c.pieces!==6))throw new Error('Prepared slices were lost in chefs hands');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const counters=engine.state.stations.filter(s=>s.kind==='counter');engine.interact(engine.state.chefs[0],counters[0]);counters[1].item={kind:'plate',parts:[]};engine.interact(engine.state.chefs[1],counters[1]);engine.notify();});
   await sample();
   const plated=await page.evaluate(async()=>{const {inspectCounterCuts}=await import('/scripts/inspect.ts');return inspectCounterCuts();});
   if(!plated)throw new Error('Cut geometry disappeared on counters or unfinished plates');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.start(true);engine.notify();});
   const reset=await sample();if(reset.chopping.boards.some(b=>b.pieces.length||b.knife.active)||reset.effects.pools.some(p=>p.count))throw new Error('Restart retained cut feedback');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const boards=engine.state.stations.filter(s=>s.kind==='board');boards.forEach((st,i)=>{st.item={kind:i?'lettuce':'tomato',state:'chopped'};});engine.notify();});
   await sample();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await capture('mobile');
   await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(100);await sample();
   await page.evaluate(async()=>{const {frameChoppingDetail}=await import('/scripts/inspect.ts');frameChoppingDetail();});
   console.log('CHOPPING: raw/partial/ready geometry, knife contact, 12 independent co-op sounds, bounded flecks, pause, release/resume, live reduced motion, carried/counter/plated slices, restart and mobile passed');
  }
  if(mode==='effects'){
   await page.getByRole('button',{name:'Start shift',exact:true}).click();
   await page.getByRole('region',{name:'Chef dash readiness'}).waitFor();
   const prepare=async()=>page.evaluate(async()=>{
    const {settleScene,renderSceneFrame}=await import('/scripts/inspect.ts');settleScene();
    const {engine}=await import('/src/game/engine.ts');const {activeInput}=await import('/src/scene/KitchenScene.tsx');
    activeInput.clear();engine.start(true);
    for(const [id,kind] of ['board','sink'].entries()){
     const st=engine.state.stations.find(s=>s.kind===kind);const chef=engine.state.chefs[id];
     chef.x=st.x;chef.z=st.z+1.25;chef.facing=Math.PI;
     if(id===0)chef.held={kind:'tomato',state:'raw'};else {st.item={kind:'dirty'};st.progress=.99;}
    }
    engine.update(0,[]);engine.notify();renderSceneFrame(false);
   });
   const sample=async(seconds=0)=>page.evaluate(async seconds=>{
    const {engine}=await import('/src/game/engine.ts');const {renderSceneFrame,inspectActionEffects}=await import('/scripts/inspect.ts');
    for(let t=0;t<seconds-1e-9;t+=.02)engine.update(Math.min(.02,seconds-t),[]);
    renderSceneFrame(false);return inspectActionEffects();
   },seconds);
   await prepare();
   await page.keyboard.press('e');await page.keyboard.down('l');
   const events=await page.evaluate(async()=>{
    const {engine}=await import('/src/game/engine.ts');const {activeInput}=await import('/src/scene/KitchenScene.tsx');
    engine.update(.05,activeInput.read());engine.notify();return engine.actionEffects;
   });
   await page.keyboard.up('l');
   if(events.length!==2||events[0].kind!=='place'||events[1].kind!=='wash')throw new Error('Success inputs failed to emit independent place/wash effects');
   const squash=await sample(.07);
   if(!squash.chefs.every(c=>c.scale[1]<1&&c.scale[0]>1))throw new Error('Chef squash was not rendered');
   const stretch=await sample(.13);
   if(!stretch.chefs.every(c=>c.scale[1]>1))throw new Error('Chef stretch was not rendered');
   if(!stretch.pools.every(p=>p.visible&&p.count>0))throw new Error('Distinct seasoning, bubbles, and glints were not rendered');
   if(stretch.chefs[1].lift<=0)throw new Error('Wash hop was not rendered');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.pause(true);});
   const paused=await sample(3);
   if(JSON.stringify(paused)!==JSON.stringify(stretch))throw new Error('Paused particle or squash pose drifted');
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
   const reduced=await sample();
   if(reduced.pools.some(p=>p.visible||p.count>0)||reduced.chefs.some(c=>c.scale.some(n=>n!==1)||c.lift!==0))throw new Error('Reduced-motion setting did not suppress feedback motion');
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.waitForFunction(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
   const restored=await sample();
   if(JSON.stringify(restored)!==JSON.stringify(stretch))throw new Error('Restoring motion changed paused feedback time');
   await page.getByRole('button',{name:'Keep cooking',exact:true}).click();
   await page.getByRole('dialog').waitFor({state:'hidden'});
   const expired=await sample(1.1);
   if(expired.pools.some(p=>p.count>0)||expired.chefs.some(c=>c.scale.some(n=>n!==1)||c.lift!==0))throw new Error('Feedback failed to expire');
   await prepare();
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const idle={x:0,y:0,pick:false,work:false,dash:false};engine.update(.05,[{...idle,pick:true},{...idle,work:true}]);engine.notify();});
   await sample(.2);
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.start(true);});
   const reset=await sample();
   if(reset.pools.some(p=>p.count>0)||reset.chefs.some(c=>c.scale.some(n=>n!==1)))throw new Error('Restart retained stale feedback');
   await prepare();
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const idle={x:0,y:0,pick:false,work:false,dash:false};engine.update(.05,[{...idle,pick:true},{...idle,work:true}]);engine.notify();});
   await sample(.2);
   console.log('ACTION EFFECTS: actual keyboard success events, co-op models, three particle pools, squash/stretch, pause, live reduced motion, expiry and restart passed');
  }
  if(mode==='dash'){
   await page.getByRole('button',{name:'Start shift',exact:true}).click();
   await page.getByRole('region',{name:'Chef dash readiness'}).waitFor();
   await page.evaluate(async()=>{
    const {settleScene}=await import('/scripts/inspect.ts');settleScene();
    const {engine}=await import('/src/game/engine.ts');const {activeInput}=await import('/src/scene/KitchenScene.tsx');
    activeInput.clear();engine.state.paused=false;
    engine.state.chefs.forEach((c,i)=>{c.x=i===0?-4.5:1;c.z=-1.5;c.facing=Math.PI/2;c.dash=0;c.cooldown=0;});engine.notify();
   });
   await page.keyboard.press('Space');await page.keyboard.press('j');
   const burst=await page.evaluate(async()=>{
    const {engine}=await import('/src/game/engine.ts');const {activeInput}=await import('/src/scene/KitchenScene.tsx');
    const before=engine.state.chefs.map(c=>c.x);engine.update(.02,activeInput.read());engine.notify();
    return engine.state.chefs.map((c,i)=>({distance:c.x-before[i],dash:c.dash,cooldown:c.cooldown}));
   });
   if(!burst.every(c=>Math.abs(c.distance-.2)<1e-6&&c.dash>0&&c.cooldown>2.9))throw new Error('Dash keys did not activate both chefs');
   await page.getByText('DASHING',{exact:true}).first().waitFor();
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');for(let i=0;i<49;i++)engine.update(.02,[]);engine.notify();});
   await page.getByText('2.0s RECHARGE',{exact:true}).first().waitFor();
   await page.getByRole('button',{name:'Pause game'}).click();
   const frozen=await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const before=engine.state.chefs[0].cooldown;for(let i=0;i<100;i++)engine.update(.02,[]);return engine.state.chefs[0].cooldown===before;});
   if(!frozen)throw new Error('Dash recharge continued while paused');
   await page.getByRole('button',{name:'Keep cooking',exact:true}).click();
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');for(let i=0;i<100;i++)engine.update(.02,[]);engine.notify();});
   await page.getByText('DASH READY',{exact:true}).first().waitFor();
   console.log('DASH: both keyboard controls, HUD recharge, pause/resume, and readiness passed');
  }
  if(mode==='ingredients'){
   await page.getByRole('button',{name:'Start shift',exact:true}).click();
   await page.evaluate(async()=>{
    const {settleScene}=await import('/scripts/inspect.ts');settleScene();
    const {engine}=await import('/src/game/engine.ts');engine.state.paused=false;
    for(const [id,kind] of ['tomato','bun'].entries()){
     const st=engine.state.stations.find(s=>s.kind===kind);const chef=engine.state.chefs[id];
     chef.x=st.x;chef.z=st.z-1.25;chef.facing=0;chef.held=null;
    }
    engine.update(0,[]);engine.notify();
   });
   await page.locator('kbd[aria-label="Tomato: press E to pick up or place"]').waitFor();
   await page.locator('kbd[aria-label="Buns: press K to pick up or place"]').waitFor();
   const foodLabels=await page.locator('.station-label').allTextContents();
   if(foodLabels.some(text=>/Lettuce|Tomato|Patties|Buns|Prep|Chop|Grill/.test(text)))throw new Error('Floating labels still cover food surfaces');
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.state.orders=[{id:1,recipe:'salad',remaining:40,duration:60},{id:2,recipe:'burger',remaining:30,duration:60}];engine.notify();});
   await page.getByRole('region',{name:'Active orders'}).getByRole('list',{name:'Rooftop burger ingredients'}).waitFor();
   for(const [recipe,count] of [['Garden salad',2],['Rooftop burger',4]]){
    if(await page.getByRole('region',{name:'Active orders'}).getByRole('list',{name:`${recipe} ingredients`}).getByRole('img').count()!==count)throw new Error('Incorrect ingredient icons on order ticket');
   }
   const waitForOutlines=async(count)=>page.waitForFunction(async expected=>{
    const {inspectIngredientOutlines}=await import('/scripts/inspect.ts');return inspectIngredientOutlines().length===expected;
   },count,{timeout:10000});
   await waitForOutlines(2);
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');for(const chef of engine.state.chefs){const st=engine.state.stations.find(s=>s.id===chef.near);engine.interact(chef,st);}engine.notify();});
   await waitForOutlines(0);
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.state.chefs.forEach(c=>{c.held=null;});engine.notify();});
   await waitForOutlines(2);
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.pause(true);});
   await waitForOutlines(0);
   await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.pause(false);});
   await waitForOutlines(2);
   await page.setViewportSize({width:390,height:844});
   const lists=page.getByRole('region',{name:'Active orders'}).getByRole('list');
   for(const list of await lists.all()){
    const overflow=await list.evaluate(el=>{const article=el.closest('article').getBoundingClientRect();return [...el.querySelectorAll('svg')].some(icon=>{const box=icon.getBoundingClientRect();return box.left<article.left||box.right>article.right;});});
    if(overflow)throw new Error('Ingredient icons overflow a phone-sized order ticket');
   }
   await page.setViewportSize({width:1280,height:800});
   await page.evaluate(async()=>{const {renderSceneFrame}=await import('/scripts/inspect.ts');renderSceneFrame();});
   console.log('INGREDIENTS: unobstructed food, E/K cues, recipe icons, phone ticket layout, co-op pickup and pause/resume passed');
  }
  if(mode==='play'||mode==='behavior'||mode==='results'){
   await page.getByRole('button',{name:'Start shift',exact:true}).click();
   await page.waitForTimeout(600);
   const before=await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');return engine.state.chefs.map(c=>c.x);});
   await page.keyboard.down('d');await page.keyboard.down('ArrowLeft');
   console.log('INPUT',await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');const {activeInput}=await import('/src/scene/KitchenScene.tsx');return {phase:engine.state.phase,paused:engine.state.paused,elapsed:engine.state.elapsed,keys:Array.from(activeInput?.keys??[]),hidden:document.hidden};}));
   for(let attempt=0;attempt<8;attempt++){
    const current=await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');return {elapsed:engine.state.elapsed,x:engine.state.chefs.map(c=>c.x),paused:engine.state.paused};});console.log('TICK',attempt,current);
    if(current.x[0]>-3.5&&current.x[1]<3.5)break;
    await page.waitForTimeout(1000);
   }
   console.log('ROOT',await page.evaluate(async()=>{const m=await import('/scripts/inspect.ts');return m.inspectScene();}));
   await page.keyboard.up('d');await page.keyboard.up('ArrowLeft');
   const after=await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');return engine.state.chefs.map(c=>c.x);});
   console.log('SIMULTANEOUS MOVEMENT',before,after);
   if(!(after[0]>before[0]&&after[1]<before[1]))throw new Error('Keyboard movement did not reach both chefs');
   if(mode==='behavior'){
    await page.getByRole('button',{name:'Pause game'}).click();
    await page.getByRole('dialog').waitFor();
    const beforePause=await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');return engine.state.time;});
    await page.waitForTimeout(1000);
    const afterPause=await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');return engine.state.time;});
    if(beforePause!==afterPause)throw new Error('Pause did not freeze timer');
    await page.getByRole('button',{name:'Keep cooking'}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});console.log('PAUSE / RESUME PASSED');
   }
   if(mode==='results'){
    await page.evaluate(async()=>{const {engine}=await import('/src/game/engine.ts');engine.state.orderPoints=500;engine.state.tips=140;engine.state.penalties=20;engine.state.score=620;engine.state.served=10;engine.finish();});
    await page.getByRole('heading',{name:'Shift complete'}).waitFor();
   }
  }
 }
 await page.waitForTimeout(600);
 console.log('SCENE',JSON.stringify(await page.evaluate(async(closeup)=>{const module=await import('/scripts/inspect.ts');const info=module.inspectScene();module.settleScene(closeup);return info;},mode==='model')));
 if(mode==='mobile'){
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  if(overflow)throw new Error('Narrow-screen horizontal overflow');
 }
 const session=await page.context().newCDPSession(page);
 const capture=await session.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(`scripts/kitchen-${mode}.png`,Buffer.from(capture.data,'base64'));
 console.log('SCREENSHOT',mode,'ERRORS',JSON.stringify(errors));
 if(errors.length)throw new Error('Browser errors occurred');
} catch(error) {console.error(error);process.exitCode=1;} finally {server.kill('SIGTERM');await Promise.race([browser?.close(),new Promise(r=>setTimeout(r,1000))]);process.exit(process.exitCode??0);}
