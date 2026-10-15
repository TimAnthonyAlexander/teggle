// Mirror images about the board's vertical center line, so templates can build left/right
// symmetric layouts from one half. Positions mirror exactly; a movement mirrors to the movement
// whose path is the mirror image at every tick (direction, phase and facing adjusted).

import { PI } from '../core/dmath';
import type { MovementInput } from '../level/schema';
import { CENTER_X } from './constants';
import type { Draft } from './draft';

/** Wraps a cycle fraction into [0, 1). */
function wrap01(p: number): number {
  const r = p - Math.floor(p);
  return r === 1 ? 0 : r;
}

export function mirrorMovement(m: MovementInput): MovementInput {
  const phase = m.phase ?? 0;
  const reverse = m.reverse ?? false;
  const pathRotation = -(m.pathRotation ?? 0);
  const base = { ...m, pathRotation };
  switch (m.type) {
    case 'verticalCycle':
    case 'verticalWrap':
      return base;
    case 'horizontalCycle':
    case 'horizontalInfinity':
      // cos(a + PI) = -cos(a); sin(2a + 2PI) = sin(2a).
      return { ...base, phase: wrap01(phase + 0.5) };
    case 'circle':
    case 'verticalInfinity':
    case 'rotateAroundCircle':
      // The angle a = d (t / P + p) TAU must become PI - a: with the direction d flipped,
      // -d (t / P + p') TAU = PI - d (t / P + p) TAU gives p' = p + 1/2 for either d.
      return { ...base, reverse: !reverse, phase: wrap01(phase + 0.5) };
    case 'rotate':
      return { ...base, reverse: !reverse };
    case 'rotateBackAndForth':
      // pathRotation offsets the swing here (it is multiplied by the direction), not the path.
      return { ...m, reverse: !reverse };
    case 'horizontalWrap':
      return { ...base, reverse: !reverse };
    case 'horizontalArc':
    case 'verticalArc':
    case 'followPath':
      // A path is shared by everything on it; a mirror image would need a mirrored path.
      throw new Error(`mirroring a ${m.type} movement is not supported`);
  }
}

/** The element's mirror image about x = CENTER_X. */
export function mirrorElement(e: Draft): Draft {
  const x = 2 * CENTER_X - e.x;
  const movement = e.movement === undefined ? undefined : mirrorMovement(e.movement);
  const moveExtra = movement === undefined ? {} : { movement };
  switch (e.kind) {
    case 'peg':
    case 'circle':
    case 'teleport':
      return { ...e, x, ...moveExtra };
    case 'brick':
    case 'curvedBrick': {
      const rotation = e.rotation ?? 0;
      // A rotateAroundCircle element faces base + angle; the mirrored angle is PI - angle, so
      // the mirrored base is -base. Every other kind mirrors the facing directly.
      const mirrored = e.movement?.type === 'rotateAroundCircle' ? -rotation : PI - rotation;
      return { ...e, x, rotation: mirrored, ...moveExtra };
    }
    case 'polygon':
      return {
        ...e,
        x,
        rotation: -(e.rotation ?? 0),
        vertices: e.vertices.map((v) => ({ x: -v.x, y: v.y })),
        ...moveExtra,
      };
    case 'rod':
      return {
        ...e,
        x,
        rotation: -(e.rotation ?? 0),
        a: { x: -e.a.x, y: e.a.y },
        b: { x: -e.b.x, y: e.b.y },
        ...moveExtra,
      };
  }
}
