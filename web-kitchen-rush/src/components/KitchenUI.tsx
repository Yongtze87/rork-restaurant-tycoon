import { ArrowLeft, ArrowRight, ChefHat, CircleHelp, Clock3, Coins, Flame, Home, Keyboard, LockKeyhole, Music2, Pause, Play, RotateCcw, Settings2, ShieldCheck, Sparkles, Star, Timer, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { engine } from '@/game/engine';
import { DASH_COOLDOWN_SECONDS, itemLabel, MAX_ACTIVE_ORDERS, PRACTICE_STEPS, RECIPES, SHIFTS, starsFor, targets } from '@/game/config';
import type { GameState, Mode } from '@/game/types';
import { DishArt, Key, KitchenMap, Stars, Wordmark } from './GameBits';
import { DashStatus } from './DashStatus';
import { ShareScore } from './ShareScore';
import { RecipeIngredients } from './RecipeIngredients';
import { ChefWardrobe } from './ChefWardrobe';
import { MenuBoard } from './MenuBoard';
import { HighScoreCard } from './HighScoreCard';

interface ScreenProps { state: GameState; go: (path: string) => void; start: (practice?: boolean) => void; }
export function HomeScreen({ state, go, start }: ScreenProps) {
  return <main className="pointer-events-none relative flex min-h-[100svh] flex-col justify-between px-5 pb-6 pt-24 sm:px-8 md:h-[100svh] md:min-h-[690px] md:pb-6 md:pt-[12vh] lg:px-12">
    <section className="pointer-events-auto w-[min(330px,90vw)] pb-5">
      <h1 className="mb-5"><Wordmark /></h1>
      <p className="mb-5 w-fit -rotate-2 rounded-lg bg-paper px-4 py-2 font-display text-lg font-semibold shadow-lg md:text-xl">Good food. Great chaos.</p>
      <HighScoreCard progress={state.progress} mode={state.mode} className="mb-5 md:absolute md:right-8 md:top-28 md:mb-0 md:w-72 lg:right-12" />
      <div role="radiogroup" aria-label="Play mode" className="space-y-2">
        {(['solo','coop'] as Mode[]).map(mode => <button key={mode} role="radio" aria-checked={state.mode === mode} onClick={() => engine.select(state.level, mode)} className="mode-option"><ChefHat className={cn('size-8',mode === 'solo' ? 'fill-tomato/25 text-tomato' : 'fill-[#3b9c98]/25 text-[#33817b]')}/>{mode === 'solo' ? 'Solo' : 'Couch co-op'}<span className="radio-dot" /></button>)}
      </div>
      <button className="game-button game-button-primary mt-4 w-full py-3 text-3xl md:py-3.5 md:text-3xl" onClick={() => go('/briefing')}>Let’s cook <Play className="ml-auto size-8 fill-current" /></button>
      <div className="mt-3 grid grid-cols-2 gap-3"><button className="game-button gap-2 px-3 py-2.5 text-lg" onClick={() => start(true)}><ChefHat className="size-5 shrink-0"/><span>Practice<span className="block font-body text-[10px] font-bold leading-tight opacity-60">No timer</span></span></button><ChefWardrobe className="gap-2 px-3 text-base [&>span]:hidden" /></div>
    </section>
    <section className="pointer-events-auto w-full" aria-label="Choose your shift">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-paper"><h2 className="text-sm font-medium tracking-[.2em] drop-shadow-md">YOUR ROOFTOP. YOUR RUSH.</h2>{!state.progressSaveFailed && <span className="flex items-center gap-1.5 text-xs font-bold text-paper/85"><ShieldCheck aria-hidden="true" className="size-3.5"/>High scores saved on this browser</span>}</div>
      {state.progressSaveFailed && <ProgressSaveNotice />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SHIFTS.map((shift,i) => { const unlocked = engine.unlocked(i); const best = state.progress[state.mode][i]; return <button key={shift.name} onClick={() => engine.select(i,state.mode)} disabled={!unlocked} aria-pressed={state.level === i} aria-label={`${shift.name}${!unlocked ? `, earn one star in ${SHIFTS[i-1].name} to unlock` : ''}`} className={cn('paper group flex min-h-28 overflow-hidden p-2.5 text-left transition md:min-h-32', state.level === i ? 'border-gold ring-2 ring-gold shadow-[0_0_24px_#f2b74355]' : 'border-paper/80 hover:-translate-y-1',!unlocked && 'border-white/10 bg-[#637476]/85 opacity-80 grayscale')}>
          <div className="relative w-[42%] shrink-0 overflow-hidden rounded-lg bg-teal"><KitchenMap level={i}/>{!unlocked && <div className="absolute inset-0 flex items-center justify-center bg-ink/45"><LockKeyhole className="size-8 text-paper"/></div>}</div>
          <div className="flex flex-1 flex-col justify-center pl-3 md:pl-4"><p className="mb-1 font-body text-[10px] font-extrabold uppercase tracking-widest opacity-55">SHIFT 0{i+1}{state.level===i ? ' · SELECTED' : ''}</p><h3 className="mb-3 text-lg leading-tight md:text-xl lg:text-2xl">{shift.name}</h3><Stars count={starsFor(best,i,state.mode)}/><p className="mt-2 text-[10px] font-bold opacity-60">{unlocked ? best > 0 ? `PERSONAL BEST · ${best.toLocaleString('en-US')}` : 'A fresh shift awaits' : `1 star in ${SHIFTS[i-1].name} to unlock`}</p></div>
        </button>; })}
      </div>
    </section>
    <p className="mt-4 text-center text-xs font-bold text-paper/70 sm:hidden">Best with a keyboard. Solo touch controls are also available.</p>
  </main>;
}
export function Briefing({ state, go, start }: ScreenProps) {
  const shift = SHIFTS[state.level];
  const pace = shift.service[state.mode];
  return <main className="relative min-h-[100svh] bg-ink/25 px-5 pb-8 pt-24 backdrop-blur-[2px] md:px-12">
    <button onClick={() => go('/')} className="mb-5 flex min-h-11 items-center gap-2 font-extrabold text-paper"><ArrowLeft className="size-5"/>Back to kitchens</button>
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="paper flex flex-wrap items-center justify-between gap-5 p-6 md:p-8"><div><div className="mb-1 flex items-center gap-3"><span className="rounded-lg bg-gold/70 px-3 py-2 font-display text-xl">0{state.level+1}</span><h1 className="text-3xl uppercase md:text-5xl">{shift.name}</h1></div><p className="mt-2 text-lg font-bold text-ink/65">{state.mode==='coop' ? 'Two chefs. One busy rooftop.' : 'One chef. A whole lot of possibility.'}</p><div role="note" aria-label="Service pace" className="mt-3 max-w-md space-y-1 text-sm text-ink/75"><p className="font-extrabold">Arrivals every {pace.arrivalSeconds}s · Guests wait {pace.patienceSeconds}s</p><p className="text-xs">Up to {MAX_ACTIVE_ORDERS} open orders. Fast service brings guests sooner.</p><p className="text-xs">Practice has no time limits.</p></div></div><div><p className="mb-3 flex items-center justify-center gap-2 font-display text-3xl"><Timer/>3:00</p><div className="flex gap-5">{targets(state.level,state.mode).map((target,i)=><div key={target} className="text-center"><div className="mb-1 flex justify-center">{Array.from({length:i+1},(_,j)=><Star key={j} className="size-5 fill-gold text-[#bd8b29]"/>)}</div><span className="text-sm font-extrabold">{target} pts</span></div>)}</div></div></section>
      <div className="flex justify-end"><ChefWardrobe /></div>
      <section className={cn('grid gap-4',state.mode === 'coop' ? 'md:grid-cols-2' : 'md:grid-cols-[1.1fr_1fr]')} aria-label="Chef controls">
        <ControlCard player={1}/>{state.mode==='coop' ? <ControlCard player={2}/> : <div className="paper flex flex-col justify-center gap-3 p-6"><div className="flex items-center gap-3"><Sparkles className="text-[#bd8b29]"/><h2 className="text-2xl">Find your flow</h2></div><p className="font-bold text-ink/70">Start with a salad. Set ingredients on a counter, bring over a clean plate, and combine them with E.</p><p className="text-sm text-ink/65">A patty grills by itself. Don’t forget it while you chop!</p></div>}
      </section>
      <section className="grid gap-4 md:grid-cols-2" aria-label="Recipes">
        {(['salad','burger'] as const).map(recipe=><div className="paper flex items-center gap-2 p-5" key={recipe}><DishArt recipe={recipe} className="h-28 w-32 shrink-0"/><div><h2 className="text-2xl">{RECIPES[recipe].name}</h2><RecipeIngredients recipe={recipe} className="my-2"/><p className="flex items-center gap-1 font-display text-sm">{recipe==='salad'?'Chop':'Grill'}<ArrowRight className="size-4"/>Plate<ArrowRight className="size-4"/>Serve</p></div></div>)}
      </section>
      <div className="flex flex-wrap items-center justify-center gap-4 pt-2"><button className="game-button game-button-primary min-w-64 py-4 text-3xl" onClick={()=>start(false)}><Play className="fill-current"/>Start shift</button><button className="game-button py-4 text-xl" onClick={()=>start(true)}><ChefHat/>Practice first</button></div>
      <p className="text-center text-xs font-bold text-paper/90">Collect dirty plates at the hatch · Hold Work at the sink · Keep an extinguisher handy</p>
    </div>
  </main>;
}
function ControlCard({player}:{player:number}) {
  return <div className="paper flex flex-col items-start gap-5 p-5 sm:flex-row sm:items-center md:p-6"><div className={cn('flex size-24 shrink-0 flex-col items-center justify-center rounded-full border-4 border-white shadow-inner',player===1?'bg-tomato/15 text-tomato':'bg-[#3b9c98]/20 text-[#33817b]')}><ChefHat className="size-12 fill-white"/><span className="font-display text-lg">CHEF {player}</span></div><div className="space-y-3"><div className="flex items-center gap-3"><div className="flex gap-1">{(player===1 ? ['W','A','S','D'] : ['↑','←','↓','→']).map(k=><Key key={k}>{k}</Key>)}</div><span className="text-sm font-extrabold">Move</span></div><p className="flex items-center gap-3 text-sm font-extrabold"><Key>{player===1?'E':'K'}</Key>Pick up / place</p><p className="flex flex-wrap items-center gap-2 text-sm font-extrabold"><Key>{player===1?'F':'L'}</Key>Hold to work <Key>{player===1?'Space':'J'}</Key>Dash</p><p className="text-xs font-bold text-ink/60">Tap for a short burst · Recharges in {DASH_COOLDOWN_SECONDS}s</p></div></div>;
}
export function GameHUD({state}:{state:GameState}) {
  const seconds = Math.ceil(state.time);
  return <div className="pointer-events-none fixed inset-0 z-20">
    <section className="pointer-events-auto absolute left-3 top-3 flex max-w-[calc(100%-80px)] gap-2 overflow-x-auto pb-2 sm:left-6 sm:top-4 sm:gap-3 xl:max-w-[calc(100%-320px)]" aria-label="Active orders">
      {state.orders.map(order=><article key={order.id} className={cn('paper w-[100px] shrink-0 p-2 sm:w-36 lg:w-40',order.remaining<20&&'border-tomato')}><div className="mb-0.5 flex items-center justify-between"><span className="text-[9px] font-extrabold tracking-widest text-ink/50">ORDER {String(order.id).padStart(2,'0')}</span><Clock3 className="size-3 text-ink/60"/></div><div className="my-0.5 flex items-center gap-1"><DishArt recipe={order.recipe} className="h-8 w-10 shrink-0"/><h2 className="text-[10px] leading-tight sm:text-xs">{RECIPES[order.recipe].name}</h2></div><progress className={cn('order-patience block h-1.5',order.remaining<20&&'order-urgent')} value={order.remaining} max={order.duration} aria-label={`${RECIPES[order.recipe].name} patience`} /><RecipeIngredients recipe={order.recipe} compact className="mt-1.5 [&_svg]:size-5"/></article>)}
    </section>
    <MenuBoard orders={state.orders} practice={state.practice} />
    {state.practice && <section className="paper absolute left-1/2 top-[196px] w-[min(540px,90vw)] -translate-x-1/2 px-5 py-3 sm:top-6"><p className="mb-1 text-xs font-extrabold uppercase tracking-widest text-tomato">PRACTICE · {Math.min(state.tutorial+1,8)} / 8</p><p className="text-sm font-bold">{PRACTICE_STEPS[state.tutorial]}</p></section>}
    {state.messageTime>0 && <p role="status" className={state.messageKind === 'service' ? 'sr-only' : 'absolute left-1/2 top-[37%] max-w-[90vw] -translate-x-1/2 rounded-xl border-2 border-paper/70 bg-teal/95 px-5 py-3 text-center font-display text-base text-paper shadow-xl'}>{state.message}</p>}
    <section className="paper absolute bottom-5 left-4 flex items-center gap-4 px-4 py-3 sm:bottom-6 sm:left-6 sm:px-5" aria-label="Score"><div className="hidden size-14 items-center justify-center rounded-full border-[3px] border-[#ffdb73] bg-gold shadow-[0_3px_0_#c79426] sm:flex"><Star className="size-9 fill-paper text-[#d69821]"/></div><div><p className="text-[10px] font-extrabold tracking-widest text-ink/60">SCORE</p><p className="font-display text-3xl leading-none tabular-nums sm:text-4xl">{state.score}</p></div><div className="border-l-2 border-ink/15 pl-4"><p className="font-display text-xl">{state.combo}× <span className="text-xs font-bold">COMBO</span></p><progress value={state.combo} max={5} className="mt-1 w-16 sm:w-24" aria-label="Delivery combo"/></div></section>
    <section className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 gap-2 xl:flex" aria-label="Current chef actions">{state.chefs.slice(0,state.mode==='solo'?1:2).map(chef=><div key={chef.id} className="rounded-xl bg-ink/90 px-4 py-2 text-paper shadow-lg"><p className="text-xs font-bold text-paper/65">CHEF {chef.id+1} · {itemLabel(chef.held)}</p><p className="mt-1 flex items-center gap-2 text-sm font-extrabold"><Key>{chef.id===0?'E':'K'}</Key><Key>{chef.id===0?'F':'L'}</Key>{engine.prompt(chef)}</p></div>)}</section>
    <section aria-label="Chef dash readiness" className={cn('absolute bottom-24 right-4 flex flex-col gap-2 sm:bottom-28 sm:right-6',state.mode==='solo'&&'[@media(hover:none)]:hidden')}>{state.chefs.slice(0,state.mode==='solo'?1:2).map(chef=><DashStatus key={chef.id} chef={chef} paused={state.paused}/>)}</section>
    <section aria-label="Time remaining" className={cn('absolute bottom-5 right-4 flex items-center gap-3 rounded-2xl border-[3px] border-[#69bca6] bg-ink/95 px-4 py-3 text-paper shadow-lg sm:bottom-6 sm:right-6 sm:px-5',seconds<=30&&!state.practice&&'border-tomato text-[#ffb895]')}><Clock3 className="size-7 sm:size-10"/><span className="font-display text-3xl tabular-nums sm:text-5xl">{state.practice ? '∞' : `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}</span></section>
    <div className="absolute bottom-24 left-4 max-w-[calc(100%-184px)] rounded-lg bg-ink/80 px-3 py-2 text-xs font-bold text-paper xl:hidden"><span className="text-[#ffb28e]">Chef 1</span> · {itemLabel(state.chefs[0].held)}<br/>{engine.prompt(state.chefs[0])}</div>
  </div>;
}
export function ResultsScreen({state,go,start}:ScreenProps) {
  const r = state.results; if (!r) return null;
  const thresholds = targets(r.level,r.mode); const next = thresholds.find(n=>n>r.score);
  const canAdvance = r.level<2&&engine.unlocked(r.level+1);
  return <main className="relative flex min-h-[100svh] flex-col items-center justify-center bg-ink/20 px-4 py-4 backdrop-blur-[1px]">
    <section className="receipt w-full max-w-[510px] bg-paper px-7 py-6 text-center shadow-xl md:px-10">
      <p className="mb-2 text-xs font-extrabold tracking-[.25em] text-ink/55">KITCHEN RUSH · END OF SERVICE</p><h1 className="mb-3 text-3xl uppercase md:text-4xl">Shift complete</h1><Stars count={r.stars} large/><h2 className="mt-2 text-2xl">{SHIFTS[r.level].name}</h2><p className="mb-3 text-base font-bold text-ink/55">{r.stars>0?'Nicely served!':'Every great chef starts somewhere.'}</p>
      <dl className="space-y-2 border-y-2 border-dashed border-ink/20 py-3 text-left font-bold">{[['Orders served',r.served],['Order points',r.orderPoints],['Tips',`+${r.tips}`],['Missed orders',`−${r.penalties}`]].map(([label,value],i)=><div key={label} className="flex items-center gap-3">{i===0?<ChefHat className="size-5 text-ink/60"/>:i===1?<Coins className="size-5 text-ink/60"/>:i===2?<Sparkles className="size-5 text-[#bf8f28]"/>:<X className="size-5 text-tomato"/>}<dt>{label}</dt><dd className={cn('ml-auto text-xl',i===3&&'text-tomato')}>{value}</dd></div>)}</dl>
      <div className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="font-display text-xl">TOTAL</span><strong className="font-display text-6xl font-semibold tabular-nums">{r.score}</strong>{r.newBest&&<span className="-rotate-6 rounded-lg border-[3px] border-tomato px-2 py-1 font-display text-lg text-tomato">NEW BEST</span>}</div>
      {next ? <div className="text-left"><progress value={Math.max(0,r.score)} max={next} aria-label="Progress to next star"/><p className="mt-2 text-sm font-extrabold">{next-r.score} points to your {r.stars===0?'first':r.stars===1?'second':'third'} star</p></div>:<p className="flex items-center justify-center gap-2 font-bold text-[#a87920]"><Trophy className="size-5"/>Three-star service. Chef’s kiss.</p>}
      {canAdvance&&<div className="mt-3 flex items-center gap-4 border-t-2 border-dashed border-ink/20 pt-3 text-left"><div className="h-12 w-20 overflow-hidden rounded-lg"><KitchenMap level={r.level+1}/></div><div><h3 className="text-lg uppercase">{SHIFTS[r.level+1].name} {r.unlocked?'unlocked':'awaits'}</h3><p className="text-xs font-bold text-ink/60">{SHIFTS[r.level+1].subtitle}</p></div></div>}
    </section>
    {state.progressSaveFailed && <ProgressSaveNotice />}
    <div className="mt-4 flex flex-wrap justify-center gap-3">{canAdvance&&<button className="game-button game-button-primary" onClick={()=>{engine.select(r.level+1,r.mode);go('/briefing');}}><Play className="fill-current size-5"/>Next shift</button>}<ShareScore result={r}/><button className="game-button" onClick={()=>start(false)}><RotateCcw className="size-5"/>Play again</button><button className="game-button" onClick={()=>go('/')}><Home className="size-5"/>Back to rooftop</button></div>
  </main>;
}
/** Keep storage failures visible outside the live HUD, with an explicit recovery action. */
function ProgressSaveNotice() {
  return <div role="status" className="my-3 flex max-w-lg flex-wrap items-center gap-3 rounded-xl border-2 border-tomato bg-paper px-4 py-3 text-ink"><p className="min-w-0 flex-1 text-sm font-bold">Best scores are kept for this session only. Browser storage is unavailable.</p><button className="game-button min-h-11 px-3 py-2 text-sm" onClick={() => engine.retryProgressSave()}>Retry save</button></div>;
}
export function Toolbar({state,go,start}:ScreenProps) {
  const [panel,setPanel] = useState<'help'|'settings'|null>(null);
  const [confirm,setConfirm] = useState<'restart'|'exit'|null>(null);
  const playing=state.phase==='playing'; const open=state.paused||panel!==null;
  const close=()=>{setPanel(null);setConfirm(null);if(state.paused)engine.pause(false);};
  if(state.phase==='results')return <button className="icon-button fixed right-5 top-5 z-30" aria-label="Close results and return to rooftop" onClick={()=>go('/')}><X/></button>;
  return <><div className="pointer-events-auto fixed right-5 top-5 z-30 flex gap-2 md:right-8">
    {!playing&&<span className="mr-1 hidden items-center gap-2 rounded-xl bg-ink/65 px-4 text-xs font-extrabold tracking-wider text-paper shadow-md md:flex"><span className="size-2 rounded-full bg-gold"/>THE ROOFTOP IS OPEN</span>}
    {!playing&&<><button className="icon-button" aria-label={state.music?'Mute music':'Enable music'} onClick={()=>engine.setAudio('music',!state.music)}>{state.music?<Volume2 className="size-5"/>:<VolumeX className="size-5"/>}</button><button className="icon-button" aria-label="How to play" onClick={()=>setPanel('help')}><CircleHelp className="size-5"/></button></>}
    <button className="icon-button" aria-label={playing?'Pause game':'Settings'} onClick={()=>playing?engine.pause(true):setPanel('settings')}>{playing?<Pause className="size-6 fill-current"/>:<Settings2 className="size-5"/>}</button>
  </div>
  <Dialog open={open} onOpenChange={value=>{if(!value)close();}}><DialogContent className="paper max-h-[90svh] w-[calc(100%-32px)] max-w-lg overflow-auto p-7 [&>button]:flex [&>button]:size-10 [&>button]:items-center [&>button]:justify-center"><DialogTitle className="font-display text-3xl">{confirm?'Leave this shift?':panel==='help'?'A recipe for success':state.paused?'Take a breather.':'Make yourself at home'}</DialogTitle><DialogDescription className="font-bold text-ink/60">{confirm?'This shift’s unsaved score will be lost. Your best scores stay safe.':panel==='help'?'Good food comes from a little teamwork.':state.paused?'The kitchen is on pause. Nothing is burning.':'Your rooftop, your rhythm.'}</DialogDescription>
    {confirm ? <div className="flex gap-3"><button className="game-button flex-1" onClick={()=>setConfirm(null)}>Keep cooking</button><button className="game-button game-button-primary flex-1" onClick={()=>{const action=confirm;close();if(action==='restart')start(state.practice);else go('/');}}>{confirm==='restart'?'Restart':'Leave'}</button></div> : <>
    {panel==='help'?<div className="space-y-4 text-sm"><p><strong>1. Prep.</strong> Take lettuce and tomato from the crates. Place each on a chopping board, then hold Work.</p><p><strong>2. Plate.</strong> Put chopped food on a counter. Grab a clean plate and combine with Pick up / place. Burger? Add a bun and cooked patty.</p><p><strong>3. Serve.</strong> Carry a complete dish to the right hatch. Match an order before its patience runs out.</p><p><strong>4. Reset.</strong> Dirty plates return beside the hatch. Bring them to the sink and hold Work. Return clean plates to the stack or use them immediately.</p><p className="flex gap-2 rounded-lg bg-tomato/10 p-3"><Flame className="size-5 shrink-0 text-tomato"/>Forgot the grill? Grab the extinguisher on the left, hold Work at the flames, then discard the burnt food.</p><p><Keyboard className="mr-2 inline size-5"/><strong>P1:</strong> WASD · E pick · F work · Space dash<br/><strong>P2:</strong> Arrows · K pick · L work · J dash</p><p><strong>Dash:</strong> Tap for a short burst in your movement direction, or straight ahead when standing still. Each chef recharges independently in {DASH_COOLDOWN_SECONDS} seconds; watch the gold dash meter.</p></div>:<div className="space-y-4 py-2"><label className="flex items-center gap-3 font-bold"><Music2 className="size-5"/>Rooftop soundtrack<Switch className="ml-auto" checked={state.music} onCheckedChange={v=>engine.setAudio('music',v)}/></label><label className="flex items-center gap-3 font-bold"><Volume2 className="size-5"/>Kitchen sounds<Switch className="ml-auto" checked={state.sound} onCheckedChange={v=>engine.setAudio('sound',v)}/></label></div>}
    {state.paused&&<div className="space-y-3"><button className="game-button game-button-primary w-full" onClick={close}><Play className="size-5 fill-current"/>Keep cooking</button><div className="flex gap-3"><button className="game-button flex-1 text-base" onClick={()=>setConfirm('restart')}><RotateCcw className="size-4"/>Restart</button><button className="game-button flex-1 text-base" onClick={()=>setConfirm('exit')}><Home className="size-4"/>Rooftop</button></div><button className="flex min-h-11 w-full items-center justify-center gap-2 text-sm font-bold" onClick={()=>setPanel(panel==='help'?null:'help')}><CircleHelp className="size-4"/>How to play</button></div>}
    {!state.paused&&<button className="game-button mt-2" onClick={close}>Got it<ArrowRight className="size-5"/></button>}
    </>}
  </DialogContent></Dialog></>;
}
