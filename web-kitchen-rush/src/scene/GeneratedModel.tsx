import { Fragment, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { createPortal } from '@react-three/fiber';
import { IngredientOutline } from './IngredientOutline';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { ModelAsset } from '@/game/assets';

const AXES:Record<string,THREE.Vector3>={positiveX:new THREE.Vector3(1,0,0),negativeX:new THREE.Vector3(-1,0,0),positiveY:new THREE.Vector3(0,1,0),negativeY:new THREE.Vector3(0,-1,0),positiveZ:new THREE.Vector3(0,0,1),negativeZ:new THREE.Vector3(0,0,-1)};
/** Skinned-aware bounds avoid the armature's centimetre-scale bounding-box trap. */
export function measureModel(object:THREE.Object3D):THREE.Box3 {
 object.updateMatrixWorld(true);const inverse=object.matrixWorld.clone().invert();const box=new THREE.Box3();
 object.traverse(node=>{const mesh=node as THREE.Mesh;if(!mesh.isMesh||!mesh.geometry)return;const skin=node as THREE.SkinnedMesh;let b:THREE.Box3;if(skin.isSkinnedMesh){skin.skeleton.update();skin.computeBoundingBox();b=skin.boundingBox!.clone();}else{mesh.geometry.computeBoundingBox();b=mesh.geometry.boundingBox!.clone();}box.union(b.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)));});
 return box;
}
export function normalizeModel(scene:THREE.Object3D,asset:ModelAsset,size:number,dimension:'height'|'width') {
 const clone=SkeletonUtils.clone(scene);
 clone.traverse(node=>{const mesh=node as THREE.Mesh;if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=!(mesh as THREE.SkinnedMesh).isSkinnedMesh;
   const studioMaterial=(original:THREE.Material)=>{const source=original as THREE.MeshStandardMaterial;return new THREE.MeshStandardMaterial({map:source.map??null,color:source.color??new THREE.Color('white'),roughness:.82,metalness:.02,side:THREE.FrontSide});};
   mesh.material=Array.isArray(mesh.material)?mesh.material.map(studioMaterial):studioMaterial(mesh.material);
 }});
 const q=new THREE.Quaternion();
 if(asset.front){const f=AXES[asset.front],u=AXES[asset.up??'positiveY'];const r=new THREE.Vector3().crossVectors(u,f).normalize();const actualUp=new THREE.Vector3().crossVectors(f,r).normalize();q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r,actualUp,f)).invert();}
 const box=measureModel(clone).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
 const extent=box.getSize(new THREE.Vector3());const scale=size/(dimension==='height'?extent.y:Math.max(extent.x,extent.z));
 const center=box.getCenter(new THREE.Vector3());
 return {clone,q,scale,position:[-center.x*scale,-box.min.y*scale,-center.z*scale] as [number,number,number]};
}
export function GeneratedProp({asset,size,dimension='height',highlighted=false}:{asset:ModelAsset;size:number;dimension?:'height'|'width';highlighted?:boolean}) {
 const {scene}=useGLTF(asset.url);const n=useMemo(()=>normalizeModel(scene,asset,size,dimension),[scene,asset,size,dimension]);
 const meshes=useMemo(()=>{const result:THREE.Mesh[]=[];n.clone.traverse(node=>{if((node as THREE.Mesh).isMesh)result.push(node as THREE.Mesh);});return result;},[n]);
 useEffect(()=>()=>{const owned=new Set<THREE.Material>();meshes.forEach(mesh=>(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(material=>owned.add(material)));owned.forEach(material=>material.dispose());},[meshes]);
 return <group><group name="generated_model_runtime"><group position={n.position} quaternion={n.q} scale={n.scale}><primitive object={n.clone} dispose={null}/>{highlighted&&meshes.map(mesh=><Fragment key={mesh.uuid}>{createPortal(<IngredientOutline/>,mesh)}</Fragment>)}</group></group></group>;
}
