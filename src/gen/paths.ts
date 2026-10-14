// Vector paths: the input of the outline template (and later of the background line editor).
// A path is a polyline, open or closed. Procedural shapes are sampled densely here; drawn
// lines are smoothed with Chaikin corner cutting. Everything uses dmath, so a path's points
// are the same bits in every engine.

import { atan2, cos, PI, sin, TAU } from '../core/dmath';
import type { Vec2 } from '../level/geometry';

export interface Path {
  readonly points: readonly Vec2[];
  readonly closed: boolean;
}

function dist(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Total length, including the closing segment of a closed path. */
export function pathLength(p: Path): number {
  let len = 0;
  const n = p.points.length;
  const count = p.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = p.points[i];
    const b = p.points[(i + 1) % n];
    if (a !== undefined && b !== undefined) len += dist(a, b);
  }
  return len;
}

/** Cumulative arc length at every vertex (and at the closing vertex for closed paths). */
function cumulative(p: Path): { pts: Vec2[]; acc: number[] } {
  const pts = [...p.points];
  const first = pts[0];
  if (p.closed && first !== undefined) pts.push(first);
  const acc = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    acc.push((acc[i - 1] ?? 0) + (a !== undefined && b !== undefined ? dist(a, b) : 0));
  }
  return { pts, acc };
}

/** Samples a path at arc length positions (sorted ascending). */
export class PathSampler {
  private readonly pts: Vec2[];
  private readonly acc: number[];
  readonly length: number;
  readonly closed: boolean;

  constructor(p: Path) {
    const c = cumulative(p);
    this.pts = c.pts;
    this.acc = c.acc;
    this.length = c.acc[c.acc.length - 1] ?? 0;
    this.closed = p.closed;
  }

  /** Point at arc length s (wrapped on closed paths, clamped on open ones). */
  at(s: number): Vec2 {
    const L = this.length;
    const t = this.closed ? ((s % L) + L) % L : Math.max(0, Math.min(L, s));
    let lo = 0;
    let hi = this.acc.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((this.acc[mid] ?? 0) <= t) lo = mid;
      else hi = mid;
    }
    const a = this.pts[lo] ?? { x: 0, y: 0 };
    const b = this.pts[hi] ?? a;
    const s0 = this.acc[lo] ?? 0;
    const s1 = this.acc[hi] ?? s0;
    const f = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  /** Unit tangent at arc length s, from a short central difference. */
  tangent(s: number): Vec2 {
    const h = 0.5;
    const a = this.at(s - h);
    const b = this.at(s + h);
    const d = dist(a, b);
    return d > 0 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 1, y: 0 };
  }
}

/** Chaikin corner cutting: rounds corners while keeping the overall shape. */
export function smoothPath(p: Path, iterations = 3): Path {
  let pts = [...p.points];
  for (let k = 0; k < iterations; k++) {
    const out: Vec2[] = [];
    const n = pts.length;
    const count = p.closed ? n : n - 1;
    const first = pts[0];
    if (!p.closed && first !== undefined) out.push(first);
    for (let i = 0; i < count; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      if (a === undefined || b === undefined) continue;
      out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      out.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    const last = pts[n - 1];
    if (!p.closed && last !== undefined) out.push(last);
    pts = out;
  }
  return { points: pts, closed: p.closed };
}

/** The path moved, scaled and turned (screen rotation, counterclockwise). */
export function transformPath(
  p: Path,
  t: { readonly x?: number; readonly y?: number; readonly scale?: number; readonly turn?: number },
): Path {
  const k = t.scale ?? 1;
  const c = cos(t.turn ?? 0);
  const s = sin(t.turn ?? 0);
  return {
    closed: p.closed,
    points: p.points.map((v) => ({
      x: (t.x ?? 0) + k * (v.x * c + v.y * s),
      y: (t.y ?? 0) + k * (-v.x * s + v.y * c),
    })),
  };
}

/** Mirror image about a vertical line. */
export function mirrorPath(p: Path, axisX: number): Path {
  return { closed: p.closed, points: p.points.map((v) => ({ x: 2 * axisX - v.x, y: v.y })) };
}

export function reversePath(p: Path): Path {
  return { closed: p.closed, points: [...p.points].reverse() };
}

// ---------------------------------------------------------------------------------------------
// Procedural shapes. Closed shapes start at their top center so that evenly spaced objects
// along them come out mirror-symmetric, and they run clockwise on screen.

const SAMPLES = 360;

function sampled(f: (t: number) => Vec2, closed: boolean, n = SAMPLES): Path {
  const pts: Vec2[] = [];
  const count = closed ? n : n + 1;
  for (let i = 0; i < count; i++) pts.push(f(i / n));
  return { points: pts, closed };
}

/** Ellipse centered at (cx, cy), starting at the top, clockwise on screen. */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): Path {
  return sampled((t) => {
    const a = t * TAU;
    return { x: cx + rx * sin(a), y: cy - ry * cos(a) };
  }, true);
}

export function circlePath(cx: number, cy: number, r: number): Path {
  return ellipsePath(cx, cy, r, r);
}

