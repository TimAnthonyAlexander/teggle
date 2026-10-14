// Swept contact tests for a ball moving by (dx, dy) over the rest of a tick (research 4.1, 4.3).
//
// Contact surfaces sit CONTACT_SKIN inside the touching distance, so `rho` is the touching
// distance minus the skin. After a contact the world pushes the ball out to the full touching
// distance; that gap keeps a resting or sliding ball from re-hitting the same surface at t = 0.
// Normals point from the surface toward the ball.

export interface SweepHit {
  /** Fraction of (dx, dy) at which the contact happens, in [0, 1]. */
  t: number;
  nx: number;
  ny: number;
  /** The ball already overlapped the surface at the start (t = 0). */
  overlap: boolean;
}

export function createSweepHit(): SweepHit {
  return { t: 0, nx: 0, ny: 0, overlap: false };
}

/**
 * Ball center (px, py) against a circle of combined radius `rho` around (cx, cy): pegs, solid
 * circles, and polygon or rod end points (research 4.3: "end points are tested as circles").
 */
export function sweepCircle(
  px: number,
  py: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  rho: number,
  out: SweepHit,
): boolean {
  const mx = px - cx;
  const my = py - cy;
  const c = mx * mx + my * my - rho * rho;
  if (c < 0) {
    const d = Math.sqrt(mx * mx + my * my);
    if (d > 0) {
      out.nx = mx / d;
      out.ny = my / d;
    } else {
      out.nx = 0;
      out.ny = -1;
    }
    out.t = 0;
    out.overlap = true;
    return true;
  }
  const b = mx * dx + my * dy;
  if (b >= 0) return false;
  const a = dx * dx + dy * dy;
  const disc = b * b - a * c;
  if (disc < 0) return false;
  // Smaller root of a t^2 + 2 b t + c = 0 in the cancellation-free form c / (-b + sqrt(disc)).
  const t = c / (-b + Math.sqrt(disc));
  if (t > 1) return false;
  const qx = mx + dx * t;
  const qy = my + dy * t;
  const q = Math.sqrt(qx * qx + qy * qy);
  out.t = t;
  out.nx = qx / q;
  out.ny = qy / q;
  out.overlap = false;
  return true;
}

/**
 * Ball center against the face of an edge from (ax, ay) along unit (ux, uy) for `len`, offset
 * by `rho` along the normal (nx, ny). A one-sided edge (polygon outline) only blocks from the
 * normal's side; a two-sided edge (rod) blocks from whichever side the ball is on. Contacts
 * that miss the face's extent are left to the end point circles.
 */
export function sweepFace(
  px: number,
  py: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  ux: number,
  uy: number,
  len: number,
  nx: number,
  ny: number,
  twoSided: boolean,
  rho: number,
  out: SweepHit,
): boolean {
  const rx = px - ax;
  const ry = py - ay;
  let s0 = rx * nx + ry * ny;
  if (twoSided && (s0 < 0 || (s0 === 0 && dx * nx + dy * ny > 0))) {
    nx = -nx;
    ny = -ny;
    s0 = -s0;
  }
  if (s0 < 0) return false;
  const k0 = rx * ux + ry * uy;
  if (s0 < rho) {
    if (k0 < 0 || k0 > len) return false;
    out.t = 0;
    out.nx = nx;
    out.ny = ny;
    out.overlap = true;
    return true;
  }
  const dn = dx * nx + dy * ny;
  if (dn >= 0) return false;
  const t = (s0 - rho) / -dn;
  if (t > 1) return false;
  const k = k0 + t * (dx * ux + dy * uy);
  if (k < 0 || k > len) return false;
  out.t = t;
  out.nx = nx;
  out.ny = ny;
  out.overlap = false;
  return true;
}
