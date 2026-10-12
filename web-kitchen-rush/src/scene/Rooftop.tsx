import { memo, useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { Batch, Box, Cylinder, Sphere, type InstanceSpec } from './Primitives';
import { DINING_TABLES } from '@/game/dining-layout';

function seeded(i:number):number { const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x); }
const foliage=['#506f2b','#6a8a37','#7c9840','#365c2d','#98a949'];
const Floor = memo(function Floor(){
 const items=useMemo(()=>{const tiles:InstanceSpec[]=[];for(let x=-9;x<=9;x++)for(let z=-8;z<=6;z++){const edge=(Math.abs(x)===7&&z>=-4&&z<=4)||(Math.abs(z)===4&&Math.abs(x)<=7);tiles.push({position:[x,.015,z],scale:[.965,.08,.965],color:edge?'#eed4a1':['#be7651','#c88255','#c17a4c','#b9724a'][Math.floor(seeded(x*31+z)*4)]});if(edge)tiles.push({position:[x,.065,z],scale:[.35,.012,.35],rotation:[0,Math.PI/4,0],color:'#ba6c48'});}return tiles;},[]);
 return <><Box position={[0,-.22,-1]} size={[19.8,.45,16]} color="#976349"/><Batch items={items}/></>;
});
const Plant = memo(function Plant({x,z,size=1}:{x:number;z:number;size?:number}) {
 const leaves=useMemo(()=>Array.from({length:13},(_,i):InstanceSpec=>{const a=i*2.4;const r=.25+(i%3)*.13;return {position:[Math.cos(a)*r,1+(i%4)*.16,Math.sin(a)*r],scale:[.18,.46,.15],rotation:[Math.cos(a)*.7,a,Math.sin(a)*.7],color:foliage[i%foliage.length]};}),[]);
 return <group position={[x,0,z]} scale={size}><Cylinder position={[0,.34,0]} radius={.43} bottom={.3} height={.68} color="#b06437"/><Cylinder position={[0,.66,0]} radius={.48} height={.12} color="#d18b54"/><Cylinder position={[0,.74,0]} radius={.38} height={.015} color="#57442b"/><Cylinder position={[0,.95,0]} radius={.05} height={.65} color="#556236"/><Batch items={leaves} shape="sphere"/></group>;
});
function Table({x,z,umbrella=false}:{x:number;z:number;umbrella?:boolean}) {
 const cloth:InstanceSpec[]=useMemo(()=>Array.from({length:36},(_,i)=>({position:[(i%6)*.3-.75,1.07,Math.floor(i/6)*.3-.75],scale:[.3,.035,.3],color:(i+Math.floor(i/6))%2===0?'#fbecce':'#d77859'})),[]);
 return <group position={[x,0,z]}><Box position={[0,.96,0]} size={[1.85,.13,1.85]} color="#ead6b0"/><Batch items={cloth}/>{[-.6,.6].map(dx=><Box key={dx} position={[dx,.47,0]} size={[.12,.9,1.4]} color="#634b38"/>)}{[-1.3,1.3].map(dx=><group key={dx} position={[dx,0,0]}><Box position={[0,.55,0]} size={[.62,.15,.7]} color="#8c6245"/><Box position={[dx<0?-.32:.32,1,0]} size={[.1,.82,.7]} color="#98704e"/><Box position={[0,.23,-.22]} size={[.1,.5,.1]} color="#574a38"/><Box position={[0,.23,.22]} size={[.1,.5,.1]} color="#574a38"/></group>)}<Cylinder position={[0,1.22,0]} radius={.09} height={.3} color="#fae9b5"/><mesh position={[0,1.43,0]}><sphereGeometry args={[.055,8,8]}/><meshBasicMaterial color="#ffe79b"/></mesh>{umbrella&&<group position={[0,0,-.82]}><Cylinder position={[0,1.5,0]} radius={.045} height={3} color="#805d43"/>{Array.from({length:10},(_,i)=><mesh key={i} position={[0,2.85,0]}><coneGeometry args={[.28,1.05,1,1,true,i*Math.PI/5,Math.PI/5]}/><meshStandardMaterial color={i%2===0?'#ed9265':'#fff0cc'} side={THREE.DoubleSide}/></mesh>)}</group>}</group>;
}
const Skyline=memo(function Skyline(){
 const buildings=useMemo(()=>{const a:InstanceSpec[]=[];for(let i=0;i<46;i++){const x=(i-23)*1.6;const h=2+seeded(i+73)*6;const z=-25-seeded(i)*8;const c=['#797888','#8b7884','#707485','#958086'][i%4];a.push({position:[x,h/2-1,z],scale:[1+seeded(i+4),h,1.8],color:c});a.push({position:[x,h-.7,z],scale:[.14,1.3,.14],color:c});for(let y=0;y<Math.floor(h);y++)for(let k=0;k<2;k++)if(seeded(i*53+y*3+k)>.35)a.push({position:[x-.32+k*.6,y+.1,z+1],scale:[.16,.25,.04],color:seeded(i+y)>.4?'#e6b78f':'#a59aaa'});}return a;},[]);
 return <><Batch items={buildings}/><mesh position={[5,3,-25]}><sphereGeometry args={[2.2,32,24]}/><meshBasicMaterial color="#fff2b2"/></mesh><mesh rotation={[-Math.PI/2,0,0]} position={[0,-.9,-23]}><planeGeometry args={[160,60]}/><meshStandardMaterial color="#c2958d" roughness={.3} metalness={.25}/></mesh>{Array.from({length:12},(_,i)=><Box key={i} position={[5,-.88,-10-i*1.4]} size={[.7+i*.3,.02,.13]} color="#f2c088"/>)}</>;
});
const StringLights=memo(function StringLights(){
 const lines=useMemo(()=>[-5.8,6].map((z,line)=>Array.from({length:41},(_,i):[number,number,number]=>[-10+i*.5,4.9-Math.sin(i/40*Math.PI)*(line?1.1:.65),z])),[]);
 return <>{lines.map((points,j)=><group key={j}><Line points={points} color="#403e2e" lineWidth={2}/>{points.filter((_,i)=>i%3===0).map((p,i)=><group key={i} position={p}><Cylinder position={[0,-.09,0]} radius={.055} height={.18} color="#4b4c35"/><mesh position={[0,-.23,0]}><sphereGeometry args={[.115,12,10]}/><meshStandardMaterial color="#ffe6a1" emissive="#ffb94c" emissiveIntensity={2}/></mesh></group>)}</group>)}{[-9.5,9.5].flatMap(x=>[-5.8,6].map(z=><Box key={`${x}-${z}`} position={[x,2.3,z]} size={[.14,4.8,.14]} color="#4a5240"/>))}</>;
});
function Blackboard(){
 const texture=useMemo(()=>{const c=document.createElement('canvas');c.width=256;c.height=384;const ctx=c.getContext('2d')!;ctx.fillStyle='#29443b';ctx.fillRect(0,0,256,384);ctx.fillStyle='#eee0b9';ctx.font='500 28px sans-serif';ctx.textAlign='center';['GOOD','FOOD','BRIGHTER','PEOPLE'].forEach((line,i)=>ctx.fillText(line,128,75+i*60));ctx.font='36px serif';ctx.fillText('♡',128,332);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;},[]);
 return <group position={[8.7,1.9,-3.8]} rotation={[0,-.25,0]}><Box size={[1.75,2.7,.18]} color="#956235"/><mesh position={[0,0,.1]}><planeGeometry args={[1.48,2.42]}/><meshStandardMaterial map={texture} roughness={1}/></mesh><Box position={[-.63,-1.7,0]} size={[.11,.9,.15]} color="#956235"/><Box position={[.63,-1.7,0]} size={[.11,.9,.15]} color="#956235"/></group>;
}
export const Rooftop=memo(function Rooftop(){
 const bricks=useMemo(()=>{const a:InstanceSpec[]=[];for(let y=0;y<3;y++)for(let i=0;i<23;i++)a.push({position:[-9.9+i*.9+(y%2)*.45,.2+y*.32,-8.1],scale:[.87,.29,.45],color:['#b77453','#ae694e','#c5845b'][i%3]});return a;},[]);
 return <><Floor/><group position={[0,-12.5,-5]} scale={.65}><Skyline/></group><Batch items={bricks}/><Box position={[0,1.08,-8.1]} size={[21,.18,.68]} color="#dfa878"/><Box position={[-9.9,.55,-.8]} size={[.45,1.1,15]} color="#b77d59"/><Box position={[9.9,.55,-.8]} size={[.45,1.1,15]} color="#b77d59"/><StringLights/>
 {DINING_TABLES.map(table=><Table key={table.id} x={table.x} z={table.z} umbrella={table.id!==2}/>)}
 <group name="guest-entrance" position={[9.1,0,-6.25]}><Box position={[.45,1.4,0]} size={[.4,2.8,1.9]} color="#224F4A"/><Box position={[.22,1.3,0]} size={[.05,2.35,1.32]} color="#233D3B"/><Box position={[0,2.65,0]} size={[.9,.2,2.05]} color="#F2B743"/><Box position={[-.2,.075,0]} size={[1.25,.06,1.5]} color="#F6E7CA"/>{[-.84,.84].map(z=><Box key={z} position={[.1,1.3,z]} size={[.25,2.6,.2]} color="#F0AB70"/>)}</group>
 <group name="guest-waiting-bench" position={[7.6,0,-7.45]}><Box position={[0,.5,0]} size={[1.5,.16,.48]} color="#224F4A"/><Box position={[0,.84,-.24]} size={[1.5,.65,.1]} color="#275A55"/>{[-.55,.55].map(x=><Box key={x} position={[x,.25,0]} size={[.1,.5,.3]} color="#634B38"/>)}</group>
 <Blackboard/>{[[-8,-6],[-3.4,-7.2],[2.4,-7.2],[8.8,-7.6],[-8.5,-2.4],[8.6,-1.7],[-8.5,3.4],[8.4,4.2],[-7,5.6],[7,5.8]].map(([x,z],i)=><Plant key={i} x={x} z={z} size={i<4?1.15:1.3}/>)}
 <Box position={[-8.4,1.7,-4]} size={[1.5,3.4,1.3]} color="#c1c5b5"/><Box position={[-8.4,2.3,-3.32]} size={[1.4,1.8,.06]} color="#d7d8c7"/><Box position={[-7.9,2.2,-3.24]} size={[.08,.65,.08]} color="#68756b"/>
 <Box position={[6.4,2.7,0]} size={[2.1,.2,2.1]} color="#345e51"/><Box position={[7.3,1.65,-.8]} size={[.12,2.4,.12]} color="#466348"/><Box position={[7.3,1.65,.8]} size={[.12,2.4,.12]} color="#466348"/>
 <Sphere position={[7.1,2.87,0]} scale={[.17,.17,.17]} color="#edb745"/>
 </>;
});
