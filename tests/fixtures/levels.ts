// Test fixture levels for the physics tests, the engine digest and the benchmark. They are
// built procedurally here and never shipped as content.

import { atan2, cos, PI, sin } from '../../src/core/dmath';
import {
  parseLevel,
  type Level,
  type LevelElementInput,
  type MovementInput,
} from '../../src/level/schema';

/** Teggle's standard board (docs/design/visual-language.md section 16). */
export const FIXTURE_WIDTH = 916;
export const FIXTURE_HEIGHT = 560;

function level(name: string, elements: LevelElementInput[]): Level {
  return parseLevel({
    formatVersion: 1,
    name,
    background: 'fixture',
    board: { width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT },
    elements,
  });
}

/** A board with no elements, only the base geometry. */
export function emptyLevel(): Level {
  return level('empty', []);
}

/** A level with the given elements on the fixture board. */
export function levelWith(elements: LevelElementInput[]): Level {
  return level('custom', elements);
}

/** Staggered rows of static round pegs; every seventh peg disappears quickly. */
export function plinkoLevel(): Level {
  const elements: LevelElementInput[] = [];
  let id = 1;
  for (let row = 0; row < 8; row++) {
    const y = 160 + row * 42;
    const offset = row % 2 === 0 ? 0 : 30;
    for (let x = 90 + offset; x < FIXTURE_WIDTH - 60; x += 60) {
      elements.push({ kind: 'peg', id, x, y, quickDisappear: id % 7 === 0 });
      id++;
    }
  }
  return level('plinko', elements);
}

/**
 * Every element kind and every motion feature: static and moving pegs, straight and curved
 * bricks (some rotating, some nested on a moving anchor), a concave polygon, rods, a solid
 * circle, a rotating polygon and two teleports.
 */
export function mixedLevel(): Level {
  const e: LevelElementInput[] = [];
  // Static pegs in two arcs.
  for (let i = 0; i < 12; i++) {
    const a = PI * (0.15 + (0.7 * i) / 11);
    e.push({ kind: 'peg', id: 1 + i, x: 300 + cos(a) * 180, y: 300 + sin(a) * 120 });
    e.push({ kind: 'peg', id: 20 + i, x: 660 + cos(a) * 160, y: 260 + sin(a) * 110 });
  }
  // Straight bricks: a flat row and a tilted pair.
  for (let i = 0; i < 6; i++) {
    e.push({ kind: 'brick', id: 40 + i, x: 360 + i * 36, y: 470, rotation: PI / 2 });
  }
  e.push({ kind: 'brick', id: 46, x: 140, y: 380, rotation: PI / 3, quickDisappear: true });
  e.push({ kind: 'brick', id: 47, x: 820, y: 380, rotation: (2 * PI) / 3 });
  // Curved bricks forming a bowl that faces up.
  for (let i = 0; i < 5; i++) {
    e.push({
      kind: 'curvedBrick',
      id: 50 + i,
      x: 480 + cos(PI * (1.2 + 0.15 * i)) * 70,
      y: 210 - sin(PI * (1.2 + 0.15 * i)) * 70,
      rotation: PI * (1.2 + 0.15 * i),
      innerRadius: 60,
      sector: PI / 8,
    });
  }
  // A concave polygon (an L-shaped ramp) and a solid circle bumper.
  e.push({
    kind: 'polygon',
    id: 60,
    x: 110,
    y: 250,
    vertices: [
      { x: -40, y: -10 },
      { x: 40, y: 30 },
      { x: 40, y: 40 },
      { x: -10, y: 40 },
      { x: -10, y: 60 },
      { x: -40, y: 60 },
    ],
  });
  e.push({ kind: 'circle', id: 61, x: 860, y: 200, radius: 24, bouncy: 0.95 });
  // Rods.
  e.push({ kind: 'rod', id: 62, x: 40, y: 450, a: { x: -40, y: -30 }, b: { x: 40, y: 30 } });
  e.push({
    kind: 'rod',
    id: 63,
    x: FIXTURE_WIDTH - 40,
    y: 450,
    a: { x: 40, y: -30 },
    b: { x: -40, y: 30 },
  });
  // A rotating polygon (a cross).
  const rotate: MovementInput = { type: 'rotate', period: 400 };
  e.push({
    kind: 'polygon',
    id: 64,
    x: 480,
    y: 380,
    movement: rotate,
    vertices: [
      { x: -30, y: -5 },
      { x: -5, y: -5 },
      { x: -5, y: -30 },
      { x: 5, y: -30 },
      { x: 5, y: -5 },
      { x: 30, y: -5 },
      { x: 30, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 30 },
      { x: -5, y: 30 },
      { x: -5, y: 5 },
      { x: -30, y: 5 },
    ],
  });
  // A windmill: an invisible anchor sliding left and right, carrying four bricks that orbit it.
  e.push({
    kind: 'circle',
    id: 70,
    x: 700,
    y: 420,
    radius: 4,
    collision: false,
    visible: false,
    movement: { type: 'horizontalCycle', period: 700, radius: 60 },
  });
  for (let i = 0; i < 4; i++) {
    e.push({
      kind: 'brick',
      id: 71 + i,
      x: 700,
      y: 420,
      parent: 70,
      movement: { type: 'rotateAroundCircle', period: 300, radius: 40, phase: i / 4 },
    });
  }
  // A ring of pegs on a circle mover, running clockwise.
  for (let i = 0; i < 6; i++) {
    e.push({
      kind: 'peg',
      id: 80 + i,
      x: 220,
      y: 140,
      movement: { type: 'circle', period: 500, radius: 50, phase: i / 6, reverse: true },
    });
  }
  // A peg bobbing up and down with pauses.
  e.push({
    kind: 'peg',
    id: 86,
    x: 760,
    y: 120,
    movement: {
      type: 'verticalCycle',
      period: 200,
      radius: 25,
      pause1: 40,
      pause1At: 25,
      pause2: 30,
      pause2At: 75,
    },
  });
  // Teleports: one moves the ball to the exit marker, one ends the shot.
  e.push({
    kind: 'teleport',
    id: 90,
    x: 60,
    y: 120,
    width: 40,
    height: 40,
    circular: true,
    outDelay: 20,
    exit: { type: 'element', element: 91 },
  });
  e.push({ kind: 'circle', id: 91, x: 900, y: 80, radius: 4, collision: false });
  e.push({
    kind: 'teleport',
    id: 92,
    x: 600,
    y: 520,
    width: 40,
    height: 20,
    exit: { type: 'remove' },
  });
  return level('mixed', e);
}

