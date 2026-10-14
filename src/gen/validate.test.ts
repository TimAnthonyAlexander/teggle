import { describe, expect, it } from 'vitest';
import { HALF_PI } from '../core/dmath';
import { parseLevel, type Level, type LevelElementInput } from '../level/schema';
import { compileLevel } from '../sim/compile';
import { World } from '../sim/world';
import {
  BALL_RADIUS,
  BOARD_H,
  BOARD_W,
  BRICK_LENGTH,
  CANNON_X,
  JOIN_GAP,
  MIN_GAP,
  PEG_RADIUS,
} from './constants';
import { levelCycle, validateLevel } from './validate';

function level(elements: LevelElementInput[]): Level {
  return parseLevel({
    formatVersion: 1,
    name: 'test',
    background: 'test',
    board: { width: BOARD_W, height: BOARD_H },
    elements,
  });
}

const kinds = (l: Level) => validateLevel(l).map((i) => i.kind);

describe('validity checks', () => {
  it('passes a clean layout', () => {
    expect(
      kinds(
        level([
          { kind: 'peg', id: 1, x: 200, y: 300 },
          { kind: 'peg', id: 2, x: 200 + 2 * PEG_RADIUS + MIN_GAP, y: 300 },
        ]),
      ),
    ).toEqual([]);
  });

  it('finds overlaps between the exact shapes', () => {
    const issues = validateLevel(
      level([
        { kind: 'peg', id: 1, x: 300, y: 300 },
        // A flat brick whose end reaches under the peg.
        { kind: 'brick', id: 2, x: 300 + 26, y: 300 + 12, rotation: HALF_PI, length: 35 },
      ]),
    );
    expect(issues).toMatchObject([{ kind: 'overlap', a: 1, b: 2 }]);
  });

  it('finds gaps narrower than the minimum', () => {
    const issues = validateLevel(
      level([
        { kind: 'peg', id: 1, x: 300, y: 300 },
        { kind: 'peg', id: 2, x: 300 + 2 * PEG_RADIUS + MIN_GAP - 0.5, y: 300 },
      ]),
    );
    expect(issues).toMatchObject([{ kind: 'gap', a: 1, b: 2 }]);
    expect(issues[0]?.gap).toBeCloseTo(MIN_GAP - 0.5, 9);
  });

  it('lets bricks join at a seam but not leave a crack the ball could wedge in', () => {
    const row = (seam: number): LevelElementInput[] => [
      { kind: 'brick', id: 1, x: 300, y: 300, rotation: HALF_PI, length: BRICK_LENGTH },
      {
        kind: 'brick',
        id: 2,
        x: 300 + BRICK_LENGTH + seam,
        y: 300,
        rotation: HALF_PI,
        length: BRICK_LENGTH,
      },
    ];
    expect(kinds(level(row(1)))).toEqual([]);
    expect(kinds(level(row(JOIN_GAP + 0.5)))).toEqual(['gap']);
    expect(kinds(level(row(-1)))).toEqual(['overlap']);
  });

  it('keeps everything on the board, off the cannon and above the bucket', () => {
    expect(kinds(level([{ kind: 'peg', id: 1, x: 5, y: 300 }]))).toEqual(['outside']);
    expect(kinds(level([{ kind: 'peg', id: 1, x: CANNON_X, y: 130 }]))).toEqual(['cannon']);
    expect(kinds(level([{ kind: 'peg', id: 1, x: 300, y: 520 }]))).toEqual(['bottom']);
  });

  it('checks moving parts over their whole cycle', () => {
    // A peg sliding 60 px either way passes a static peg 50 px to its right.
    const issues = validateLevel(
      level([
        {
          kind: 'peg',
          id: 1,
          x: 300,
          y: 300,
          movement: { type: 'horizontalCycle', period: 400, radius: 60 },
        },
        { kind: 'peg', id: 2, x: 350, y: 300 },
      ]),
    );
    expect(issues.map((i) => i.kind)).toContain('overlap');
    expect(issues.find((i) => i.kind === 'overlap')?.tick).toBeGreaterThanOrEqual(0);
  });

  it('computes the full cycle of all movements', () => {
    const l = level([
      { kind: 'peg', id: 1, x: 200, y: 300, movement: { type: 'circle', period: 600, radius: 10 } },
      { kind: 'peg', id: 2, x: 400, y: 300, movement: { type: 'circle', period: 800, radius: 10 } },
    ]);
    expect(levelCycle(l)).toEqual({ ticks: 2400, exact: true });
  });
});

describe('the gap rule, in the simulation', () => {
  /** Drops balls onto two pegs side by side with a free gap; counts balls that come to rest. */
  function wedged(gap: number): number {
    const x0 = 400;
    const x1 = x0 + 2 * PEG_RADIUS + gap;
    const compiled = compileLevel(
      level([
        { kind: 'peg', id: 1, x: x0, y: 300 },
        { kind: 'peg', id: 2, x: x1, y: 300 },
      ]),
    );
    const w = new World(compiled);
    let rested = 0;
    const mid = (x0 + x1) / 2;
    for (let dx = -14; dx <= 14; dx += 1.7) {
      for (const vx of [-0.4, 0.2]) {
        w.discardBalls();
        w.spawnBall({ x: mid + dx, y: 240, vx, vy: 0 });
        for (let t = 0; t < 2000 && w.ballsInPlay > 0; t++) {
          w.step();
          const b = w.balls[0];
          if (b !== undefined && b.stuckTicks >= 300) {
            // Wedged: resting between the two pegs, touching both.
            if (Math.abs(b.x - mid) < PEG_RADIUS && b.y < 300) rested++;
            break;
          }
        }
      }
    }
    return rested;
  }

  it('wedges a ball in a gap just under its diameter', () => {
    expect(2 * BALL_RADIUS).toBe(12);
    expect(wedged(11.5)).toBeGreaterThan(0);
  });

  it('lets every ball through at the minimum gap', () => {
    expect(wedged(MIN_GAP)).toBe(0);
  });
});
