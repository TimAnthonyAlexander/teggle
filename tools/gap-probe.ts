// Finds the smallest gap between two objects at which a ball cannot come to rest in it.
// Two objects (peg/peg, peg/brick, brick/brick, peg/wall) are placed with a free gap g along
// an axis tilted by theta from horizontal; balls are dropped onto the gap from above at many
// offsets and speeds. A drop counts as wedged when the ball's stuck counter reaches 300 ticks
// (no 2 px progress for 3 s) while it is still near the pair. Prints, per configuration, the
// widest gap that wedged a ball, and the overall result recorded in spec 14.2.
//
// Usage: npx tsx tools/gap-probe.ts

import { cos, HALF_PI, PI, sin } from '../src/core/dmath';
import { parseLevel, type LevelElementInput } from '../src/level/schema';
import { compileLevel } from '../src/sim/compile';
import { World } from '../src/sim/world';
import { elementShape, filePose, pointGap, shapeGap } from '../src/gen/shapes';
import { BALL_RADIUS, BOARD_H, BOARD_W, PEG_RADIUS } from '../src/gen/constants';

const CX = 458;
const CY = 300;
const STUCK = 300;
const MAX_TICKS = 2500;

type Piece = { kind: 'peg' } | { kind: 'brick'; tilt: number } | { kind: 'curved'; facing: number };

interface Config {
  readonly name: string;
  readonly a: Piece;
  readonly b: Piece;
  /** Axis from a to b, radians from horizontal (positive = b higher). */
  readonly theta: number;
}

function piece(p: Piece, x: number, y: number, id: number): LevelElementInput {
  switch (p.kind) {
    case 'peg':
      return { kind: 'peg', id, x, y };
    case 'brick':
      return { kind: 'brick', id, x, y, rotation: p.tilt, length: 35, width: 20 };
    case 'curved':
      return {
        kind: 'curvedBrick',
        id,
        x,
        y,
        rotation: p.facing,
        innerRadius: 35,
        width: 20,
        sector: PI / 6,
        points: 4,
      };
  }
}

function gapOf(elements: LevelElementInput[]): number {
  const level = parseLevel({
    formatVersion: 1,
    name: 'probe',
    background: 'probe',
    board: { width: BOARD_W, height: BOARD_H },
    elements,
  });
  const [a, b] = level.elements;
  if (a === undefined || b === undefined) return Infinity;
  const sa = elementShape(a, filePose(a));
  const sb = elementShape(b, filePose(b));
  return sa === null || sb === null ? Infinity : shapeGap(sa, sb);
}

/** Places b along the axis from a so that the free gap is g (bisection on the distance). */
function pair(c: Config, g: number): LevelElementInput[] {
  const ux = cos(c.theta);
  const uy = -sin(c.theta);
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const els = [
      piece(c.a, CX - (ux * mid) / 2, CY - (uy * mid) / 2, 1),
      piece(c.b, CX + (ux * mid) / 2, CY + (uy * mid) / 2, 2),
    ];
    if (gapOf(els) < g) lo = mid;
    else hi = mid;
  }
  return [
    piece(c.a, CX - (ux * hi) / 2, CY - (uy * hi) / 2, 1),
    piece(c.b, CX + (ux * hi) / 2, CY + (uy * hi) / 2, 2),
  ];
}

/** A ball touches a shape when its center is within its radius (plus a little) of it. */
const TOUCH = BALL_RADIUS + 0.5;

/**
 * Drops balls over the pair; returns how many came to rest touching both objects, that is,
 * wedged in the gap. Balls balanced on a single object (a peg's apex hit dead center, a flat
 * brick's top) are a different case: the stuck check handles those on real levels.
 */
function wedges(elements: LevelElementInput[]): number {
  const parsed = parseLevel({
    formatVersion: 1,
    name: 'probe',
    background: 'probe',
    board: { width: BOARD_W, height: BOARD_H },
    elements,
  });
  const shapes = parsed.elements.flatMap((e) => elementShape(e, filePose(e)) ?? []);
  const level = compileLevel(parsed);
  const base = new World(level);
  const w = new World(level);
  let stuck = 0;
  for (let dx = -24; dx <= 24; dx += 1.37) {
    for (const vx of [-0.6, -0.15, 0.15, 0.6]) {
      for (const drop of [40, 110]) {
        w.copyFrom(base);
        w.spawnBall({ x: CX + dx, y: CY - drop, vx, vy: 0 });
        let rested = false;
        for (let t = 0; t < MAX_TICKS && w.ballsInPlay > 0; t++) {
          w.step();
          const ball = w.balls[0];
          if (ball !== undefined && ball.stuckTicks >= STUCK) {
            rested = shapes.every((s) => pointGap(s, ball.x, ball.y) <= TOUCH);
            break;
          }
        }
        w.discardBalls();
        if (rested) stuck++;
      }
    }
  }
  return stuck;
}

