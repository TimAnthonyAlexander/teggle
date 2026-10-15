// The area a moving part covers over its whole cycle: its shapes sampled so densely that no point
// of it moves more than SWEEP_STEP between two samples, binned in a grid. Static objects keep the
// minimum gap plus SWEEP_STEP from every sample, so they keep at least the minimum gap from the
// part at every tick in between. The line movers (movers.ts) reserve it as a zone, the way the
// rotating and platforms templates reserve a circle or a box.

import { boundsGap, shapeGap, type Shape } from './shapes';

/** Largest move of any point of a moving part between two kept samples (px). */
export const SWEEP_STEP = 2;

const CELL = 48;

export class Sweep {
  readonly shapes: Shape[] = [];
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  private readonly cells = new Map<number, number[]>();

  private *keys(minX: number, minY: number, maxX: number, maxY: number): Generator<number> {
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const y0 = Math.floor(minY / CELL);
    const y1 = Math.floor(maxY / CELL);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) yield (y + 64) * 4096 + x + 64;
  }

  add(s: Shape): void {
    const index = this.shapes.length;
    this.shapes.push(s);
    this.minX = Math.min(this.minX, s.minX);
    this.minY = Math.min(this.minY, s.minY);
    this.maxX = Math.max(this.maxX, s.maxX);
    this.maxY = Math.max(this.maxY, s.maxY);
    for (const key of this.keys(s.minX, s.minY, s.maxX, s.maxY)) {
      const list = this.cells.get(key);
      if (list === undefined) this.cells.set(key, [index]);
      else list.push(index);
    }
  }

  /**
   * The free distance from a shape to the swept area, SWEEP_STEP taken off for the moves between
   * samples; Infinity when it is at least `limit` away.
   */
  gap(s: Shape, limit: number): number {
    const reach = limit + SWEEP_STEP;
    if (boundsGap(this, s) >= reach) return Infinity;
    let best = Infinity;
    const seen = new Set<number>();
    for (const key of this.keys(s.minX - reach, s.minY - reach, s.maxX + reach, s.maxY + reach)) {
      for (const i of this.cells.get(key) ?? []) {
        if (seen.has(i)) continue;
        seen.add(i);
        const t = this.shapes[i];
        if (t === undefined || boundsGap(t, s) >= Math.min(reach, best + SWEEP_STEP)) continue;
        best = Math.min(best, shapeGap(t, s) - SWEEP_STEP);
      }
    }
    return best < limit ? best : Infinity;
  }

  /** The free distance between two swept areas, as gap() measures it. */
  gapTo(other: Sweep, limit: number): number {
    if (boundsGap(this, other) >= limit + 2 * SWEEP_STEP) return Infinity;
    let best = Infinity;
    for (const s of other.shapes) {
      if (boundsGap(this, s) >= limit + 2 * SWEEP_STEP) continue;
      best = Math.min(best, this.gap(s, limit + SWEEP_STEP) - SWEEP_STEP);
    }
    return best < limit ? best : Infinity;
  }
}