/**
 * A typical campaign-sized level: 130 colored objects (84 round pegs, 46 bricks) plus solids,
 * a rotating ring and a sliding row. Gaps between objects are wider than the ball, except
 * where pegs form closed shapes, so balls do not wedge.
 */
export function benchLevel(): Level {
  const e: LevelElementInput[] = [];
  const mid = FIXTURE_WIDTH / 2;
  let id = 1;
  // 30 straight bricks: two chains sloping down toward the walls.
  const slope = atan2(8, 25);
  for (let i = 0; i < 15; i++) {
    e.push({ kind: 'brick', id: id++, x: 400 - i * 25, y: 110 + i * 8, rotation: PI / 2 + slope });
    e.push({
      kind: 'brick',
      id: id++,
      x: FIXTURE_WIDTH - 400 + i * 25,
      y: 110 + i * 8,
      rotation: PI / 2 - slope,
    });
  }
  // 12 pegs on a closed ring that turns below the cannon, clear of the barrel tip.
  for (let i = 0; i < 12; i++) {
    e.push({
      kind: 'peg',
      id: id++,
      x: mid,
      y: 185,
      movement: { type: 'rotateAroundCircle', period: 900, radius: 36, phase: i / 12 },
    });
  }
  // 16 curved bricks in two bowls that open upward. A frictionless ball would roll in a bowl
  // forever, so the bottom bricks disappear quickly, as the original's designers did.
  for (let i = 0; i < 8; i++) {
    const a = PI * (1.15 + 0.1 * i);
    for (const cx of [200, FIXTURE_WIDTH - 200]) {
      e.push({
        kind: 'curvedBrick',
        id: id++,
        x: cx + cos(a) * 70,
        y: 250 - sin(a) * 70,
        rotation: a,
        innerRadius: 60,
        sector: PI / 10,
        quickDisappear: i >= 2 && i <= 5,
      });
    }
  }
  // 72 pegs in five staggered rows; the middle row slides left and right.
  for (let row = 0; row < 5; row++) {
    const first = row === 4 ? 1 : 0;
    const last = row === 4 ? 12 : 14;
    for (let col = first; col <= last; col++) {
      e.push({
        kind: 'peg',
        id: id++,
        x: 40 + col * 58 + (row % 2) * 29,
        y: 350 + row * 38,
        ...(row === 2 ? { movement: { type: 'horizontalCycle', period: 600, radius: 29 } } : {}),
      });
    }
  }
  // Solids.
  e.push({ kind: 'circle', id: id++, x: mid, y: 300, radius: 18 });
  e.push({ kind: 'rod', id: id++, x: 40, y: 300, a: { x: -25, y: -12 }, b: { x: 25, y: 12 } });
  e.push({
    kind: 'polygon',
    id,
    x: FIXTURE_WIDTH - 40,
    y: 300,
    vertices: [
      { x: 25, y: -12 },
      { x: 25, y: 12 },
      { x: -25, y: 12 },
    ],
  });
  return level('bench', e);
}
