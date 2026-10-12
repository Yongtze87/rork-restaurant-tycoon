import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal as createDOMPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useProgress } from '@react-three/drei';
import { MODELS } from '@/game/assets';
import * as THREE from 'three';
import { engine } from '@/game/engine';
import { KitchenInput } from '@/game/input';
import type { GameState } from '@/game/types';
import { Rooftop } from './Rooftop';
import { StationView } from './Stations';
import { ChefView } from './Chef';
import { ActionEffects } from './ActionEffects';
import { Diners } from './Diners';
import { ServiceRewards } from './ServiceRewards';

export let activeInput:KitchenInput|null=null;
Object.values(MODELS).forEach(asset=>useGLTF.preload(asset.url));
class GraphicsBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?createDOMPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-teal p-6"><div className="paper max-w-sm p-6 text-center"><h2 className="text-2xl">The kitchen couldn’t load</h2><p className="my-4">Check your connection and enable hardware acceleration, or try a browser with WebGL 2 support.</p><button className="game-button mx-auto" onClick={()=>window.location.reload()}>Try again</button></div></div>,document.body):this.props.children;}
}
function Sky(){
 const texture=useMemo(()=>{const c=document.createElement('canvas');c.width=32;c.height=512;const ctx=c.getContext('2d')!;const g=ctx.createLinearGradient(0,0,0,512);g.addColorStop(0,'#866780');g.addColorStop(.4,'#d38984');g.addColorStop(.75,'#f6b581');g.addColorStop(1,'#f3c17e');ctx.fillStyle=g;ctx.fillRect(0,0,32,512);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;},[]);
 return <primitive attach="background" object={texture}/>;
}
function CameraAndSimulation({phase}:{phase:GameState['phase']}) {
 const {camera,size}=useThree();const forward=useMemo(()=>new THREE.Vector3(),[]);const right=useMemo(()=>new THREE.Vector3(),[]);
 useEffect(()=>{const cam=camera as THREE.OrthographicCamera;const menu=phase==='menu';const wide=size.width>=850;const centerX=menu&&wide?-4.4:0;cam.position.set(centerX,18,18);cam.lookAt(centerX,0,-.5);cam.zoom=Math.min(size.width/(menu&&wide?26:20.5),size.height/(menu?17.5:16));cam.updateProjectionMatrix();},[camera,size,phase]);
 useEffect(()=>{activeInput=new KitchenInput(()=>engine.state.phase==='playing'&&!engine.state.paused,()=>{if(engine.state.phase==='playing')engine.pause(!engine.state.paused);});const visibility=()=>{if(document.hidden){activeInput?.clear();engine.pause(true);}};const blur=()=>{activeInput?.clear();engine.pause(true);};document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur);return()=>{activeInput?.dispose();activeInput=null;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur);};},[]);
 useFrame((_,dt)=>{camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,camera.up).normalize();const inputs=activeInput?.read()??[];engine.update(dt,inputs,{rx:right.x,rz:right.z,fx:forward.x,fz:forward.z});},-2);
 return null;
}
function LoadingModels(){
 const [loading,setLoading]=useState<{active:boolean;progress:number}>({active:true,progress:0});
 useEffect(()=>{const timer=window.setInterval(()=>{const {active,progress}=useProgress.getState();setLoading({active,progress});},300);return()=>window.clearInterval(timer);},[]);
 return loading.active?<div role="status" className="pointer-events-none fixed bottom-[24%] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-xl bg-ink/90 px-5 py-3 text-sm font-bold text-paper shadow-xl">Setting the tables… {Math.round(loading.progress)}%</div>:null;
}
function Confetti({active}:{active:boolean}) {
 const ref=useRef<THREE.InstancedMesh>(null);const dummy=useMemo(()=>new THREE.Object3D(),[]);const colors=useMemo(()=>['#ed7753','#ffc351','#5aac98','#fff2d7'],[]);
 useEffect(()=>{if(ref.current)for(let i=0;i<40;i++)ref.current.setColorAt(i,new THREE.Color(colors[i%4]));},[colors]);
 useFrame(({clock})=>{if(!active||!ref.current)return;for(let i=0;i<40;i++){dummy.position.set(Math.sin(i*43)*7,6-((clock.elapsedTime*.6+i*.17)%6),Math.cos(i*23)*4);dummy.rotation.set(clock.elapsedTime+i,i,clock.elapsedTime*.5);dummy.scale.set(.08,.03,.13);dummy.updateMatrix();ref.current.setMatrixAt(i,dummy.matrix);}ref.current.instanceMatrix.needsUpdate=true;});
 return <instancedMesh ref={ref} args={[undefined,undefined,40]} visible={active&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches}><boxGeometry/><meshStandardMaterial/></instancedMesh>;
}
export default function KitchenScene({state}:{state:GameState}) {
 const [lost,setLost]=useState<boolean>(false);const playing=state.phase==='playing';
 return <GraphicsBoundary><Canvas orthographic shadows dpr={[1,1.5]} camera={{position:[0,18,18],zoom:45,near:.1,far:160}} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.localClippingEnabled=true;gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.1;gl.shadowMap.type=THREE.PCFSoftShadowMap;gl.domElement.addEventListener('webglcontextlost',(event)=>{event.preventDefault();setLost(true);engine.pause(true);});}}>
 <Sky/><fog attach="fog" args={['#e4b395',35,85]}/><ambientLight intensity={.65} color="#ffecdb"/><hemisphereLight args={['#ffe6c5','#576a49',1.1]}/><directionalLight position={[-8,15,-9]} intensity={2.5} color="#ffd499" castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-15} shadow-camera-right={15} shadow-camera-top={15} shadow-camera-bottom={-15} shadow-radius={3} shadow-normalBias={.035} shadow-bias={-.00015}/><directionalLight position={[4,8,12]} intensity={.6} color="#b9d8e0"/>
 <CameraAndSimulation phase={state.phase}/><Rooftop/>{state.stations.map(st=><StationView key={`${state.level}-${st.id}`} station={st} playing={playing}/>)}<ChefView id={0} playing={playing}/>{(!playing||state.mode==='coop')&&<ChefView id={1} playing={playing}/>}
 <ActionEffects/><ServiceRewards/><Diners phase={state.phase}/>
 <Confetti active={state.phase==='results'&&(state.results?.stars??0)>0}/>
 </Canvas><LoadingModels/>{lost&&<div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/80"><div className="paper max-w-sm p-6 text-center"><h2 className="text-2xl">Graphics paused</h2><p className="my-4">The browser reset its graphics connection. Reload to reopen the rooftop.</p><button className="game-button mx-auto" onClick={()=>window.location.reload()}>Reload kitchen</button></div></div>}</GraphicsBoundary>;
}
