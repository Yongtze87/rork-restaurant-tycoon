import { describe, expect, it } from 'vitest';
import { RestaurantEngine } from '@/management/engine';
import { createAmbience } from '@/management/iso/ambience';
import { fitView } from '@/management/iso/projection';
import { renderTown, visibleCells } from '@/management/iso/town-render';
import { claimableRegions } from '@/management/ocean';
import { TOWN_SIZE } from '@/management/town';

/** A canvas context that records how many shapes were filled and ignores the rest. */
function stubContext() {
  const counts = { fill: 0, text: [] as string[] };
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key) => key in target ? target[key as string] : key === 'fill' ? () => { counts.fill++; } : key === 'fillText' ? (text: string) => { counts.text.push(text); } : key === 'measureText' ? (text: string) => ({ width: text.length * 6 }) : key === 'createRadialGradient' || key === 'createLinearGradient' ? () => gradient : () => undefined,
    set: (target, key, value) => { target[key as string] = value; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, counts };
}
function world() {
  const e = new RestaurantEngine(); e.state.town.zones.push('reef'); e.state.cash = 1e6;
  for (const id of ['1,0', '0,1', '-1,-1', '1,1']) e.claimRegion(id);
  return e;
}
const frame = (e: RestaurantEngine, zoom: number, width = 1280, height = 800) => ({
  town: e.state.town, ocean: e.state.ocean, cash: e.state.cash, view: fitView(width, height, TOWN_SIZE, TOWN_SIZE, zoom), width, height, windowTop: 0, windowHeight: height,
  time: 0, now: 0, ambience: createAmbience(1), reduced: true, selected: null, plotPrice: (x: number, z: number) => e.plotPrice(x, z), claim: (id: string) => ({ price: e.claimPrice(id), error: e.claimError(id) }),
});

describe('world rendering', () => {
  it('labels every claimable region in view with its name, stars and price or gate', () => {
    const e = world(), { ctx, counts } = stubContext(), labels = renderTown(ctx, frame(e, .3)).labels;
    const claimable = claimableRegions(e.state.ocean).map(r => r.id).sort();
    expect(labels.map(l => l.id).sort()).toEqual(claimable);
    expect(counts.text).toContain('Bluefall Trench'); expect(counts.text).toContain('★★★ · Open trench');
    expect(counts.text).toContain(`$${e.claimPrice('-1,0').toLocaleString('en-US')}`);
    expect(counts.text).toContain('After the Twilight Zone'); // ring 1 is open after the Coral Reef, ring 2 waits for the Twilight Zone
    expect(counts.text).toContain('Ember Vents'); // claimed regions carry their name
    for (const l of labels) { expect(l.right).toBeGreaterThan(l.left); expect(l.bottom).toBeGreaterThan(l.top); }
  });
  it('culls to the visible area, so drawing cost stays flat however big the world grows', () => {
    const small = world(), big = world();
    for (let x = -6; x <= 6; x++) for (let y = -6; y <= 6; y++) if ((x || y) && !big.state.ocean.regions.includes(`${x},${y}`)) big.state.ocean.regions.push(`${x},${y}`);
    const near = stubContext(), far = stubContext();
    renderTown(near.ctx, frame(small, 1)); renderTown(far.ctx, frame(big, 1));
    // Zoomed in on the home town, a world of 169 regions draws about as much as one of 5.
    expect(far.counts.fill).toBeLessThan(near.counts.fill * 2);
    const cells = visibleCells(fitView(1280, 800, TOWN_SIZE, TOWN_SIZE, .05), 1280, 800);
    expect(cells.x1 - cells.x0).toBeLessThanOrEqual(24); expect(cells.y1 - cells.y0).toBeLessThanOrEqual(24);
    const home = visibleCells(fitView(1280, 800, TOWN_SIZE, TOWN_SIZE, 1), 1280, 800);
    expect(home.x0).toBeLessThanOrEqual(0); expect(home.x1).toBeGreaterThanOrEqual(0); expect(home.x1 - home.x0).toBeLessThanOrEqual(5);
  });
});
