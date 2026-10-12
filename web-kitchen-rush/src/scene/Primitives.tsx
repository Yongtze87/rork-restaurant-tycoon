import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const rounded = new RoundedBoxGeometry(1,1,1,2,.055);
export const Box = memo(function Box({position=[0,0,0],size=[1,1,1],color='#fff2d7',rotation=[0,0,0],roughness=.8,children}:{children?:ReactNode;position?:[number,number,number];size?:[number,number,number];color?:string;rotation?:[number,number,number];roughness?:number}) {
 return <mesh geometry={rounded} position={position} scale={size} rotation={rotation} castShadow receiveShadow><meshStandardMaterial color={color} roughness={roughness}/>{children}</mesh>;
});
export function Sphere({position=[0,0,0],scale=[1,1,1],color='#fff2d7',children}:{children?:ReactNode;position?:[number,number,number];scale?:[number,number,number];color?:string}) {return <mesh position={position} scale={scale} castShadow><sphereGeometry args={[1,16,12]}/><meshStandardMaterial color={color} roughness={.7}/>{children}</mesh>;}
export function Cylinder({position=[0,0,0],radius=.4,height=.1,color='#fff2d7',bottom,children}:{children?:ReactNode;position?:[number,number,number];radius?:number;height?:number;color?:string;bottom?:number}) {return <mesh position={position} castShadow receiveShadow><cylinderGeometry args={[radius,bottom??radius,height,20]}/><meshStandardMaterial color={color} roughness={.7}/>{children}</mesh>;}
export interface InstanceSpec { position:[number,number,number]; scale:[number,number,number]; color:string; rotation?:[number,number,number]; }
/** Repeated environment pieces share one geometry and one draw call. */
export const Batch = memo(function Batch({items,shape='box'}:{items:InstanceSpec[];shape?:'box'|'sphere'}) {
 const ref=useRef<THREE.InstancedMesh>(null);
 const geometry=useMemo(()=>shape==='box'?new THREE.BoxGeometry(1,1,1):new THREE.SphereGeometry(1,10,8),[shape]);
 useLayoutEffect(()=>{if(!ref.current)return;const dummy=new THREE.Object3D();items.forEach((item,i)=>{dummy.position.set(...item.position);dummy.scale.set(...item.scale);dummy.rotation.set(...(item.rotation??[0,0,0]));dummy.updateMatrix();ref.current!.setMatrixAt(i,dummy.matrix);ref.current!.setColorAt(i,new THREE.Color(item.color));});ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();},[items]);
 return <instancedMesh ref={ref} args={[geometry,undefined,items.length]} castShadow receiveShadow><meshStandardMaterial roughness={.85}/></instancedMesh>;
});