/**
 * Circular arc from angle a0 to a1 (radians, math convention: 0 = +x, PI/2 = up on screen),
 * sampled from a0 to a1.
 */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): Path {
  return sampled((t) => {
    const a = a0 + (a1 - a0) * t;
    return { x: cx + r * cos(a), y: cy - r * sin(a) };
  }, false);
}

/**
 * Heart of the given width centered at (cx, cy), starting at the top notch. The classic
 * parametric heart, rescaled; its notch and tip are rounded by the smoothing of whoever
 * places objects on it.
 */
export function heartPath(cx: number, cy: number, width: number): Path {
  // x = 16 sin^3 t, y = 13 cos t - 5 cos 2t - 2 cos 3t - cos 4t (spans x -16..16).
  const k = width / 32;
  return sampled((u) => {
    const t = u * TAU;
    const s = sin(t);
    const x = 16 * s * s * s;
    const y = 13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t);
    return { x: cx + k * x, y: cy - k * (y - 2.5) };
  }, true);
}

/**
 * Star with rounded points: radius oscillates between rInner and rOuter with `points` lobes,
 * first point straight up. `sharpness` (an integer power, 1 or more) narrows the points.
 */
export function starPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  points: number,
  sharpness = 2,
): Path {
  return sampled((t) => {
    const a = t * TAU;
    const w = (cos(points * a) + 1) / 2;
    let f = w;
    for (let i = 1; i < sharpness; i++) f *= w;
    const r = rInner + (rOuter - rInner) * f;
    return { x: cx + r * sin(a), y: cy - r * cos(a) };
  }, true);
}

/** Sine wave from x0 to x1 around y, `waves` full periods, starting at `phase` (radians). */
export function wavePath(
  x0: number,
  x1: number,
  y: number,
  amplitude: number,
  waves: number,
  phase = 0,
): Path {
  return sampled((t) => {
    return { x: x0 + (x1 - x0) * t, y: y - amplitude * sin(phase + t * waves * TAU) };
  }, false);
}

/** Archimedean spiral from radius r0 to r1 over `turns`, starting at angle a0 (math). */
export function spiralPath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  turns: number,
  a0: number,
  clockwise: boolean,
  squash = 1,
): Path {
  const dir = clockwise ? -1 : 1;
  return sampled(
    (t) => {
      const a = a0 + dir * t * turns * TAU;
      const r = r0 + (r1 - r0) * t;
      return { x: cx + r * cos(a), y: cy - r * squash * sin(a) };
    },
    false,
    Math.max(SAMPLES, Math.round(turns * 720)),
  );
}

/** Rose curve r = R |cos(k a)|-style petals (k petals), first petal up. */
export function flowerPath(cx: number, cy: number, r: number, petals: number, depth: number): Path {
  return sampled((t) => {
    const a = t * TAU;
    const rr = r * (1 - depth + depth * ((cos(petals * a) + 1) / 2));
    return { x: cx + rr * sin(a), y: cy - rr * cos(a) };
  }, true);
}

/** Figure eight (lemniscate of Gerono), width w and height h, centered. */
export function infinityPath(cx: number, cy: number, w: number, h: number): Path {
  return sampled((t) => {
    const a = t * TAU;
    return { x: cx + (w / 2) * cos(a), y: cy - (h / 2) * sin(2 * a) };
  }, true);
}

/**
 * Letterforms as stroke paths in a 1 x 1.4 box (y down), for outline levels that spell
 * something. Each letter is one or more open strokes.
 */
const LETTERS: Readonly<Record<string, readonly (readonly [number, number])[][]>> = {
  T: [
    [
      [0, 0],
      [1, 0],
    ],
    [
      [0.5, 0],
      [0.5, 1.4],
    ],
  ],
  U: [
    [
      [0, 0],
      [0, 0.95],
      [0.15, 1.3],
      [0.5, 1.4],
      [0.85, 1.3],
      [1, 0.95],
      [1, 0],
    ],
  ],
  V: [
    [
      [0, 0],
      [0.5, 1.4],
      [1, 0],
    ],
  ],
  L: [
    [
      [0, 0],
      [0, 1.4],
      [1, 1.4],
    ],
  ],
};

/** Strokes of a letter, scaled to `height` with its top-left corner at (x, y). */
export function letterPaths(letter: string, x: number, y: number, height: number): Path[] {
  const k = height / 1.4;
  const upper = letter.toUpperCase();
  if (upper === 'O') return [ellipsePath(x + 0.5 * k, y + 0.7 * k, 0.5 * k, 0.7 * k)];
  if (upper === 'S') {
    // Two opposite half-arcs.
    const r = 0.35 * k;
    const top = arcPath(x + 0.5 * k, y + r, r, (PI * 1) / 6, (PI * 3) / 2);
    const bottom = arcPath(x + 0.5 * k, y + 3 * r, r, PI / 2, -(PI * 5) / 6);
    return [{ closed: false, points: [...top.points, ...bottom.points.slice(1)] }];
  }
  const strokes = LETTERS[upper] ?? [];
  return strokes.map((s) => ({
    closed: false,
    points: s.map(([px, py]) => ({ x: x + px * k, y: y + py * k })),
  }));
}

/** Direction angle of a vector in the game's convention (counterclockwise on screen). */
export function facingAngle(dx: number, dy: number): number {
  return atan2(-dy, dx);
}
