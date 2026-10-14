import { describe, expect, it } from 'vitest';
import { elementSchema } from '../level/schema';
import {
  BRICK_LENGTH_MAX,
  BRICK_LENGTH_MIN,
  CURVED_SECTOR_MAX,
  JOIN_GAP,
  MIN_GAP,
} from './constants';
import { bricksAlong, bricksAround, pointsAlong } from './place';
import {
  arcPath,
  circlePath,
  ellipsePath,
  flowerPath,
  heartPath,
  PathSampler,
  starPath,
  wavePath,
} from './paths';
import { elementShape, filePose, shapeGap } from './shapes';

function shapes(drafts: readonly object[]) {
  return drafts.map((d, i) => {
    const e = elementSchema.parse({ ...d, id: i + 1 });
    const s = elementShape(e, filePose(e));
    if (s === null) throw new Error('no shape');
    return s;
  });
}

describe('bricks along a path', () => {
  it('uses straight bricks on a straight line, all close to the standard length', () => {
    const line = {
      closed: false,
      points: [
        { x: 100, y: 300 },
        { x: 700, y: 300 },
      ],
    };
    const bricks = bricksAlong(line, 0, 600);
    expect(bricks.every((b) => b.kind === 'brick')).toBe(true);
    for (const b of bricks) {
      if (b.kind !== 'brick') continue;
      expect(b.length).toBeGreaterThanOrEqual(BRICK_LENGTH_MIN);
      expect(b.length).toBeLessThanOrEqual(BRICK_LENGTH_MAX);
    }
  });

  it('uses curved bricks on a curve, none wider than 30 degrees', () => {
    const bricks = bricksAlong(arcPath(400, 300, 60, 0, Math.PI), 0, Math.PI * 60);
    expect(bricks.every((b) => b.kind === 'curvedBrick')).toBe(true);
    for (const b of bricks) {
      if (b.kind === 'curvedBrick') expect(b.sector).toBeLessThanOrEqual(CURVED_SECTOR_MAX + 1e-9);
    }
  });

  /** Free distances between neighbors around a closed chain. */
  function joints(path: Parameters<typeof bricksAround>[0]): number[] {
    const s = shapes(bricksAround(path));
    return s.map((a, i) => {
      const b = s[(i + 1) % s.length];
      return b === undefined ? 0 : shapeGap(a, b);
    });
  }

  it('joins neighbors at a seam around smooth curves', () => {
    for (const path of [circlePath(400, 300, 120), ellipsePath(458, 300, 260, 120)]) {
      for (const g of joints(path)) {
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(JOIN_GAP);
      }
    }
  });

  it('opens a full gap, never a crack, where a bend is too tight for a brick', () => {
    for (const path of [starPath(458, 300, 180, 110, 5, 1), flowerPath(458, 300, 170, 6, 0.3)]) {
      for (const g of joints(path)) {
        expect(g >= 0 && (g <= JOIN_GAP || g >= MIN_GAP)).toBe(true);
      }
    }
  });

  it('leaves an opening where a path has a cusp instead of overlapping', () => {
    const s = shapes(bricksAround(heartPath(458, 300, 300)));
    for (let i = 0; i + 1 < s.length; i++) {
      const a = s[i];
      const b = s[i + 1];
      if (a !== undefined && b !== undefined) expect(shapeGap(a, b)).toBeGreaterThanOrEqual(0);
    }
  });

  it('mixes straight and curved bricks on a wave: straight only near its inflections', () => {
    const count = (amplitude: number) => {
      const s = new PathSampler(wavePath(100, 800, 300, amplitude, 2));
      const bricks = bricksAlong(s, 0, s.length);
      return {
        straight: bricks.filter((b) => b.kind === 'brick').length,
        curved: bricks.filter((b) => b.kind === 'curvedBrick').length,
      };
    };
    const strong = count(50);
    expect(strong.curved).toBeGreaterThan(strong.straight);
    expect(strong.straight).toBeGreaterThan(0);
    const gentle = count(3);
    expect(gentle.straight).toBeGreaterThan(gentle.curved);
  });
});

describe('pegs along a path', () => {
  it('spaces pegs evenly around a closed path', () => {
    const pts = pointsAlong(circlePath(400, 300, 100), { spacing: 40 });
    expect(pts.length).toBe(Math.round((2 * Math.PI * 100) / 40));
    const d = (i: number) => {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      return a === undefined || b === undefined ? 0 : Math.hypot(b.x - a.x, b.y - a.y);
    };
    for (let i = 0; i < pts.length; i++) expect(d(i)).toBeCloseTo(d(0), 0);
  });
});
