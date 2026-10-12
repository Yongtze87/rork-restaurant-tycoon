import { describe, expect, it } from 'vitest';
import { BULLETIN, bulletinPage, readBulletin } from '@/management/bulletin';
import { RestaurantEngine } from '@/management/engine';
import { DAY_LENGTH, createRestaurant, type Guest } from '@/management/types';
import { cityDelta, cityLoop, sampleStreet } from '@/management/city-motion';
import { PARK } from '@/management/park-motion';

const guest = (stage: Guest['stage'], id = 20): Guest => ({ id, special: false, species: 'mouse', tableId: 3, seat: 0, dish: 'salad', price: 24, stage, waiting: 0, timer: 0, happy: false, stationId: null, paid: false, x: 4, z: 9, yaw: 0, route: [] });
describe('truthful street bulletin', () => {
  it('starts empty with an honestly upcoming opening, not invented attendance', () => {
    const s = createRestaurant(), data = readBulletin(s, false);
    expect(data.guests).toBe(0); expect(data.seated).toBe(0); expect(data.status).toBe('BEFORE SERVICE');
    expect(data.notices[0].title).toBe('Grand opening'); expect(data.notices[0].detail).toContain('when you are ready');
    expect(data.notices.map(n => n.id)).toEqual(['opening', 'salad', 'burger']);
  });
  it('counts actual restaurant guests in every lifecycle stage, not cumulative served or capacity', () => {
    const s = createRestaurant(); s.guests = (['arriving', 'waiting', 'cooking', 'ready', 'delivering', 'eating', 'leaving'] as const).map((stage, i) => guest(stage, 20 + i)); s.totals.served = 80;
    const data = readBulletin(s, false); expect(data.guests).toBe(7); expect(data.seated).toBe(5);
    s.guests.pop(); expect(readBulletin(s, false).guests).toBe(6);
  });
  it('reflects in-place menu edits and excludes disabled dishes', () => {
    const e = new RestaurantEngine(); const before = readBulletin(e.state, e.paused);
    e.setDish('salad', true, 31); e.setDish('burger', false, 38);
    const after = readBulletin(e.state, e.paused); expect(after.notices.find(n => n.id === 'salad')?.detail).toContain('$31'); expect(after.notices.some(n => n.id === 'burger')).toBe(false);
    expect(before.notices.find(n => n.id === 'salad')?.detail).toContain('$24');
  });
  it('never repeats grand opening on later days and only announces achieved growth', () => {
    const s = createRestaurant(); s.day = 2;
    expect(readBulletin(s, false).notices.map(n => n.id)).toEqual(['service', 'salad', 'burger']);
    s.expanded = true; s.lifetimeServed = 5;
    expect(readBulletin(s, false).notices.map(n => n.id)).toEqual(['service', 'expanded', 'milestone', 'salad', 'burger']);
    expect(readBulletin(s, false).notices.find(n => n.id === 'milestone')?.title).toBe('5 guests served');
  });
  it('prioritizes closing and report over opening and keeps pause explicit', () => {
    const s = createRestaurant(); s.phase = 'service'; expect(readBulletin(s, false).status).toBe('OPEN NOW');
    expect(readBulletin(s, true).status).toBe('PAUSED'); s.elapsed = DAY_LENGTH;
    expect(readBulletin(s, false).status).toBe('LAST ORDERS'); expect(readBulletin(s, true).notices[0].id).toBe('closing');
    s.phase = 'report'; s.totals.served = 7;
    expect(readBulletin(s, true).status).toBe('CLOSED'); expect(readBulletin(s, true).notices[0].detail).toBe('7 guests served this service.');
  });
  it('reads actual service, reset and saved state without mutating simulation or schema', () => {
    let raw = ''; const storage = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
    const e = new RestaurantEngine(storage); e.open(); for (let i = 0; i < 350; i++) e.update(.1);
    const before = JSON.stringify(e.state); expect(readBulletin(e.state, false).guests).toBeGreaterThan(0); expect(JSON.stringify(e.state)).toBe(before);
    e.save(); const restored = new RestaurantEngine(storage); expect(readBulletin(restored.state, restored.paused).guests).toBe(e.state.guests.length); expect(readBulletin(restored.state, restored.paused).status).toBe('OPEN NOW');
    e.reset(); expect(readBulletin(e.state, false).guests).toBe(0); expect(readBulletin(e.state, false).notices[0].id).toBe('opening');
  });
  it('rotates every eight city seconds, wraps, and handles invalid input safely', () => {
    expect(bulletinPage(0, 3)).toBe(0); expect(bulletinPage(7.99, 3)).toBe(0); expect(bulletinPage(8, 3)).toBe(1); expect(bulletinPage(24, 3)).toBe(0);
    for (const seconds of [-1, NaN, Infinity]) expect(bulletinPage(seconds, 3)).toBe(0);
    expect(bulletinPage(8, 0)).toBe(0);
    expect(cityDelta(.1, 'service', false, 3, false, false)).toBeCloseTo(.3);
    expect(cityDelta(.1, 'planning', true, 1, false, false)).toBe(0); expect(cityDelta(.1, 'service', false, 1, true, false)).toBe(0); expect(cityDelta(.1, 'service', false, 1, false, true)).toBe(0); expect(cityDelta(.1, 'report', false, 1, false, false)).toBe(0);
  });
  it.each([10, 14])('sits clear of cars, sidewalk actors, park and grid at %i columns', columns => {
    const radius = 2.3, p = { x: 0, z: 0, yaw: 0 };
    expect(BULLETIN.x + radius).toBeLessThan(PARK.x - PARK.width / 2);
    for (const offset of [-3.65, -3.03, -1.15, 1.15]) {
      const loop = cityLoop(columns, offset);
      for (let i = 0; i < 500; i++) { sampleStreet(loop, loop.length * i / 500, 1, p); expect(Math.hypot(p.x - BULLETIN.x, p.z - BULLETIN.z)).toBeGreaterThan(radius + .6); }
    }
  });
});
