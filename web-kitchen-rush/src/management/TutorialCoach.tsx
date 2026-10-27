import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ArrowRight, Shell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { restaurant } from './engine';
import { plotAt } from './town';
import { TUTORIAL_STEPS, currentStep, type TutorialStep } from './tutorial';
import type { Panel } from './Panels';
import type { PlotRef } from './TownPanel';

/** What the shell is showing, so a step can point at the next control to tap. */
export interface TutorialView { panel: Panel | null; view: 'restaurant' | 'town'; plot: PlotRef | null; placing: boolean; inspecting: boolean; capitalWarning: boolean }
interface Guide { title: string; text: string; targets: string[]; action?: { label: string; run: () => void } }

const next = (step: TutorialStep) => () => restaurant.tutorialTo(TUTORIAL_STEPS.indexOf(step) + 1);
const townTab = (text: string) => ({ text, targets: ['town-tab'] });

function guide(step: TutorialStep, ui: TutorialView): Guide {
  const s = restaurant.state, town = s.town, selected = ui.plot && plotAt(town, ui.plot.x, ui.plot.z), inTown = ui.view === 'town';
  const busy = town.plots.find(p => p.building && p.building !== 'restaurant' && p.job);
  switch (step) {
    case 'welcome': return { title: 'Welcome to the reef', text: 'The Mareen are a reef folk with little fin-like ears, and they love a good meal. You’re opening their newest restaurant, so let’s set it up together.', targets: [], action: { label: 'Let’s start', run: next('welcome') } };
    case 'table': return { title: 'Add a coral table', ...ui.placing
      ? { text: 'Tap the floor to move it if you like, then tap Confirm. You only pay when you confirm.', targets: ['confirm'] }
      : ui.panel === 'build' ? { text: 'Tap Coral table to preview it on your floor.', targets: ['buy-table'] }
      : { text: 'More tables seat more guests. Tap Build to open Interiors.', targets: ['build-tab'] } };
    case 'menu': return { title: 'Check your menu', ...ui.panel === 'menu'
      ? { text: 'These are your dishes and prices. Stay near the suggested price and guests won’t walk away.', targets: [], action: { label: 'Looks good', run: next('menu') } }
      : { text: 'Tap Menu to see what your chefs cook tonight.', targets: ['menu-tab'] } };
    case 'open': return { title: 'Open the doors', ...s.phase === 'planning'
      ? { text: 'Tap Open restaurant. Your crew cooks, serves and cleans on their own.', targets: ['open-restaurant'] }
      : { text: 'Your first guest is on the way. Watch them sit, order and get served.', targets: [] } };
    case 'plot': return { title: 'Grow your town', ...!inTown ? townTab('Your first guest is served! Now tap Town to see the reef around you.')
      : selected && !selected.owned ? { text: 'Tap Unlock to claim this plot for your town.', targets: ['unlock-plot'] }
      : { text: 'Tap a plot next to your restaurant to unlock it.', targets: ['plot-locked'] } };
    case 'build': return { title: 'Build something', ...!inTown ? townTab('Tap Town to choose a building for your new plot.')
      : selected?.owned && !selected.building ? { text: 'Pick any building. Each one helps your restaurant in its own way.', targets: ['build-building'] }
      : { text: 'Tap your empty plot to choose a building.', targets: ['plot-empty'] } };
    case 'charm': return { title: 'Speed it up', ...!inTown ? townTab('Tap Town to check on your builder.')
      : busy && selected?.x === busy.x && selected.z === busy.z ? town.charms.current > 0
        ? { text: 'See the timer? Building takes real time, even while you’re away. Tap Current charm to skip 15 minutes.', targets: ['use-current'] }
        : { text: 'See the timer? Building takes real time, even while you’re away. It finishes on its own, and a free charm arrives each day.', targets: [] }
      : { text: 'Tap the plot under construction to see its timer.', targets: ['plot-busy'] } };
    case 'wrap': return { title: 'You’re all set', text: 'Each day brings three challenges and a new tide. Pearls in the shop buy time, and levels 6 and 11 bring new looks.', targets: ['challenges', 'tide', 'pearl-shop'], action: { label: 'Start my story', run: next('wrap') } };
  }
}

