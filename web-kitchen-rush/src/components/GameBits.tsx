import { ChefHat, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { makeStations } from '@/game/config';
import { MODELS } from '@/game/assets';
import type { Recipe } from '@/game/types';

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return <div className={cn('wordmark select-none', compact && 'wordmark-small')} aria-label="Kitchen Rush"><ChefHat className="wordmark-hat" strokeWidth={2.6} /><span className="block">KITCHEN</span><span className="block text-gold">RUSH<span className="logo-tomato" aria-hidden="true">●</span></span></div>;
}
export function Stars({ count, large = false }: { count: number; large?: boolean }) {
  return <div className={cn('flex gap-1.5', large && 'justify-center gap-3')} aria-label={`${count} of 3 stars`}>{[1, 2, 3].map(n => <Star key={n} className={cn(large ? 'size-12 md:size-16' : 'size-6 md:size-8', n <= count ? 'fill-gold text-[#d49427] drop-shadow-sm' : 'fill-[#c9c2ae] text-[#b9b19e]')} strokeWidth={1.4} />)}</div>;
}
export function DishArt({ recipe, className }: { recipe: Recipe; className?: string }) {
  const image = MODELS[recipe]?.thumbnail;
  if (image) return <img src={image} className={cn('object-contain mix-blend-multiply', className)} alt={recipe === 'burger' ? 'Rooftop burger' : 'Garden salad'} />;
  return <svg className={className} viewBox="0 0 140 110" role="img" aria-label={recipe === 'burger' ? 'Rooftop burger' : 'Garden salad'}><ellipse cx="70" cy="85" rx="57" ry="17" fill="#d9cdb3"/><ellipse cx="70" cy="80" rx="55" ry="19" fill="#fffdfa"/><ellipse cx="70" cy="80" rx="44" ry="12" fill="#ede9db"/>{recipe === 'burger' ? <><path d="M29 69Q70 80 111 69L108 82Q69 99 32 82Z" fill="#d88723"/><path d="M29 60Q69 51 111 60L109 74Q70 84 31 74Z" fill="#673f25"/><path d="M29 55L47 50L67 56L93 49L112 56L107 64L86 63L69 70L49 62L32 65Z" fill="#78a528"/><path d="M30 48Q70 34 110 48L108 57Q70 65 32 57Z" fill="#e64a2a"/><path d="M28 44Q30 9 70 9Q110 9 112 44Q69 65 28 44" fill="#eeb44d"/>{[43,58,73,91].map((x,i)=><ellipse key={x} cx={x} cy={25+i%2*8} rx="3" ry="1.5" fill="#fff3c7" transform={`rotate(-25 ${x} 28)`}/>)}</> : <>{Array.from({length:12},(_,i)=><ellipse key={i} cx={39+(i*19)%65} cy={48+(i*17)%35} rx="16" ry="12" fill={i%2 ? '#65a12c':'#90bb3a'} transform={`rotate(${i*40} 70 65)`}/>)}{[42,66,91,80].map((x,i)=><circle key={x} cx={x} cy={49+i%3*12} r="10" fill="#ea5531"/>)}</>}</svg>;
}
export function KitchenMap({ level }: { level: number }) {
  const palettes = [['#e9af78','#d68658','#366b61'],['#b59b88','#bc7553','#2c5a54'],['#647c88','#96705c','#2c4b50']];
  const colors = palettes[level];
  return <svg className="h-full w-full" viewBox="0 0 180 128" role="img" aria-label={`${['Golden Hour','Dinner Rush','Last Call'][level]} kitchen layout`}><rect width="180" height="128" fill={colors[0]}/><circle cx="138" cy="20" r="14" fill="#ffdb8a"/><path d="M0 40V28H10V13H20V28H27V22H39V8H46V31H55V22H65V35H77V18H87V36H100V22H109V35H125V25H139V34H160V16H174V32H180V52Z" fill="#555d65" opacity=".65"/><path d="M7 54L89 37L176 56L165 117L23 117Z" fill={colors[1]}/><g transform="translate(90 79) scale(9 6)">{makeStations(level).map(st => <g key={st.id} transform={`translate(${st.x} ${st.z})`}><rect x="-.73" y="-.73" width="1.46" height="1.6" fill={colors[2]}/><rect x="-.73" y="-.9" width="1.46" height="1.35" rx=".1" fill={st.kind==='grill'?'#3c4141':'#f8d89b'}/>{st.kind==='board'&&<rect x="-.45" y="-.65" width=".9" height=".75" fill="#bd7743"/>}</g>)}</g><circle cx="58" cy="79" r="6" fill="#fff6df"/><circle cx="115" cy="87" r="6" fill="#fff6df"/><path d="M5 39Q90 56 175 39" stroke="#3b4030" fill="none"/>{[15,45,75,105,135,165].map((x,i)=><circle key={x} cx={x} cy={42+Math.sin(i/5*Math.PI)*5} r="2.8" fill="#ffe7a4"/>)}</svg>;
}
export function Key({ children }: { children: React.ReactNode }) { return <kbd className="keycap">{children}</kbd>; }
