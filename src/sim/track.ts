// A path for followPath movements (Teggle's addition to the original's movers, spec 14.2): a
// polyline walked at constant speed by arc length. Positions are linear along each segment. The
// direction an element faces turns with the path: the tangent angle is the mean of the two
// segments' directions at every inner vertex and linear in between, so it never jumps at a
// vertex. Only arithmetic, Math.sqrt and dmath's atan2, so a track is the same bits everywhere.

import { atan2, wrapAngle } from '../core/dmath';
import type { Vec2 } from '../level/geometry';

/** Where a track puts an element: its offset from the anchor and how far it has turned. */
export interface TrackPoint {
  x: number;
  y: number;
  /** Tangent angle here minus the tangent angle at the start, counterclockwise on screen. */
  turn: number;
}

export class Track {
  readonly closed: boolean;
  /** Total arc length, the closing segment included. */
  readonly length: number;
  /** Vertices; a closed track repeats its first vertex at the end. */
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  /** Arc length at each vertex. */
  private readonly acc: Float64Array;
  /** Tangent angle at each vertex minus the one at the start, unwrapped along the track. */
  private readonly tau: Float64Array;

  constructor(points: readonly Vec2[], closed: boolean) {
    const n = points.length;
    const m = closed ? n + 1 : n;
    this.closed = closed;
    this.xs = new Float64Array(m);
    this.ys = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const p = points[i % n];
      this.xs[i] = p?.x ?? 0;
      this.ys[i] = p?.y ?? 0;
    }
    // Segment directions, unwrapped so neighbors differ by less than a half turn.
    const segments = m - 1;
    const dir = new Float64Array(segments);
    this.acc = new Float64Array(m);
    for (let i = 0; i < segments; i++) {
      const dx = (this.xs[i + 1] ?? 0) - (this.xs[i] ?? 0);
      const dy = (this.ys[i + 1] ?? 0) - (this.ys[i] ?? 0);
      this.acc[i + 1] = (this.acc[i] ?? 0) + Math.sqrt(dx * dx + dy * dy);
      const a = atan2(-dy, dx);
      dir[i] = i === 0 ? a : (dir[i - 1] ?? 0) + wrapAngle(a - (dir[i - 1] ?? 0));
    }
    this.length = this.acc[m - 1] ?? 0;
    const tau = new Float64Array(m);
    for (let i = 1; i < segments; i++) tau[i] = ((dir[i - 1] ?? 0) + (dir[i] ?? 0)) / 2;
    const first = dir[0] ?? 0;
    const last = dir[segments - 1] ?? 0;
    // The start vertex of a closed track joins the last segment to the first; the end repeats it
    // one loop on.
    const across = closed ? wrapAngle(first - last) : 0;
    const start = first - across / 2;
    tau[0] = start;
    tau[m - 1] = last + across / 2;
    for (let i = 0; i < m; i++) tau[i] = (tau[i] ?? 0) - start;
    this.tau = tau;
  }

  /**
   * The point at arc length s: wrapped onto the loop of a closed track, clamped to the ends of
   * an open one.
   */
  at(s: number, out: TrackPoint): TrackPoint {
    const L = this.length;
    let t: number;
    if (this.closed) {
      t = s % L;
      if (t < 0) t += L;
    } else {
      t = s < 0 ? 0 : s > L ? L : s;
    }
    const acc = this.acc;
    let lo = 0;
    let hi = acc.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((acc[mid] ?? 0) <= t) lo = mid;
      else hi = mid;
    }
    const s0 = acc[lo] ?? 0;
    const s1 = acc[hi] ?? s0;
    const f = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
    const x0 = this.xs[lo] ?? 0;
    const y0 = this.ys[lo] ?? 0;
    const a0 = this.tau[lo] ?? 0;
    out.x = x0 + ((this.xs[hi] ?? x0) - x0) * f;
    out.y = y0 + ((this.ys[hi] ?? y0) - y0) * f;
    out.turn = a0 + ((this.tau[hi] ?? a0) - a0) * f;
    return out;
  }
}
