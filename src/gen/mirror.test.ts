import { describe, expect, it } from 'vitest';
import { PI, wrapAngle } from '../core/dmath';
import { parseLevel, type MovementInput } from '../level/schema';
import { compileLevel } from '../sim/compile';
import { World } from '../sim/world';
import { BOARD_H, BOARD_W, CENTER_X } from './constants';
import type { Draft } from './draft';
import { mirrorElement } from './mirror';
import { float, orbit, slide } from './motion';

const MOVEMENTS: [string, MovementInput][] = [
  ['verticalCycle', { type: 'verticalCycle', period: 400, radius: 30, phase: 0.1 }],
  ['horizontalCycle', { type: 'horizontalCycle', period: 400, radius: 30, phase: 0.3 }],
  ['circle', { type: 'circle', period: 400, radius: 25, pathRotation: 0.7 }],
  ['circle reversed', { type: 'circle', period: 400, radius: 25, reverse: true, phase: 0.2 }],
  ['horizontalInfinity', { type: 'horizontalInfinity', period: 400, radius: 30, radius2: 20 }],
  ['verticalInfinity', { type: 'verticalInfinity', period: 400, radius: 20, radius2: 30 }],
  ['rotate', { type: 'rotate', period: 400 }],
  ['rotateBackAndForth', { type: 'rotateBackAndForth', period: 400, maxAngle: 0.5 }],
  ['rotateAroundCircle', { type: 'rotateAroundCircle', period: 400, radius: 60, pathRotation: 1 }],
];

/** Poses of a brick and of its mirror image at several ticks. */
function poses(movement: MovementInput) {
  const draft: Draft = {
    kind: 'brick',
    x: 300,
    y: 300,
    rotation: 0.4,
    length: 35,
    movement,
  };
  const twin = mirrorElement(draft);
  const l = parseLevel({
    formatVersion: 1,
    name: 'mirror',
    background: 'test',
    board: { width: BOARD_W, height: BOARD_H },
    elements: [
      { ...draft, id: 1 },
      { ...twin, id: 2 },
    ],
  });
  const w = new World(compileLevel(l));
  const out: [number, number, number, number, number, number][] = [];
  for (let t = 0; t < 400; t += 37) {
    while (w.tick < t) w.step();
    const a = w.element(1);
    const b = w.element(2);
    out.push([a.x, a.y, a.rotation, b.x, b.y, b.rotation]);
  }
  return out;
}

describe('mirror images', () => {
  it.each(MOVEMENTS)('%s: the twin moves as the mirror image', (_, movement) => {
    for (const [ax, ay, ar, bx, by, br] of poses(movement)) {
      expect(bx).toBeCloseTo(2 * CENTER_X - ax, 6);
      expect(by).toBeCloseTo(ay, 6);
      // A facing direction (cos r, -sin r) mirrors to (-cos r, -sin r): angle PI - r.
      expect(wrapAngle(br - (PI - ar))).toBeCloseTo(0, 6);
    }
  });

  it('keeps helpers exact: an orbit starts where the object was', () => {
    const d = orbit({ kind: 'peg', x: 340, y: 260 }, 300, 300, 800);
    const l = parseLevel({
      formatVersion: 1,
      name: 'orbit',
      background: 'test',
      board: { width: BOARD_W, height: BOARD_H },
      elements: [
        { ...d, id: 1 },
        { ...slide({ kind: 'peg', x: 600, y: 300 }, 40, 800), id: 2 },
        { ...float({ kind: 'peg', x: 700, y: 400 }, 20, 800, PI / 2), id: 3 },
      ],
    });
    const w = new World(compileLevel(l));
    expect(w.element(1).x).toBeCloseTo(340, 9);
    expect(w.element(1).y).toBeCloseTo(260, 9);
    expect(w.element(2).x).toBeCloseTo(600, 9);
    // A float starting at 90 degrees sits its radius above its spot.
    expect(w.element(3).y).toBeCloseTo(380, 9);
  });
});
