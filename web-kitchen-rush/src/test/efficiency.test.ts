import { describe, expect, it } from 'vitest';
import { advise, summarize, type EfficiencySample } from '@/management/efficiency';
import { RestaurantEngine } from '@/management/engine';
import { buyFurniture } from '@/management/sim/simulator';

const minute = (sample: Partial<EfficiencySample>) => Array.from({ length: 120 }, () => ({ chefs: .3, servers: .3, seats: .4, waiting: 0, ready: 0, dirty: 0, ...sample }));
const base = { crewFull: false, stationsShort: false, limitBy: 'seats' as const };

describe('efficiency advice', () => {
  it('names the part that keeps guests waiting', () => {
    expect(advise(summarize(minute({ servers: .95, ready: 2, dirty: 2 }), 0, 2), base).kind).toBe('server');
    expect(advise(summarize(minute({ chefs: .95, waiting: 3 }), 0, 1), base).kind).toBe('chef');
    expect(advise(summarize(minute({ chefs: .95, waiting: 3 }), 0, 1), { ...base, stationsShort: true }).kind).toBe('station');
    expect(advise(summarize(minute({ servers: .95, ready: 2 }), 0, 2), { ...base, crewFull: true }).kind).toBe('homes');
    expect(advise(summarize(minute({ servers: .95, ready: 2 }), 0, 2), { ...base, crewFull: true, crewBy: 'room' })).toMatchObject({ kind: 'tables', title: 'Add tables first' });
  });
  it('asks for tables when a full room turns guests away, or for the crew that limits it', () => {
    expect(advise(summarize(minute({ seats: .95 }), 4, 0), base).kind).toBe('tables');
    expect(advise(summarize(minute({ seats: .95 }), 4, 0), { ...base, limitBy: 'servers' }).kind).toBe('server');
  });
  it('says when the crew has slack, when all is well, and waits for enough service first', () => {
    expect(advise(summarize(minute({}), 0, 0), base).kind).toBe('reputation');
    expect(advise(summarize(minute({ chefs: .7, servers: .7, seats: .8 }), 0, 0), base).kind).toBe('smooth');
    expect(advise(summarize(minute({}).slice(0, 5), 0, 0), base).kind).toBe('none');
  });
  it('measures the real dining room as it runs', () => {
    const lean = new RestaurantEngine(); lean.state.cash = 1e5; for (let i = 0; i < 5; i++) buyFurniture(lean, 'table'); lean.state.reputation = 5;
    lean.open(); for (let i = 0; i < 1200; i++) lean.update(.1);
    const e = lean.efficiency(); expect(e.samples).toBeGreaterThan(100);
    expect(e.service).toBeGreaterThan(.5); expect(['server', 'chef', 'station', 'smooth', 'tables']).toContain(e.advice.kind);
  });
});
