// Exact collision shapes of level elements at a pose, and the free distance between two of
// them. The outlines come from the same functions the physics compiles (src/level/geometry.ts)
// with the same rotation convention, so a gap measured here is the gap the ball sees.

import { cos, sin } from '../core/dmath';
import { curvedBrickVertices, straightBrickVertices, type Vec2 } from '../level/geometry';
import type { LevelElement } from '../level/schema';

export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface CircleShape extends Bounds {
  readonly kind: 'circle';
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** A closed polygon (bricks, solid polygons) or an open polyline (rods). */
export interface PolyShape extends Bounds {
  readonly kind: 'poly';
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  readonly closed: boolean;
}

export type Shape = CircleShape | PolyShape;

export function circleShape(x: number, y: number, r: number): CircleShape {
  return { kind: 'circle', x, y, r, minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
}

/** Local vertices placed at a pose: rotation turns counterclockwise on screen (research 1.2). */
export function polyShape(local: readonly Vec2[], pose: Pose, closed: boolean): PolyShape {
  const c = cos(pose.rotation);
  const s = sin(pose.rotation);
  const xs: number[] = [];
  const ys: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of local) {
    const x = pose.x + v.x * c + v.y * s;
    const y = pose.y - v.x * s + v.y * c;
    xs.push(x);
    ys.push(y);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { kind: 'poly', xs, ys, closed, minX, minY, maxX, maxY };
}

/** Local outline of an element with a polygonal body, or null. */
export function localOutline(e: LevelElement): { vertices: Vec2[]; closed: boolean } | null {
  switch (e.kind) {
    case 'brick':
      return { vertices: straightBrickVertices(e.length, e.width), closed: true };
    case 'curvedBrick':
      return {
        vertices: curvedBrickVertices(e.innerRadius, e.width, e.sector, e.points),
        closed: true,
      };
    case 'polygon':
      return { vertices: e.vertices.map((v) => ({ x: v.x, y: v.y })), closed: true };
    case 'rod':
      return { vertices: [e.a, e.b], closed: false };
    default:
      return null;
  }
}

/**
 * The body the ball collides with, at a pose. Null for elements that never collide:
 * teleports and anything with collision off (invisible movement anchors, exit markers).
 */
export function elementShape(e: LevelElement, pose: Pose): Shape | null {
  if (!e.collision || e.kind === 'teleport') return null;
  if (e.kind === 'peg' || e.kind === 'circle') return circleShape(pose.x, pose.y, e.radius);
  const outline = localOutline(e);
  return outline === null ? null : polyShape(outline.vertices, pose, outline.closed);
}

/** The pose an element has in the file (its layout at tick 0 when it does not move). */
export function filePose(e: LevelElement): Pose {
  const rotation =
    e.kind === 'brick' || e.kind === 'curvedBrick' || e.kind === 'polygon' || e.kind === 'rod'
      ? e.rotation
      : 0;
  return { x: e.x, y: e.y, rotation };
}

// ---------------------------------------------------------------------------------------------
// Distances

function pointSegment2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + ex * t - px;
  const dy = ay + ey * t - py;
  return dx * dx + dy * dy;
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Even-odd test, as the physics uses for concave polygons. */
export function insidePoly(p: PolyShape, x: number, y: number): boolean {
  if (!p.closed) return false;
  let inside = false;
  const n = p.xs.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p.xs[i] ?? 0;
    const yi = p.ys[i] ?? 0;
    const xj = p.xs[j] ?? 0;
    const yj = p.ys[j] ?? 0;
    if (yi > y !== yj > y && x < xj + ((y - yj) * (xi - xj)) / (yi - yj)) inside = !inside;
  }
  return inside;
}

function edgeCount(p: PolyShape): number {
  return p.closed ? p.xs.length : p.xs.length - 1;
}

/** Squared distance from a point to a polygon's outline. */
function pointOutline2(p: PolyShape, x: number, y: number): number {
  let best = Infinity;
  const n = p.xs.length;
  for (let i = 0; i < edgeCount(p); i++) {
    const j = (i + 1) % n;
    const d2 = pointSegment2(x, y, p.xs[i] ?? 0, p.ys[i] ?? 0, p.xs[j] ?? 0, p.ys[j] ?? 0);
    if (d2 < best) best = d2;
  }
  return best;
}

function circlePolyGap(c: CircleShape, p: PolyShape): number {
  const d = Math.sqrt(pointOutline2(p, c.x, c.y));
  return insidePoly(p, c.x, c.y) ? -d - c.r : d - c.r;
}

function polyPolyGap(a: PolyShape, b: PolyShape): number {
  const na = a.xs.length;
  const nb = b.xs.length;
  for (let i = 0; i < edgeCount(a); i++) {
    const i2 = (i + 1) % na;
    for (let j = 0; j < edgeCount(b); j++) {
      const j2 = (j + 1) % nb;
      if (
        segmentsCross(
          a.xs[i] ?? 0,
          a.ys[i] ?? 0,
          a.xs[i2] ?? 0,
          a.ys[i2] ?? 0,
          b.xs[j] ?? 0,
          b.ys[j] ?? 0,
          b.xs[j2] ?? 0,
          b.ys[j2] ?? 0,
        )
      ) {
        return -1;
      }
    }
  }
  for (let i = 0; i < na; i++) if (insidePoly(b, a.xs[i] ?? 0, a.ys[i] ?? 0)) return -1;
  for (let j = 0; j < nb; j++) if (insidePoly(a, b.xs[j] ?? 0, b.ys[j] ?? 0)) return -1;
  let best = Infinity;
  for (let i = 0; i < na; i++) best = Math.min(best, pointOutline2(b, a.xs[i] ?? 0, a.ys[i] ?? 0));
  for (let j = 0; j < nb; j++) best = Math.min(best, pointOutline2(a, b.xs[j] ?? 0, b.ys[j] ?? 0));
  return Math.sqrt(best);
}

/**
 * Free distance between two shapes: positive when apart, zero when touching, negative when
 * they overlap. For two polygons an overlap reports -1 rather than its depth.
 */
export function shapeGap(a: Shape, b: Shape): number {
  if (a.kind === 'circle' && b.kind === 'circle') {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy) - a.r - b.r;
  }
  if (a.kind === 'circle' && b.kind === 'poly') return circlePolyGap(a, b);
  if (a.kind === 'poly' && b.kind === 'circle') return circlePolyGap(b, a);
  if (a.kind === 'poly' && b.kind === 'poly') return polyPolyGap(a, b);
  return Infinity;
}

/** Lower bound of the gap from the bounding boxes; Infinity-safe broadphase. */
export function boundsGap(a: Bounds, b: Bounds): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Free distance from a shape to a point (negative inside). */
export function pointGap(s: Shape, x: number, y: number): number {
  if (s.kind === 'circle') {
    const dx = s.x - x;
    const dy = s.y - y;
    return Math.sqrt(dx * dx + dy * dy) - s.r;
  }
  const d = Math.sqrt(pointOutline2(s, x, y));
  return insidePoly(s, x, y) ? -d : d;
}
