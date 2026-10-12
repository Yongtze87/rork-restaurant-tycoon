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
