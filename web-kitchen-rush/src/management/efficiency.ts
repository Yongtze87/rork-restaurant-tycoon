/**
 * How well the dining room keeps up, from the last minute of service: how busy chefs and servers are, how full the
 * seats are, and where guests pile up. `advise` turns that into the one change most likely to help next.
 */
export interface EfficiencySample { chefs: number; servers: number; seats: number; waiting: number; ready: number; dirty: number }
export interface Efficiency {
  /** Shares of the last minute (0–1). */ kitchen: number; service: number; seats: number;
  /** Guests on average waiting for a chef to start, and plates waiting for a server; dirty seats. */ waiting: number; ready: number; dirty: number;
  /** Guests in the last minute turned away by a full room, and who left upset. */ turnedAway: number; upset: number;
  samples: number;
}
export type AdviceKind = 'none' | 'server' | 'chef' | 'station' | 'tables' | 'homes' | 'reputation' | 'smooth';
export interface Advice { kind: AdviceKind; title: string; text: string }
/** Seconds of service the readout looks back over, and how often it samples. */
export const EFFICIENCY_WINDOW = 60;
export const EFFICIENCY_STEP = .5;

export function summarize(samples: EfficiencySample[], turnedAway: number, upset: number): Efficiency {
  const n = samples.length, avg = (key: keyof EfficiencySample) => n ? samples.reduce((sum, x) => sum + x[key], 0) / n : 0;
  return { kitchen: avg('chefs'), service: avg('servers'), seats: avg('seats'), waiting: avg('waiting'), ready: avg('ready'), dirty: avg('dirty'), turnedAway, upset, samples: n };
}
/** The single most useful next step. `crewFull`: no room to hire; `stationsShort`: every station already has a chef. */
export function advise(e: Efficiency, { crewFull, stationsShort, limitBy }: { crewFull: boolean; stationsShort: boolean; limitBy: 'seats' | 'servers' | 'chefs' | 'stations' }): Advice {
  if (e.samples < 20) return { kind: 'none', title: 'Watching service', text: 'Give it a minute of service to see how the crew keeps up.' };
  const hire = (role: 'server' | 'chef'): Advice => crewFull
    ? { kind: 'homes', title: 'Room for more crew', text: `Your ${role}s are stretched and the crew is full. Build Mareen homes in town for more crew slots, or train the crew you have.` }
    : { kind: role, title: `Hire a ${role}`, text: role === 'server' ? 'Plates and dirty tables are waiting for a server.' : 'Orders are waiting for a chef.' };
  const servingLags = e.ready + e.dirty * .5, cookingLags = e.waiting;
  // Guests are kept waiting: fix the busiest part first.
  if (e.upset > 0 || servingLags + cookingLags > 1.5) {
    if (servingLags >= cookingLags && e.service > .7) return hire('server');
    if (e.kitchen > .7) return stationsShort ? { kind: 'station', title: 'Add a kitchen station', text: 'Every station has a chef and orders still queue. Another prep counter or grill lets one more chef cook.' } : hire('chef');
  }
  // A full room turns guests away: more seats, if the crew can cover them.
  if (e.turnedAway > 0 && e.seats > .8) {
    if (limitBy === 'seats') return { kind: 'tables', title: 'Add tables', text: 'Every seat is taken and guests are turned away. More tables seat them.' };
    if (limitBy === 'servers') return hire('server');
    if (limitBy === 'chefs') return hire('chef');
    return { kind: 'station', title: 'Add a kitchen station', text: 'The kitchen limits how many guests come. Another station lets one more chef cook.' };
  }
  if (e.kitchen < .5 && e.service < .5 && e.seats < .6) return { kind: 'reputation', title: 'Crew has time to spare', text: 'Fewer guests than the crew could serve. Gardens in town, a better reputation and fair prices bring more.' };
  return { kind: 'smooth', title: 'Running smoothly', text: 'Crew, kitchen and seats are in balance.' };
}
