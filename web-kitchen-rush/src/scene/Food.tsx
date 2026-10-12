import { Suspense } from 'react';
import { MODELS } from '@/game/assets';
import { recipeFor } from '@/game/config';
import type { FoodState, Ingredient, Item } from '@/game/types';
import { isVegetable } from '@/game/chopping';
import { CutVegetable } from './CutVegetable';
import { Box, Cylinder, Sphere } from './Primitives';
import { GeneratedProp } from './GeneratedModel';
import { IngredientOutline } from './IngredientOutline';

export function Food({item,highlighted=false}:{item:Item;highlighted?:boolean}) {
 if(isVegetable(item)&&item.state==='chopped')return <CutVegetable kind={item.kind} highlighted={highlighted}/>;
 const recipe=recipeFor(item);
 const modelKey=recipe??(item.kind==='tomato'||item.kind==='lettuce'?item.kind:null);
 if(modelKey&&MODELS[modelKey])return <Suspense fallback={<SimpleFood item={item} highlighted={highlighted}/>}><GeneratedProp asset={MODELS[modelKey]} size={recipe ? .8 : .55} dimension="width" highlighted={highlighted}/></Suspense>;
 return <SimpleFood item={item} highlighted={highlighted}/>;
}
export function SimpleFood({item,highlighted=false}:{item:Item;highlighted?:boolean}) {
 if(isVegetable(item)&&item.state==='chopped')return <CutVegetable kind={item.kind} highlighted={highlighted}/>;
 const outline=highlighted?<IngredientOutline/>:null;
 if(item.kind==='extinguisher')return <group><Cylinder radius={.14} height={.5} position={[0,.25,0]} color="#d84c34"/><Box position={[0,.53,0]} size={[.25,.07,.1]} color="#303e37"/><Box position={[0,.3,.145]} size={[.17,.2,.025]} color="#fff2d7"/></group>;
 if(item.kind==='plate'||item.kind==='dirty')return <group><Cylinder radius={.43} height={.05}/><Cylinder position={[0,.035,0]} radius={.34} height={.025} color={item.kind==='dirty'?'#ac9b74':'#eee6d2'}/>{item.kind==='plate'&&item.parts.map((p,i)=><group position={[(i%2-.5)*.28,.06+Math.floor(i/2)*.07,Math.floor(i/2)*.2-.1]} scale={.56} key={p}><SimpleFood item={{kind:p.split(':')[0] as Ingredient,state:p.split(':')[1] as FoodState}}/></group>)}</group>;
 if(item.kind==='bun')return <Sphere position={[0,.16,0]} scale={[.3,.18,.3]} color="#eeb254">{outline}</Sphere>;
 if(item.kind==='patty')return <Cylinder position={[0,.07,0]} radius={.3} height={.13} color={item.state==='raw'?'#cf6552':item.state==='burnt'?'#2e2923':'#70412a'}>{outline}</Cylinder>;
 if(item.kind==='tomato')return <group><Sphere position={[0,.2,0]} scale={[.25,.22,.25]} color="#e65d38">{outline}</Sphere><Box position={[0,.43,0]} size={[.08,.09,.08]} color="#637c2d">{outline}</Box></group>;
 return <group>{[0,1,2,3,4].map(i=><Sphere key={i} position={[Math.sin(i*2.4)*.13,.13,Math.cos(i*2.4)*.13]} scale={[.18,.18,.18]} color={i%2?'#76a63e':'#8fbb44'}>{outline}</Sphere>)}</group>;
}
