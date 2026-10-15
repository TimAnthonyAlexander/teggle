// Contact responses ported from the decompiled `Ball` code (research 4.3). Both functions
// change the ball's velocity in place (and, for a bounce off a moving surface, its position).
// The caller has already pushed the ball out to the touching distance. Normals point from the
// surface toward the ball; the original's circle code uses the opposite sign, so its formulas
// appear here with the sign folded in.

import { STEEP_IMPACT_SCALE, STEEP_NORMAL_X } from './tuning';

export interface Kinematics {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ContactResult {
  /** The velocity changed. False when the ball was already separating from the surface. */
  applied: boolean;
  /** The contact took the slide branch instead of bouncing. */
  slide: boolean;
  /** Approach speed along the normal before the response (px/tick, negative = separating). */
  impact: number;
}

export function createContactResult(): ContactResult {
  return { applied: false, slide: false, impact: 0 };
}

/**
 * The surface at a contact. The world fills one of these per contact instead of passing nine
 * numbers: V8 boxes every double argument of a call it does not inline, so a long argument list
 * would allocate on every contact.
 */
export interface Surface {
  /** Contact normal, from the surface toward the ball. */
  nx: number;
  ny: number;
  /** The surface's linear velocity. */
  wx: number;
  wy: number;
  /** Rotational surface velocity at the contact point (lines only). */
  wax: number;
  way: number;
  bouncy: number;
  rolly: number;
  /** Bounce speed cap, 0 for none (lines only). */
  maxBounceVelocity: number;
}

export function createSurface(): Surface {
  return { nx: 0, ny: 0, wx: 0, wy: 0, wax: 0, way: 0, bouncy: 0, rolly: 0, maxBounceVelocity: 0 };
}

/**
 * Ball against a peg, a solid circle or a Fever divider (`Ball.cpp:830-876`). The circle moves
 * with velocity (wx, wy) and has infinite mass. The original multiplies by M/(M+1) with
 * M = 999999995904, which is exactly 1 in its float32 arithmetic, so it is left out. Reads the
 * normal, the velocity, bouncy and rolly of `s`.
 */
export function respondCircle(ball: Kinematics, s: Surface, out: ContactResult): void {
  const nx = s.nx;
  const ny = s.ny;
  const wx = s.wx;
  const wy = s.wy;
  const bouncy = s.bouncy;
  const rolly = s.rolly;
  const approach = -((ball.vx - wx) * nx + (ball.vy - wy) * ny);
  out.impact = approach;
  if (approach <= 0) {
    out.applied = false;
    out.slide = false;
    return;
  }
  let vn = approach * bouncy;
  const slide = Math.abs(vn) <= rolly;
  if (!slide) vn = 2 * vn;
  ball.vx += vn * nx;
  ball.vy += vn * ny;
  out.applied = true;
  out.slide = slide;
}

/**
 * Ball against a polygon edge, brick, rod, wall or flipper (`Ball.cpp:931-1006`). (wx, wy) is
 * the surface's linear velocity and (wax, way) the rotational velocity at the contact point;
 * every input comes from `s`.
 *
 * The decompiled slide line reads v = vSurface + (v - n·(v·n)) + n·max(0, n·vAngular). Read
 * literally it adds the surface velocity on every contact, so a ball resting on a moving
 * platform would speed up by the platform's speed every tick. Teggle reads v as the velocity
 * relative to the surface, which keeps the ball's own tangential speed and matches the surface
 * along the normal (spec 14.2). The bounce branch is ported as decompiled.
 */
export function respondLine(ball: Kinematics, s: Surface, out: ContactResult): void {
  const nx = s.nx;
  const ny = s.ny;
  const wx = s.wx;
  const wy = s.wy;
  const wax = s.wax;
  const way = s.way;
  const bouncy = s.bouncy;
  const rolly = s.rolly;
  const maxBounceVelocity = s.maxBounceVelocity;
  let impact = -(nx * (ball.vx - wx - wax) + ny * (ball.vy - wy - way));
  out.impact = impact;
  if (impact < 0) {
    out.applied = false;
    out.slide = false;
    return;
  }
  if (Math.abs(nx) > STEEP_NORMAL_X) impact *= STEEP_IMPACT_SCALE;
  out.applied = true;
  if (impact <= rolly) {
    let ux = ball.vx - wx;
    let uy = ball.vy - wy;
    const un = ux * nx + uy * ny;
    ux -= nx * un;
    uy -= ny * un;
    const lift = Math.max(0, nx * wax + ny * way);
    ball.vx = wx + ux + nx * lift;
    ball.vy = wy + uy + ny * lift;
    out.slide = true;
    return;
  }
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx = (ball.vx - 2 * nx * vn) * bouncy;
    ball.vy = (ball.vy - 2 * ny * vn) * bouncy;
  }
  const addX = (wx + wax) * (1 + bouncy);
  const addY = (wy + way) * (1 + bouncy);
  if (addX * nx + addY * ny > 0) {
    ball.x += addX;
    ball.y += addY;
  }
  ball.vx += addX;
  ball.vy += addY;
  if (maxBounceVelocity > 0) {
    const speed2 = ball.vx * ball.vx + ball.vy * ball.vy;
    if (speed2 > maxBounceVelocity * maxBounceVelocity) {
      const scale = maxBounceVelocity / Math.sqrt(speed2);
      ball.vx *= scale;
      ball.vy *= scale;
    }
  }
  out.slide = false;
}
