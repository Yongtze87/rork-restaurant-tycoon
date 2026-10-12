import { memo, Suspense, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from '@/game/engine';
import { LABELS } from '@/game/config';
import { MODELS } from '@/game/assets';
import type { Ingredient, Station } from '@/game/types';
import { Box, Cylinder } from './Primitives';
import { Food } from './Food';
import { GeneratedProp } from './GeneratedModel';
import { GrillProgress } from '@/components/GrillProgress';
import { isVegetable } from '@/game/chopping';
import { BoardVegetable, ChoppingKnife } from './ChoppingBoard';

function Steam({fire=false,water=false}:{fire?:boolean;water?:boolean}) {
 const ref=useRef<THREE.Group>(null);
 useFrame(({clock})=>{if(!ref.current)return;const t=clock.elapsedTime;ref.current.children.forEach((child,i)=>{const life=(t*(fire?1.3:.6)+i*.23)%1;child.position.y=life*(fire?1.4:1);child.position.x=Math.sin(i*4+t)*.2;child.position.z=Math.cos(i*3+t)*.15;child.scale.setScalar(fire?.16+Math.sin(life*Math.PI)*.2:.035+life*.12);});});
 return <group ref={ref}>{Array.from({length:5},(_,i)=><mesh key={i}><sphereGeometry args={[1,8,6]}/>{fire?<meshStandardMaterial color={i%2?'#ffca42':'#ff7428'} emissive={i%2?'#ffb523':'#ee5323'} emissiveIntensity={1.5}/>:<meshBasicMaterial color={water?'#b7e5ef':'#fff3db'} transparent opacity={.25}/>}</mesh>)}</group>;
}
const StationBase=memo(function StationBase({station,highlighted}:{station:Station;highlighted:boolean}) {
 const {kind}=station;const ingredient=['lettuce','tomato','patty','bun'].includes(kind);
 if(kind==='grill'&&MODELS.grill)return <Suspense fallback={<Box position={[0,.65,0]} size={[1.45,1.3,1.45]} color="#3c4942"/>}><GeneratedProp asset={MODELS.grill} size={1.42}/></Suspense>;
 return <><Box position={[0,.64,0]} size={[1.49,1.19,1.49]} color={ingredient?'#ad7949':kind==='trash'?'#657364':'#326b5c'}/><Box position={[0,1.3,0]} size={[1.57,.16,1.57]} color="#f1d29a"/><Box position={[0,.64,.76]} size={[1.3,.91,.055]} color={ingredient?'#c99156':'#396f60'}/><Box position={[0,.98,.8]} size={[.32,.045,.07]} color="#dfbb79"/>
 {ingredient&&<><Box position={[0,1.4,0]} size={[1.34,.08,1.25]} color="#645e46"/>{[-.32,.32].flatMap(x=>[-.3,.3].map(z=><group key={`${x}-${z}`} position={[x,1.44,z]}><Food item={{kind:kind as Ingredient,state:'raw'}} highlighted={highlighted}/></group>))}</>}
 {kind==='board'&&<Box position={[0,1.42,0]} size={[1.1,.09,1.05]} color="#bd874b"/>}
 {kind==='grill'&&<><Box position={[0,1.43,0]} size={[1.34,.13,1.34]} color="#323c38"/>{[-.5,-.3,-.1,.1,.3,.5].map(x=><Box key={x} position={[x,1.52,0]} size={[.055,.065,1.15]} color="#78847b"/>)}</>}
 {kind==='sink'&&<><Box position={[0,1.405,0]} size={[1.3,.055,1.22]} color="#758e89"/><Box position={[0,1.44,.05]} size={[1.04,.04,.9]} color="#497e80"/><Cylinder position={[.4,1.73,-.48]} radius={.055} height={.58} color="#bcc5b3"/><Box position={[.27,2.03,-.48]} size={[.32,.075,.075]} color="#bbc5b6"/></>}
 {kind==='trash'&&<Box position={[0,1.42,0]} size={[.95,.045,.92]} color="#253e36"/>}
 {kind==='extinguisher'&&<group position={[0,1.4,0]} scale={1.4}><Food item={{kind:'extinguisher'}}/></group>}
 {kind==='serve'&&<><Box position={[0,1.45,0]} size={[1.35,.1,1.3]} color="#ddb87d"/><Cylinder position={[.45,1.63,-.45]} radius={.18} height={.12} color="#efc566"/></>}
 </>;
});
export function StationView({station,playing}:{station:Station;playing:boolean}) {
 const selected=playing&&engine.state.chefs.some(c=>c.near===station.id&&(c.id===0||engine.state.mode==='coop'));
 const highlighted=playing&&engine.isIngredientSelectable(station);
 const plateCount=station.kind==='plates'?engine.state.plates:station.kind==='dirty'?engine.state.dirty:0;
 const foodSurface=['lettuce','tomato','patty','bun','board','counter','grill'].includes(station.kind);
 const label=!foodSurface&&(selected||['serve','plates','dirty','sink','extinguisher'].includes(station.kind));
 return <group name={`station-${station.id}`} position={[station.x,0,station.z]}><StationBase station={station} highlighted={highlighted}/>
 {selected&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.11,0]}><ringGeometry args={[.95,1.08,4,1,Math.PI/4]}/><meshBasicMaterial color="#ffcf64" transparent opacity={.9} side={THREE.DoubleSide}/></mesh>}
 {station.kind==='board'&&<ChoppingKnife station={station}/>}
 {station.item&&(station.kind==='board'&&isVegetable(station.item)?<BoardVegetable key={station.item.kind} station={station} kind={station.item.kind} highlighted={highlighted}/>:<group position={[0,station.kind==='grill'?1.48:1.5,0]}><Food item={station.item} highlighted={highlighted}/></group>)}
 {Array.from({length:Math.min(6,plateCount)},(_,i)=><group key={i} position={[0,1.4+i*.065,0]}><Food item={station.kind==='dirty'?{kind:'dirty'}:{kind:'plate',parts:[]}}/></group>)}
 {station.kind==='grill'&&station.item&&station.heat>0&&<group position={[0,1.56,0]}><Steam fire={station.fire>0}/></group>}
 {station.kind==='sink'&&station.progress>0&&<group position={[0,1.6,0]}><Steam water/></group>}
 {playing&&label&&<Html center position={[0,1.95,0]} zIndexRange={[12,0]} className="pointer-events-none"><div className={`station-label ${selected?'!border-gold !bg-paper':''}`}>{station.fire>0?'FIRE!':LABELS[station.kind]}{station.kind==='plates'||station.kind==='dirty'?` · ${plateCount}`:''}{selected&&<span className="ml-1.5 rounded bg-ink px-1 text-paper">{engine.state.chefs[0].near===station.id?'E':'K'}</span>}</div></Html>}
 {selected&&foodSurface&&<Html center position={[0,.75,.85]} zIndexRange={[12,0]} pointerEvents="none"><kbd aria-label={`${LABELS[station.kind]}: press ${engine.state.chefs[0].near===station.id?'E':'K'} to pick up or place`} className="flex size-6 items-center justify-center rounded-md border border-gold/70 bg-ink/90 font-body text-xs font-extrabold text-paper shadow-sm">{engine.state.chefs[0].near===station.id?'E':'K'}</kbd></Html>}
 {playing&&station.kind==='grill'&&station.item?.kind==='patty'&&<Html center position={[0,2.9,0]} zIndexRange={[13,0]} pointerEvents="none"><GrillProgress station={station}/></Html>}
 {playing&&station.kind!=='grill'&&station.progress>0&&<Html center position={station.kind==='board'?[0,.25,.95]:[0,2.3,0]} zIndexRange={[13,0]} pointerEvents="none"><div className={station.kind==='board'?'w-14 rounded-full bg-ink/90 p-1 shadow-sm':'w-20 rounded bg-ink/90 p-1'}><progress className={station.kind==='board'?'block h-1.5':'h-2'} value={station.progress} max={1} aria-label={`${LABELS[station.kind]} progress`}/>{station.kind!=='board'&&<p className="text-center text-[9px] font-bold text-paper">WORKING</p>}</div></Html>}
 </group>;
}