const deg = (d: number): number => (d * PI) / 180;
const THETAS = [0, 10, 20, 30, 45];
const CONFIGS: Config[] = [];
for (const t of THETAS) {
  CONFIGS.push({ name: `peg/peg ${t}`, a: { kind: 'peg' }, b: { kind: 'peg' }, theta: deg(t) });
  CONFIGS.push({
    name: `peg/flat brick ${t}`,
    a: { kind: 'peg' },
    b: { kind: 'brick', tilt: HALF_PI },
    theta: deg(t),
  });
  CONFIGS.push({
    name: `peg/standing brick ${t}`,
    a: { kind: 'peg' },
    b: { kind: 'brick', tilt: 0 },
    theta: deg(t),
  });
  CONFIGS.push({
    name: `brick V 30 ${t}`,
    a: { kind: 'brick', tilt: HALF_PI + deg(30) },
    b: { kind: 'brick', tilt: HALF_PI - deg(30) },
    theta: deg(t),
  });
  CONFIGS.push({
    name: `brick V 60 ${t}`,
    a: { kind: 'brick', tilt: HALF_PI + deg(60) },
    b: { kind: 'brick', tilt: HALF_PI - deg(60) },
    theta: deg(t),
  });
  CONFIGS.push({
    name: `flat/flat ${t}`,
    a: { kind: 'brick', tilt: HALF_PI },
    b: { kind: 'brick', tilt: HALF_PI },
    theta: deg(t),
  });
  CONFIGS.push({
    name: `curved/curved ${t}`,
    a: { kind: 'curved', facing: deg(120) },
    b: { kind: 'curved', facing: deg(60) },
    theta: deg(t),
  });
}

// Coarse steps up to 11, then 0.1 px steps around the ball's diameter (12).
const GAPS: number[] = [];
for (let g = 4; g < 11; g += 0.5) GAPS.push(g);
for (let g = 110; g <= 140; g += 1) GAPS.push(g / 10);

let worst = 0;
for (const c of CONFIGS) {
  let widest = -1;
  for (const g of GAPS) {
    if (wedges(pair(c, g)) > 0) widest = g;
  }
  worst = Math.max(worst, widest);
  console.log(`${c.name.padEnd(26)} widest wedging gap: ${widest < 0 ? 'none' : widest}`);
}
// A peg whose edge is g from the left wall: the ball wedges when it rests touching both.
let wallWidest = -1;
for (const g of GAPS) {
  const px = PEG_RADIUS + g;
  const level = compileLevel(
    parseLevel({
      formatVersion: 1,
      name: 'probe',
      background: 'probe',
      board: { width: BOARD_W, height: BOARD_H },
      elements: [{ kind: 'peg', id: 1, x: px, y: CY }],
    }),
  );
  const w = new World(level);
  let rested = false;
  for (let x = 6.5; x <= px + 14 && !rested; x += 0.73) {
    for (const vx of [-0.6, -0.15, 0.15]) {
      w.discardBalls();
      w.spawnBall({ x, y: CY - 60, vx, vy: 0 });
      for (let t = 0; t < MAX_TICKS && w.ballsInPlay > 0; t++) {
        w.step();
        const ball = w.balls[0];
        if (ball !== undefined && ball.stuckTicks >= STUCK) {
          const touchesPeg = Math.hypot(ball.x - px, ball.y - CY) <= PEG_RADIUS + TOUCH;
          rested = rested || (touchesPeg && ball.x <= TOUCH);
          break;
        }
      }
    }
  }
  w.discardBalls();
  if (rested) wallWidest = g;
}
worst = Math.max(worst, wallWidest);
console.log(`${'peg/wall'.padEnd(26)} widest wedging gap: ${wallWidest < 0 ? 'none' : wallWidest}`);
console.log(`\nWidest gap that wedged a ball anywhere: ${worst}`);
