import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KitchenEngine } from '../game/engine';
import { makeStations, recipeFor, RECIPES, starsFor } from '../game/config';
import { loadProgress } from '../game/storage';
import type { Ingredient, PlayerInput, Station, StationKind } from '../game/types';

let game:KitchenEngine;
const none:PlayerInput={x:0,y:0,pick:false,work:false,dash:false};
const storage=new Map<string,string>();
beforeEach(()=>{storage.clear();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});game=new KitchenEngine();game.start();});
function station(kind:StationKind):Station{return game.state.stations.find(s=>s.kind===kind)!;}
function tick(seconds:number,input:PlayerInput=none,id=0):void {for(let i=0;i<Math.ceil(seconds/.02);i++)game.update(.02,id===0?[input,none]:[none,input]);}
function workAt(st:Station,seconds:number,id=0):void {const c=game.state.chefs[id];c.x=st.x;c.z=st.z+1.25;c.facing=Math.PI;tick(seconds,{...none,work:true},id);}
function addPrepared(kind:Ingredient,id=0):void{
 const chef=game.state.chefs[id];game.interact(chef,station(kind));
 if(kind==='lettuce'||kind==='tomato'){game.interact(chef,station('board'));workAt(station('board'),2,id);game.interact(chef,station('board'));}
 if(kind==='patty'){game.interact(chef,station('grill'));tick(5.2);game.interact(chef,station('grill'));}
 game.interact(chef,station('counter'));
}
function cook(recipe:'salad'|'burger',id=0):void {
 const chef=game.state.chefs[id];addPrepared('lettuce',id);game.interact(chef,station('plates'));game.interact(chef,station('counter'));game.interact(chef,station('counter'));
 addPrepared('tomato',id);
 if(recipe==='burger'){addPrepared('bun',id);addPrepared('patty',id);}
 game.interact(chef,station('counter'));expect(recipeFor(chef.held)).toBe(recipe);game.interact(chef,station('serve'));
}
describe('complete cooking journeys',()=>{
 for(const mode of ['solo','coop'] as const)it(`${mode}: salad and burger, dirty return, washing, reusable plate`,()=>{
  game.select(0,mode);game.start();const id=mode==='coop'?1:0;cook('salad',id);cook('burger',id);expect(game.state.served).toBe(2);expect(game.state.score).toBeGreaterThan(130);tick(8);expect(game.state.dirty).toBe(2);
  const chef=game.state.chefs[id];game.interact(chef,station('dirty'));game.interact(chef,station('sink'));workAt(station('sink'),2.7,id);game.interact(chef,station('sink'));expect(chef.held).toEqual({kind:'plate',parts:[]});const before=game.state.plates;game.interact(chef,station('plates'));expect(game.state.plates).toBe(before+1);
 });
 it('raw vegetables do not complete a plate and wrong orders cannot be served',()=>{const c=game.state.chefs[0];c.held={kind:'tomato',state:'raw'};station('counter').item={kind:'plate',parts:[]};game.interact(c,station('counter'));expect(c.held.kind).toBe('tomato');c.held={kind:'plate',parts:['bun:raw']};game.interact(c,station('serve'));expect(game.state.served).toBe(0);expect(c.held).not.toBeNull();});
 it('grill cooks, burns, ignites, extinguishes and becomes reusable',()=>{const c=game.state.chefs[0];game.interact(c,station('patty'));game.interact(c,station('grill'));tick(5.1);expect(station('grill').item).toEqual({kind:'patty',state:'cooked'});tick(10);expect(station('grill').item).toEqual({kind:'patty',state:'burnt'});tick(6.1);expect(station('grill').fire).toBe(1);game.interact(c,station('extinguisher'));workAt(station('grill'),2.2);expect(station('grill').fire).toBe(0);game.interact(c,station('extinguisher'));game.interact(c,station('grill'));game.interact(c,station('trash'));expect(c.held).toBeNull();game.interact(c,station('patty'));game.interact(c,station('grill'));tick(5.2);expect(station('grill').item).toEqual({kind:'patty',state:'cooked'});});
 it('discarding a plated dish recovers the limited clean plate',()=>{const c=game.state.chefs[0];const before=game.state.plates;game.interact(c,station('plates'));game.interact(c,station('trash'));expect(game.state.plates).toBe(before);});
});
describe('ingredient selection cues',()=>{
 function target(kind:StationKind,id=0):Station {
  const st=station(kind);const chef=game.state.chefs[id];
  chef.x=st.x;chef.z=st.z+(st.z>0?1.05:1.25);chef.facing=Math.PI;
  expect(game.canMove(chef.x,chef.z)).toBe(true);
  game.update(0,[]);expect(chef.near).toBe(st.id);return st;
 }
 it('only marks the targeted ingredient supply, then clears on pickup or walking away',()=>{
  const st=target('tomato');expect(game.isIngredientSelectable(st)).toBe(true);
  expect(game.isIngredientSelectable(station('lettuce'))).toBe(false);
  game.interact(game.state.chefs[0],st);expect(game.isIngredientSelectable(st)).toBe(false);
  game.state.chefs[0].held=null;target('bun');expect(game.isIngredientSelectable(st)).toBe(false);
 });
 it('supports every ingredient supply in all three layouts',()=>{
  for(let level=0;level<3;level++){
   game.state.level=level;game.start();
   for(const kind of ['lettuce','tomato','patty','bun'] as const)expect(game.isIngredientSelectable(target(kind))).toBe(true);
  }
 });
 it('marks loose prepared ingredients but not empty stations, plates, or tools',()=>{
  const st=target('board');expect(game.isIngredientSelectable(st)).toBe(false);
  st.item={kind:'tomato',state:'chopped'};expect(game.isIngredientSelectable(st)).toBe(true);
  game.interact(game.state.chefs[0],st);expect(game.isIngredientSelectable(st)).toBe(false);
  game.state.chefs[0].held=null;st.item={kind:'plate',parts:['tomato:chopped']};expect(game.isIngredientSelectable(st)).toBe(false);
  st.item={kind:'extinguisher'};expect(game.isIngredientSelectable(st)).toBe(false);
  expect(game.isIngredientSelectable(target('plates'))).toBe(false);
 });
 it('allows compatible plate collection without highlighting duplicate or raw additions',()=>{
  const st=target('board');const chef=game.state.chefs[0];chef.held={kind:'plate',parts:[]};
  st.item={kind:'tomato',state:'raw'};expect(game.isIngredientSelectable(st)).toBe(false);
  st.item.state='chopped';expect(game.isIngredientSelectable(st)).toBe(true);
  game.interact(chef,st);expect(st.item).toBeNull();expect(game.isIngredientSelectable(st)).toBe(false);
  st.item={kind:'tomato',state:'chopped'};expect(game.isIngredientSelectable(st)).toBe(false);
  expect(game.isIngredientSelectable(target('tomato'))).toBe(false);
 });
 it('suppresses fire-blocked ingredients, then permits clearing burnt food after extinguishing',()=>{
  const st=target('grill');st.item={kind:'patty',state:'cooked'};expect(game.isIngredientSelectable(st)).toBe(true);
  st.item.state='burnt';st.fire=1;expect(game.isIngredientSelectable(st)).toBe(false);
  st.fire=0;expect(game.isIngredientSelectable(st)).toBe(true);
 });
 it('suppresses pickup cues while paused and outside gameplay',()=>{
  const st=target('lettuce');game.pause(true);expect(game.isIngredientSelectable(st)).toBe(false);
  game.pause(false);expect(game.isIngredientSelectable(st)).toBe(true);
  for(const phase of ['menu','briefing','results'] as const){game.setPhase(phase);expect(game.isIngredientSelectable(st)).toBe(false);}
 });
 it('supports independent co-op targets without using the inactive solo chef',()=>{
  const second=station('bun');game.state.chefs[1].near=second.id;
  expect(game.isIngredientSelectable(second)).toBe(false);
  game.select(0,'coop');game.start();const first=target('tomato');const other=target('bun',1);
  expect(game.isIngredientSelectable(first)).toBe(true);expect(game.isIngredientSelectable(other)).toBe(true);
  game.interact(game.state.chefs[0],first);expect(game.isIngredientSelectable(first)).toBe(false);
  expect(game.isIngredientSelectable(other)).toBe(true);
 });
});
describe('simulation reliability',()=>{
 it('moves both players simultaneously and camera-relative left is left',()=>{game.select(0,'coop');game.start();const before=game.state.chefs.map(c=>c.x);game.update(.05,[{...none,x:1},{...none,x:-1}]);expect(game.state.chefs[0].x).toBeGreaterThan(before[0]);expect(game.state.chefs[1].x).toBeLessThan(before[1]);});
 it('dashes never tunnel through a station',()=>{const c=game.state.chefs[0];const st=station('board');c.x=st.x;c.z=st.z+1.1;tick(1,{...none,y:1,dash:true});expect(c.z).toBeGreaterThanOrEqual(st.z+1.04);});
 it('pause freezes cooking, orders, movement and countdown',()=>{station('grill').item={kind:'patty',state:'raw'};const before=JSON.stringify(game.state);game.pause(true);const paused=JSON.stringify(game.state);tick(5,{...none,x:1});expect(JSON.stringify(game.state)).toBe(paused);expect(paused).not.toBe(before);game.pause(false);tick(1);expect(game.state.time).toBeLessThan(180);});
 it('practice has no order expiry, timer or progression writes',()=>{game.start(true);tick(190);expect(game.state.time).toBe(180);expect(game.state.orders.length).toBe(1);expect(game.state.phase).toBe('playing');expect(storage.size).toBe(0);});
 it('misses apply exact penalties and reset a delivery streak',()=>{game.state.combo=3;game.state.orders[0].remaining=.01;tick(.02);expect(game.state.combo).toBe(0);expect(game.state.penalties).toBe(20);expect(game.state.score).toBe(-20);});
 it('saves bests by mode, unlocks next layout, and never downgrades a best',()=>{game.state.orderPoints=300;game.state.score=300;game.finish();expect(game.state.results?.newBest).toBe(true);expect(game.unlocked(1)).toBe(true);expect(game.unlocked(1,'coop')).toBe(false);expect(loadProgress().solo[0]).toBe(300);game.start();game.state.score=10;game.finish();expect(loadProgress().solo[0]).toBe(300);expect(game.state.results?.newBest).toBe(false);});
 it('ends once at 180 seconds and score breakdown reconciles',()=>{cook('salad');tick(181);expect(game.state.phase).toBe('results');const r=game.state.results!;expect(r.score).toBe(r.orderPoints+r.tips-r.penalties);expect(r.stars).toBe(starsFor(r.score,r.level,r.mode));});
 it('every level keeps essential stations and unique identities',()=>{for(let level=0;level<3;level++){const sts=makeStations(level);expect(new Set(sts.map(s=>s.id)).size).toBe(sts.length);for(const kind of ['sink','plates','dirty','serve','extinguisher','trash','board','grill'])expect(sts.some(s=>s.kind===kind)).toBe(true);}});
 it('rejects malformed persisted scores',()=>{storage.set('kitchen-rush-progress-v1','{"solo":["bad",null,-2],"coop":[]}');expect(loadProgress()).toEqual({solo:[0,0,0],coop:[0,0,0]});});
 it('burger recipe includes exactly the approved ingredients',()=>{expect(RECIPES.burger.parts).toEqual(['lettuce:chopped','tomato:chopped','patty:cooked','bun:raw']);});
});
