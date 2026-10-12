import { _roots } from '@react-three/fiber';
import * as THREE from 'three';
import type { TrafficAudio } from '../src/management/traffic-audio';
/** Screen-space picking diagnostics for the management grid; used only by local verification. */
export function restaurantTileScreen(x:number,z:number,height=.1){
 const state=[..._roots.values()][0]?.store.getState();if(!state)return null;
 const bounds=state.gl.domElement.getBoundingClientRect();state.camera.updateMatrixWorld(true);
 const point=new THREE.Vector3(x*1.4,height,z*1.4).project(state.camera);
 return {x:bounds.left+(point.x+1)*bounds.width/2,y:bounds.top+(1-point.y)*bounds.height/2,ndc:[point.x,point.y],size:state.size,zoom:(state.camera as THREE.OrthographicCamera).zoom};
}
/** Build overlay diagnostics for real raycast/rotation verification. */
export function inspectBuildGrid() {
 const scene = [..._roots.values()][0]?.store.getState().scene;
 const grid = scene?.getObjectByName('build-grid');
 const footprint = scene?.getObjectByName('placement-footprint');
 return { visible: Boolean(grid), ...grid?.userData, cells: grid?.children.filter(child => child.name.startsWith('build-cell-')).length ?? 0, guides: Boolean(grid?.getObjectByName('build-alignment')), footprint: footprint ? { ...footprint.userData } : null };
}
/** Ambient city diagnostics use the rendered objects, never simulated fixture positions. */
export function inspectCity() {
 const state = [..._roots.values()][0]?.store.getState(); if (!state) return null;
 state.scene.updateMatrixWorld(true);
 const city = state.scene.getObjectByName('city-life');
 const cars = city?.children.filter(child => child.name.startsWith('city-car-')).map(child => {
  const box = new THREE.Box3().setFromObject(child);
  return { name: child.name, position: child.position.toArray(), yaw: child.rotation.y, size: box.getSize(new THREE.Vector3()).toArray(), direction: child.userData.direction };
 }) ?? [];
 const walkers = city?.children.filter(child => child.name.startsWith('city-walker-')).map(child => ({ name: child.name, position: child.position.toArray(), yaw: child.rotation.y })) ?? [];
 return { time: city?.userData.time, cars, walkers, wide: state.camera.userData.cityView, zoom: (state.camera as THREE.OrthographicCamera).zoom, render: { ...state.gl.info.render } };
}
/** Park diagnostics read visible geometry, seat sockets and poses from the live scene. */
export function inspectPark() {
 const state = [..._roots.values()][0]?.store.getState(); if (!state) return null;
 const park = state.scene.getObjectByName('city-park'); if (!park) return null;
 state.scene.updateMatrixWorld(true);
 const benches = park.children.filter(child => child.name.startsWith('park-bench-')).map(child => ({ name: child.name, size: new THREE.Box3().setFromObject(child).getSize(new THREE.Vector3()).toArray(), ...child.userData }));
 const visitors = park.children.filter(child => child.name.startsWith('park-visitor-')).map(child => ({ name: child.name, position: child.position.toArray(), yaw: child.rotation.y, ...child.userData, hip: child.getObjectByName('hip--1')?.rotation.x, knee: child.getObjectByName('knee--1')?.rotation.x }));
 const bounds = new THREE.Box3().setFromObject(park);
 const ndc = [bounds.min, bounds.max, new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z), new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z)].map(point => point.clone().project(state.camera).toArray());
 const ray = new THREE.Raycaster(new THREE.Vector3(2.7, 5, 25.35), new THREE.Vector3(0, -1, 0));
 return { ...park.userData, benches, visitors, ndc, hits: ray.intersectObject(park, true).length, render: { ...state.gl.info.render } };
}
export function frameParkDetail() {
 const state = [..._roots.values()][0]?.store.getState(); if (!state) return;
 state.camera.position.set(11, 7, 16); state.camera.lookAt(5.6, -.1, 24.6);
 (state.camera as THREE.OrthographicCamera).zoom = Math.min(state.size.width / 13, state.size.height / 9);
 state.camera.updateProjectionMatrix(); state.camera.updateMatrixWorld(true); state.gl.render(state.scene, state.camera);
}
/** The real street display, model bounds and texture upload counters. */
export function inspectBulletin() {
 const state = [..._roots.values()][0]?.store.getState(); if (!state) return null;
 const root = state.scene.getObjectByName('city-bulletin'); if (!root) return null;
 state.scene.updateMatrixWorld(true);
 const bounds = new THREE.Box3().setFromObject(root), screens: unknown[] = [];
 root.traverse(node => { if (node.name.startsWith('bulletin-screen-') && node instanceof THREE.Mesh) { const map = (node.material as THREE.MeshBasicMaterial).map; screens.push({ name: node.name, texture: map?.uuid, version: map?.version, size: [map?.image.width, map?.image.height] }); } });
 const ray = new THREE.Raycaster(new THREE.Vector3(-3.1, 8, 23.6), new THREE.Vector3(0, -1, 0));
 const ndc = [bounds.min, bounds.max, new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z), new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z)].map(p => p.clone().project(state.camera).toArray());
 return { ...root.userData, screens, size: bounds.getSize(new THREE.Vector3()).toArray(), ndc, hits: ray.intersectObject(root, true).length, generated: Boolean(root.getObjectByName('bulletin-enclosure')), render: { ...state.gl.info.render } };
}
export function frameBulletinDetail() {
 const state = [..._roots.values()][0]?.store.getState(); if (!state) return;
 state.camera.position.set(.9, 3.7, 31.6); state.camera.lookAt(-3.1, .7, 23.6);
 (state.camera as THREE.OrthographicCamera).zoom = Math.min(state.size.width / 6, state.size.height / 5.4);
 state.camera.updateProjectionMatrix(); state.camera.updateMatrixWorld(true); renderSceneFrame(false, 0); state.gl.render(state.scene, state.camera);
}
/** Audio diagnostics from the controller fed by the rendered cars. */
export function inspectTrafficAudio() {
 const state = [..._roots.values()][0]?.store.getState();
 const audio = state?.scene.getObjectByName('city-life')?.userData.trafficAudio as TrafficAudio | undefined;
 return audio?.inspect() ?? null;
}
/** Real weather buffers, materials and scene attachments for the local WebGL verifier. */
export function inspectWeather() {
 const state = [..._roots.values()][0]?.store.getState(); if (!state) return null;
 const root = state.scene.getObjectByName('city-weather'); if (!root) return null;
 const rain = root.getObjectByName('weather-rain') as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
 const puddles = root.getObjectByName('weather-puddles') as THREE.InstancedMesh;
 const ripples = root.getObjectByName('weather-ripples') as THREE.InstancedMesh;
 const sun = root.getObjectByName('weather-sunlight') as THREE.DirectionalLight;
 return { ...root.userData, rainVisible: rain.visible, rainOpacity: rain.material.opacity, drops: rain.geometry.attributes.position.count / 2, vertices: Array.from(rain.geometry.attributes.position.array).slice(0, 36), puddles: puddles.count, puddlesVisible: puddles.visible, ripplesVisible: ripples.visible, ripples: Array.from(ripples.instanceMatrix.array).slice(0, 32), sunlight: sun.intensity, fog: state.scene.fog?.color.getHexString(), background: state.scene.background instanceof THREE.Texture, render: { ...state.gl.info.render } };
}
/** Inspect actual lamp/neon materials and verify glow surfaces are not picking targets. */
export function inspectCityLighting() {
 const state = [..._roots.values()][0]?.store.getState(); if (!state) return null;
 const root = state.scene.getObjectByName('city-lighting'); if (!root) return null;
 state.scene.updateMatrixWorld(true);
 const bulbs = root.getObjectByName('city-lanterns') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
 const halos = root.getObjectByName('city-lamp-halos') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
 const pools = root.getObjectByName('city-light-pools') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
 const neon = [0, 1, 2].map(channel => {
  const mesh = root.getObjectByName(`city-neon-${channel}`) as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  return { count: mesh.count, intensity: mesh.material.emissiveIntensity, geometry: mesh.geometry.uuid, color: mesh.material.emissive.getHexString() };
 });
 const picker = new THREE.Raycaster(new THREE.Vector3(-8.4, 8, -1), new THREE.Vector3(0, -1, 0));
 return { ...root.userData, lamps: bulbs.count, lampIntensity: bulbs.material.emissiveIntensity, halos: halos.visible, haloOpacity: halos.material.opacity, pools: pools.visible, poolOpacity: pools.material.opacity, neon, hits: picker.intersectObject(root, true).length, render: { ...state.gl.info.render } };
}
/** Map fit and scenery budget from the active camera and live instanced environment. */
export function inspectCityMap(columns: number, bounds: { left: number; right: number; back: number; front: number; height: number }) {
 const state = [..._roots.values()][0]?.store.getState(); if (!state) return null;
 const ndc: number[][] = [];
 for (const x of [bounds.left, bounds.right]) for (const z of [bounds.back, bounds.front]) for (const y of [-1, bounds.height]) ndc.push(new THREE.Vector3(x, y, z).project(state.camera).toArray());
 const root = state.scene.getObjectByName('outer-city-districts');
 let instances = 0; root?.traverse(node => { if (node instanceof THREE.InstancedMesh) instances += node.count; });
 const ray = new THREE.Raycaster(new THREE.Vector3(-24, 12, 4), new THREE.Vector3(0, -1, 0));
 return { columns, district: state.camera.userData.district, ndc, instances, hits: root ? ray.intersectObject(root, true).length : -1, render: { ...state.gl.info.render } };
}
export function resumeScene(){const state=[..._roots.values()][0]?.store.getState();state?.setFrameloop('always');}
export function inspectScene(){
 const root=[..._roots.values()][0];if(!root)return null;const state=root.store.getState();
 const meshes:unknown[]=[];state.scene.traverse(object=>{const mesh=object as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;mesh.computeBoundingBox();meshes.push({name:mesh.name,position:mesh.getWorldPosition(new THREE.Vector3()).toArray(),scale:mesh.getWorldScale(new THREE.Vector3()).toArray(),size:mesh.boundingBox?.getSize(new THREE.Vector3()).toArray(),verts:mesh.geometry.attributes.position.count,visible:mesh.visible});});
 return {meshes,size:{width:state.size.width,height:state.size.height},render:state.gl.info.render,children:state.scene.children.length,frameloop:state.frameloop,active:state.internal.active,priority:state.internal.priority,subscribers:state.internal.subscribers.length,clockRunning:state.clock.running};
}
export function inspectIngredientOutlines(){
 const scene=[..._roots.values()][0]?.store.getState().scene;
 const stations:string[]=[];
 scene?.traverse(node=>{if(node.name!=='ingredient-outline')return;let parent=node.parent;while(parent&&!parent.name.startsWith('station-'))parent=parent.parent;if(parent&&!stations.includes(parent.name))stations.push(parent.name);});
 return stations;
}
export function renderSceneFrame(draw=true,poseDelta=0){
 const state=[..._roots.values()][0]?.store.getState();if(!state)return;
 if(draw)state.advance(state.clock.elapsedTime);
 else for(const subscriber of state.internal.subscribers)subscriber.ref.current(state,subscriber.priority===-2?0:poseDelta);
}
export function inspectActionEffects(){
 const scene=[..._roots.values()][0]?.store.getState().scene;
 const pools=['action-seasoning','action-bubbles','action-sparkles'].map(name=>{const mesh=scene?.getObjectByName(name) as THREE.InstancedMesh|undefined;return {name,count:mesh?.count??0,visible:mesh?.visible??false,matrices:mesh?Array.from(mesh.instanceMatrix.array).slice(0,mesh.count*16):[]};});
 const chefs=[0,1].map(id=>{const pose=scene?.getObjectByName(`chef-action-pose-${id}`);return {id,scale:pose?.scale.toArray(),lift:pose?.position.y};});
 return {pools,chefs};
}
export function inspectChopping(){
 const state=[..._roots.values()][0]?.store.getState();if(!state)return null;
 const boards:unknown[]=[];const carried:unknown[]=[];
 state.scene.updateMatrixWorld(true);
 state.scene.traverse(node=>{
  if(node.name.startsWith('station-board-')){
   const knife=node.children.find(child=>child.name.startsWith('chopping-knife-'));
   const food=node.children.find(child=>child.name.startsWith('board-vegetable-'));
   const cuts=food?.children.find(child=>/^cut-(tomato|lettuce)$/.test(child.name));
   const remainder=food?.getObjectByName('uncut-remainder');
   boards.push({name:node.name,knife:knife?{position:knife.position.toArray(),rotation:knife.rotation.clone().reorder('YXZ').toArray().slice(0,3),...knife.userData}:null,remainder:remainder?.visible??false,kind:cuts?.name,pieces:cuts?.children.filter(p=>p.visible).map(p=>({position:p.position.toArray(),rotation:p.rotation.toArray().slice(0,3)}))??[]});
  }
  if(node.name==='cut-tomato'||node.name==='cut-lettuce'){
   let parent=node.parent;while(parent&&!parent.name.startsWith('station-')&&!parent.name.startsWith('chef-'))parent=parent.parent;
   if(parent?.name.startsWith('chef-'))carried.push({name:node.name,owner:parent.name,pieces:node.children.filter(p=>p.visible).length});
  }
 });
 return {boards,carried};
}
export function frameChoppingDetail(enabled=true,centerX=-1.6){
 const state=[..._roots.values()][0]?.store.getState();if(!state)return;
 if(enabled){state.camera.position.set(centerX,5,6);state.camera.lookAt(centerX,1.5,.2);(state.camera as THREE.OrthographicCamera).zoom=300;}
 else{state.camera.position.set(0,18,18);state.camera.lookAt(0,0,-.5);(state.camera as THREE.OrthographicCamera).zoom=Math.min(state.size.width/20.5,state.size.height/16);}
 state.camera.updateProjectionMatrix();state.gl.render(state.scene,state.camera);
}
export function frameKnifeGrip(x:number,z:number){
 const state=[..._roots.values()][0]?.store.getState();if(!state)return;
 state.camera.position.set(x+5,4.2,z+4);state.camera.lookAt(x,1.3,z+.5);(state.camera as THREE.OrthographicCamera).zoom=220;state.camera.updateProjectionMatrix();state.gl.render(state.scene,state.camera);
}
export function inspectCounterCuts(){
 const scene=[..._roots.values()][0]?.store.getState().scene;
 return Boolean(scene?.getObjectByName('station-counter-0')?.getObjectByName('cut-tomato'))&&Boolean(scene?.getObjectByName('station-counter-3')?.getObjectByName('cut-lettuce'));
}
export function frameChefsDetail(enabled=true,centerZ=4.3){
 const state=[..._roots.values()][0]?.store.getState();if(!state)return;
 if(enabled){state.camera.position.set(2,4,centerZ+8);state.camera.lookAt(0,1.05,centerZ);(state.camera as THREE.OrthographicCamera).zoom=180;}
 else{state.camera.position.set(0,18,18);state.camera.lookAt(0,0,-.5);(state.camera as THREE.OrthographicCamera).zoom=Math.min(state.size.width/20.5,state.size.height/16);}
 state.camera.updateProjectionMatrix();state.gl.render(state.scene,state.camera);
}
export function inspectChefRigs(){
 const scene=[..._roots.values()][0]?.store.getState().scene;if(!scene)return [];
 scene.updateMatrixWorld(true);
 return [0,1].flatMap(id=>{
  const rig=scene.getObjectByName(`procedural-chef-${id}`);if(!rig)return [];
  const root=scene.getObjectByName(`chef-${id}`);
  const joints=['head','toque','eyes','scarf','tail','leg--1','leg-1','upper-arm--1','upper-arm-1','forearm--1','forearm-1','hand--1','hand-1','food-socket'].map(name=>{const joint=rig.getObjectByName(name);return {name,position:joint?.position.toArray(),rotation:joint?.rotation.toArray().slice(0,3),scale:joint?.scale.toArray(),world:joint?.getWorldPosition(new THREE.Vector3()).toArray(),children:joint?.children.length};});
  let gripDistance:number|null=null;
  scene.traverse(node=>{if(node.name.startsWith('chopping-knife-')&&node.userData.ownerId===id){const grip=node.getObjectByName('knife-grip'),hand=rig.getObjectByName(`hand-${node.userData.handSide===1?1:-1}`);if(grip&&hand)gripDistance=grip.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()));}});
  return [{id,species:rig.userData.species,action:rig.userData.action,position:root?.position.toArray(),joints,gripDistance}];
 });
}
export function inspectChefLocomotion(){
 const scene=[..._roots.values()][0]?.store.getState().scene;
 return [0,1].flatMap(id=>{
  const root=scene?.getObjectByName(`chef-${id}`);if(!root)return [];
  const body=root.getObjectByName('chef-motion');
  return [{id,...root.userData.locomotion,position:root.position.toArray(),rotation:root.rotation.toArray().slice(0,3),body:{position:body?.position.toArray(),rotation:body?.rotation.toArray().slice(0,3)}}];
 });
}
export function inspectChefOutfits(){
 return [..._roots.values()].flatMap(root=>{
  const {scene}=root.store.getState();
  return [0,1].flatMap(id=>{
   const rig=scene.getObjectByName(`procedural-chef-${id}`);if(!rig)return [];
   const fabric=(name:string)=>{const mesh=rig.getObjectByName(`${name}-fabric-mesh`) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>|undefined;return {hex:mesh?.material.color.getHexString(),geometry:mesh?.geometry.uuid};};
   return [{id,hat:fabric('hat'),apron:fabric('apron'),preview:!scene.getObjectByName(`chef-${id}`)}];
  });
 });
}
export function inspectChefFaces(){
 const scene=[..._roots.values()][0]?.store.getState().scene;if(!scene)return [];
 return [0,1].flatMap(id=>{
  const rig=scene.getObjectByName(`procedural-chef-${id}`);if(!rig)return [];
  const mouth=rig.getObjectByName('expression-mouth') as THREE.Mesh|undefined;
  return [{id,emotion:rig.userData.emotion,weights:mouth?.morphTargetInfluences?.slice(),joints:['eye--1','eye-1','pupil--1','pupil-1','brow--1','brow-1','smile-eye--1','smile-eye-1'].map(name=>{const joint=rig.getObjectByName(name);return {name,position:joint?.position.toArray(),rotation:joint?.rotation.toArray().slice(0,3),scale:joint?.scale.toArray()};})}];
 });
}
export function settleScene(closeup=false){const root=[..._roots.values()][0];if(!root)return;const state=root.store.getState();state.setFrameloop('never');if(closeup){state.camera.position.set(3.2,3,8);state.camera.lookAt(3.2,1,0);(state.camera as THREE.OrthographicCamera).zoom=240;state.camera.updateProjectionMatrix();}state.gl.render(state.scene,state.camera);}
