import type { ScreenPoint } from './iso/projection';

/** Projected label bounds, centered on a customer's head or a staff work marker. */
export interface LabelPoint { id: string; x: number; y: number; width: number; height: number; }

/** Lift colliding labels, retaining a vertical leader back to the actual head position. */
export function separateLabels(points: LabelPoint[]): (LabelPoint & { lift: number })[] {
  const placed: (LabelPoint & { lift: number })[] = [];
  for (const point of [...points].sort((a, b) => b.y - a.y || a.id.localeCompare(b.id))) {
    let y = point.y;
    for (let attempt = 0; attempt < placed.length; attempt++) {
      const other = placed.find(label => Math.abs(point.x - label.x) < (point.width + label.width) / 2 + 3 && Math.abs(y - label.y) < (point.height + label.height) / 2 + 3);
      if (!other) break;
      y = other.y - (point.height + other.height) / 2 - 3;
    }
    placed.push({ ...point, y, lift: point.y - y });
  }
  return placed;
}

/** Place labels above their projected anchors; only transforms change, never service state. */
export function positionLabels(labels: Map<string, HTMLDivElement>, anchors: Map<string, ScreenPoint>): void {
  const positions: LabelPoint[] = [];
  for (const [id, element] of labels) {
    const anchor = anchors.get(id);
    if (!anchor) { element.style.visibility = 'hidden'; continue; }
    const height = element.offsetHeight, baseHeight = element.querySelector<HTMLElement>('[role="meter"]')?.offsetHeight ?? height;
    positions.push({ id, x: anchor.x, y: anchor.y - (height - baseHeight) / 2, width: element.offsetWidth, height });
  }
  for (const label of separateLabels(positions)) {
    const element = labels.get(label.id); if (!element) continue;
    element.style.transform = `translate3d(${label.x - label.width / 2}px, ${label.y - label.height / 2}px, 0)`;
    element.style.visibility = 'visible';
    const line = element.querySelector<HTMLElement>('[data-label-line]');
    if (line) line.style.height = `${label.lift}px`;
  }
}