/** Ring the controls a step points at. Only changed elements are touched, so the pulse doesn't restart every frame. */
function useHighlight(targets: string[]): void {
  const key = targets.join();
  useEffect(() => {
    const wanted = new Set(targets.map(id => document.querySelector(`[data-tutorial="${id}"]:not(:disabled)`) ?? document.querySelector(`[data-tutorial="${id}"]`)).filter((el): el is Element => Boolean(el)));
    document.querySelectorAll('[data-tutorial-highlight]').forEach(el => { if (!wanted.has(el)) el.removeAttribute('data-tutorial-highlight'); });
    wanted.forEach(el => {
      if (el.hasAttribute('data-tutorial-highlight')) return;
      el.setAttribute('data-tutorial-highlight', '');
      // Bring a newly pointed-at control into its panel's view without scrolling the page itself.
      const box = el.closest('.overflow-y-auto');
      if (box) { const outer = box.getBoundingClientRect(), inner = el.getBoundingClientRect(); if (inner.top < outer.top || inner.bottom > outer.bottom) box.scrollTop += inner.top - outer.top - 16; }
    });
  });
  useEffect(() => () => document.querySelectorAll('[data-tutorial-highlight]').forEach(el => el.removeAttribute('data-tutorial-highlight')), [key]);
}

/** A small, skippable coach card. It never blocks the game: no overlay, no focus trap, service keeps running. */
export function TutorialCoach(ui: TutorialView) {
  useSyncExternalStore(restaurant.subscribe, restaurant.getSnapshot);
  const index = currentStep(restaurant.state), step = index === null ? null : TUTORIAL_STEPS[index];
  const info = step ? guide(step, ui) : null;
  useHighlight(info?.targets ?? []);
  // Save progress the simulation already shows (e.g. a table placed early) so a reload resumes here.
  useEffect(() => { if (index !== null && index > restaurant.state.tutorial.step) restaurant.tutorialTo(index); }, [index]);
  // The menu step is about looking: closing the menu after opening it also counts.
  const sawMenu = useRef(false);
  useEffect(() => {
    if (step !== 'menu') { sawMenu.current = false; return; }
    if (ui.panel === 'menu') sawMenu.current = true; else if (sawMenu.current) next('menu')();
  }, [step, ui.panel]);
  if (index === null || !step || !info) return null;
  return <section aria-label="Tutorial" data-testid="tutorial" data-step={step} className="paper pointer-events-auto absolute left-2 right-[56px] top-2 z-[35] p-2.5 sm:left-3 sm:right-auto sm:w-[280px] sm:p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-teal"><Shell size={13} aria-hidden="true" />Getting started</span>
      <button type="button" onClick={() => restaurant.welcome()} className="-mr-1 min-h-11 px-1 text-xs font-bold text-ink/65 underline-offset-2 hover:text-ink hover:underline">Skip tutorial</button>
    </div>
    <div aria-live="polite">
      <h2 className="font-display text-base leading-tight">{info.title}</h2>
      <p className="mt-0.5 text-[11px] leading-snug text-ink/75">{info.text}</p>
    </div>
    <div className="mt-2 flex items-center gap-2">
      <ol aria-label={`Step ${index + 1} of ${TUTORIAL_STEPS.length}`} className="flex flex-1 gap-1">{TUTORIAL_STEPS.map((id, i) => <li key={id} className={cn('h-1.5 flex-1 rounded-full', i < index ? 'bg-gold' : i === index ? 'bg-teal' : 'bg-ink/15')} />)}</ol>
      {info.action && <button type="button" onClick={info.action.run} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-tomato px-3 font-display text-sm font-bold text-abyss">{info.action.label}<ArrowRight size={16} aria-hidden="true" /></button>}
    </div>
  </section>;
}
