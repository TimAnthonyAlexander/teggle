// Port of the original's Mover (research section 3): the phase clock with pauses
// (`Mover::GetMovePos`) and the position and rotation of every 1.01 movement type
// (`Mover::CalcPos`), plus Teggle's followPath along a level path (track.ts). Pure functions of
// the tick, so any world state can be rebuilt from its tick.
//
// Nesting (research 3.4) is applied by the caller: it passes the anchor already moved by the
// parent's position. Only the parent's position carries over, never its rotation.

import { atan2, cos, HALF_PI, PI, sin, sincos, TAU, wrapAngle, type SinCos } from '../core/dmath';
import type { Movement } from '../level/schema';
import type { Track, TrackPoint } from './track';

export interface Pose {
  x: number;
  y: number;
  rotation: number;
}

/** Floor modulo for integers, so negative clocks and offsets wrap forward (research 3.2). */
function floorMod(a: number, n: number): number {
  const r = a % n;
  return r < 0 ? r + n : r;
}

/**
 * Fraction of the cycle in [0, 1) at a tick, with pauses. Port of `Mover::GetMovePos`; C's
 * truncating integer division becomes Math.trunc and `%` becomes a floor modulo.
 */
export function movementPhase(m: Movement, tick: number): number {
  const period = m.period;
  let p: number;
  if (m.pause1 > 0) {
    const total = period + m.pause1 + m.pause2;
    const t = tick + m.offset;
    const a1 = Math.trunc((period * m.pause1At) / 100);
    const a2 = Math.trunc(((m.pause2At - m.pause1At) * period) / 100) + m.pause1 + a1;
    const a3 = floorMod(Math.trunc(m.postDelayPhase * total) + t, total);
    if (a3 > a1) {
      if (a3 <= a1 + m.pause1) p = a1;
      else if (a3 > a2) p = a3 <= a2 + m.pause2 ? a2 - m.pause1 : a3 - m.pause1 - m.pause2;
      else p = a3 - m.pause1;
    } else {
      p = a3;
    }
    p += Math.trunc(m.phase * period);
  } else {
    p = tick + m.offset + Math.trunc(m.phase * period);
  }
  return floorMod(p, period) / period;
}

/**
 * Position and rotation of a moving element at a tick. Port of `Mover::CalcPos`.
 *
 * `anchorX`/`anchorY` is the element's anchor (already carried by its parent, if any) and
 * `baseRotation` its own rotation; kinds that do not rotate return it unchanged. `frac` in
 * [0, 1) interpolates between ticks for drawing; the simulation always passes 0. A followPath
 * movement needs its compiled path as `track`; without one it stays at the anchor.
 *
 * followPath walks the track by arc length, a full lap (or start to end) per cycle, backward
 * with `reverse`; the element turns by as much as the track has turned since its start.
 */
export function movementPose(
  m: Movement,
  anchorX: number,
  anchorY: number,
  baseRotation: number,
  tick: number,
  out: Pose,
  frac = 0,
  track: Track | null = null,
): Pose {
  const dir = m.reverse ? -1 : 1;
  const ph = movementPhase(m, tick) + frac / m.period;
  const ang = ph * TAU * dir;
  const rx = m.radius;
  const ry = m.radius2 === 0 ? rx : m.radius2;
  const sc = scratch;
  // Offset from the anchor; the anchor is added last, so a path is the same wherever it sits.
  let dx = 0;
  let dy = 0;
  let rotation = baseRotation;
  switch (m.type) {
    case 'verticalCycle':
      dy = -sin(ang) * ry;
      break;
    case 'horizontalCycle':
      dx = cos(ang) * rx;
      break;
    case 'circle':
      sincos(ang, sc);
      dx = sc.cos * rx;
      dy = -sc.sin * ry;
      break;
    case 'horizontalInfinity':
      dx = cos(ang) * rx;
      dy = -sin(2 * ang) * ry * 0.5;
      break;
    case 'verticalInfinity':
      dx = sin(2 * ang) * rx;
      dy = -sin(ang) * ry;
      break;
    case 'horizontalArc':
    case 'verticalArc': {
      // Eases 0 -> span -> 0 over a cycle and ignores the direction, as in the original.
      const span = m.maxAngle === 0 ? PI : m.maxAngle;
      sincos((sin(ph * TAU - HALF_PI) + 1) * span * 0.5, sc);
      if (m.type === 'horizontalArc') {
        dx = sc.cos * rx;
        dy = -sc.sin * ry;
      } else {
        // The decompiled line reads x = ax + cos(s)·rx, y = ay - cos(s)·ry, which slides along a
        // straight diagonal. Teggle takes the reading that mirrors horizontalArc and matches the
        // fan editor's preview: the right half of the ellipse, top to bottom (spec 14.2).
        dx = sc.sin * rx;
        dy = -sc.cos * ry;
      }
      break;
    }
    case 'rotate':
      // The decompiled code replaces the turn with a constant maxAngle offset when maxAngle is
      // set, which would not move at all. Teggle always turns once per cycle (spec 14.2).
      rotation = baseRotation + ang;
      break;
    case 'rotateBackAndForth': {
      const span = m.maxAngle === 0 ? PI : m.maxAngle;
      rotation = baseRotation + (sin(ph * TAU) * span + m.pathRotation) * dir;
      break;
    }
    case 'verticalWrap':
      dy = -(ph - Math.trunc(ph)) * ry * dir;
      break;
    case 'horizontalWrap':
      dx = (ph - Math.trunc(ph)) * rx * dir;
      break;
    case 'rotateAroundCircle':
      sincos(ang, sc);
      dx = sc.cos * rx;
      dy = -sc.sin * ry;
      // On an ellipse the decompiled code takes a screen-space atan2 of the path tangent, which
      // turns the element the opposite way from the circular case. Teggle faces the element
      // along the ellipse's outward normal, which equals the circular case when rx = ry
      // (spec 14.2).
      rotation =
        m.radius === 0 || m.radius2 === 0
          ? baseRotation + ang
          : baseRotation + atan2(rx * sc.sin, ry * sc.cos);
      break;
    case 'followPath': {
      if (track === null) break;
      const u = ph - Math.trunc(ph);
      const tp = trackScratch;
      track.at((m.reverse ? 1 - u : u) * track.length, tp);
      dx = tp.x;
      dy = tp.y;
      rotation = baseRotation + wrapAngle(tp.turn);
      break;
    }
  }
  if (m.pathRotation !== 0) {
    sincos(m.pathRotation, sc);
    const rdx = dx * sc.cos + dy * sc.sin;
    dy = dy * sc.cos - dx * sc.sin;
    dx = rdx;
  }
  out.x = anchorX + dx;
  out.y = anchorY + dy;
  out.rotation = rotation;
  return out;
}

const scratch: SinCos = { sin: 0, cos: 0 };
const trackScratch: TrackPoint = { x: 0, y: 0, turn: 0 };
