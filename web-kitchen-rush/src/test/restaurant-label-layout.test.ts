import { describe, expect, it } from 'vitest';
import { separateLabels, type LabelPoint } from '@/management/label-layout';

const point = (id: string, x: number, y: number): LabelPoint => ({ id, x, y, width: 56, height: 20 });
const noOverlaps = (points: LabelPoint[]): void => {
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const a = points[i], b = points[j];
    expect(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2).toBe(true);
  }
};
describe('head-anchored satisfaction meter layout', () => {
  it('leaves isolated labels at their own heads', () => {
    const points = [point('a', 20, 100), point('b', 110, 100)];
    expect(separateLabels(points)).toEqual(points.map(p => ({ ...p, lift: 0 })));
  });
  it('lifts a neighboring label rather than concealing it and retains its head offset', () => {
    const points = [point('a', 143, 370), point('b', 165, 374)], original = structuredClone(points);
    const result = separateLabels(points); noOverlaps(result);
    expect(result.find(p => p.id === 'a')!.lift).toBe(19);
    expect(points).toEqual(original);
    for (const label of result) expect(label.y + label.lift).toBe(points.find(p => p.id === label.id)!.y);
  });
  it('is deterministic for coincident guests and separates dense multi-table groups', () => {
    const points = Array.from({ length: 20 }, (_, i) => point(`guest-${i}`, 80 + i % 4 * 36, 300 + i % 3 * 8));
    const forward = separateLabels(points), reverse = separateLabels([...points].reverse());
    expect(forward).toEqual(reverse); noOverlaps(forward);
    expect(forward.every(p => p.lift >= 0)).toBe(true);
  });
});
