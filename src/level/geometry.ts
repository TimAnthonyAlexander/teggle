// Shape geometry shared by the simulation, the renderer and the editor.
//
// Coordinates are board pixels with x right and y down. Angles are radians and turn
// counterclockwise as seen on screen, like the original: rotating (1, 0) by a gives
// (cos a, -sin a) (research 1.2). Every function here is deterministic (dmath only).

import { cos, sin } from '../core/dmath';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Rotates (x, y) about the origin by the angle whose cosine and sine are c and s. */
export function rotateVec(x: number, y: number, c: number, s: number): Vec2 {
  return { x: x * c + y * s, y: -x * s + y * c };
}

/**
 * Corners of a straight brick in its local frame (rotation 0), relative to its position.
 * At rotation 0 the brick faces +x and its long axis runs along y; at rotation PI/2 it lies
 * horizontally and faces up, which is the original's default orientation (research 2.6).
 */
export function straightBrickVertices(length: number, width: number): Vec2[] {
  const hw = width / 2;
  const hl = length / 2;
  return [
    { x: -hw, y: -hl },
    { x: hw, y: -hl },
    { x: hw, y: hl },
    { x: -hw, y: hl },
  ];
}

/**
 * Collision polygon of a curved brick in its local frame (rotation 0), relative to its
 * position, from the vertex math in research 2.6. The position sits on the arc's center line
 * on the bisector; at rotation 0 the arc bulges toward +x. The polygon runs along the outer
 * arc and back along the inner arc, so it is concave on the inner side.
 */
export function curvedBrickVertices(
  innerRadius: number,
  width: number,
  sector: number,
  points: number,
): Vec2[] {
  const rm = innerRadius + width / 2;
  const cx = -rm;
  const outer: Vec2[] = [];
  const inner: Vec2[] = [];
  for (let i = 0; i < points; i++) {
    const psi = -sector / 2 + (i * sector) / (points - 1);
    const c = cos(psi);
    const s = -sin(psi);
    outer.push({ x: cx + (innerRadius + width) * c, y: (innerRadius + width) * s });
    inner.push({ x: cx + innerRadius * c, y: innerRadius * s });
  }
  return outer.concat(inner.reverse());
}

/** Signed shoelace area; positive when the vertices run counterclockwise in math axes. */
export function signedArea(vertices: readonly Vec2[]): number {
  let sum = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function onSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  );
}

/** True when segments ab and cd share at least one point. */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  return o4 === 0 && onSegment(c, d, b);
}

/**
 * Index pair of the first two non-adjacent edges of a closed polygon that touch, or null
 * when the polygon is simple. Edge i runs from vertex i to vertex i + 1.
 */
export function findSelfIntersection(vertices: readonly Vec2[]): [number, number] | null {
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = vertices[j];
      const d = vertices[(j + 1) % n];
      if (c === undefined || d === undefined) continue;
      if (segmentsIntersect(a, b, c, d)) return [i, j];
    }
  }
  return null;
}
