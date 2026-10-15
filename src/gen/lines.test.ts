import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../level/geometry';
import {
  linePaths,
  LinesFormatError,
  parseLines,
  SAMPLE_STEP,
  smoothLine,
  type LineGeometryInput,
} from './lines';

function file(lines: unknown[]): unknown {
  return {
    formatVersion: 1,
    background: 's1-test',
    board: { width: 916, height: 560 },
    lines,
  };
}

function contains(points: readonly Vec2[], x: number, y: number): boolean {
  return points.some((p) => p.x === x && p.y === y);
}

function geometry(g: LineGeometryInput): {
  closed: boolean;
  points: [number, number][];
  corners: number[];
} {
  return { closed: g.closed ?? false, points: g.points, corners: g.corners ?? [] };
}

describe('lines file', () => {
  it('parses a file and fills in defaults', () => {
    const f = parseLines(
      file([
        {
          id: 'arc',
          mode: 'pegs',
          points: [
            [100, 100],
            [200, 150],
            [300, 100],
          ],
        },
        {
          id: 'ring',
          mode: 'bricks',
          closed: true,
          points: [
            [400, 200],
            [480, 260],
            [400, 320],
          ],
          corners: [0],
        },
      ]),
    );
    expect(f.lines[0]).toMatchObject({ closed: false, corners: [] });
    expect(f.lines[1]?.corners).toEqual([0]);
  });

  it('rejects duplicate ids, points off the board, repeated points and bad corners', () => {
    const line = {
      id: 'a',
      mode: 'pegs',
      points: [
        [10, 10],
        [60, 10],
      ],
    };
    expect(() => parseLines(file([line, line]))).toThrow(/duplicate line id "a"/);
    expect(() =>
      parseLines(
        file([
          {
            ...line,
            points: [
              [10, 10],
              [960, 10],
            ],
          },
        ]),
      ),
    ).toThrow(/outside the board/);
    expect(() =>
      parseLines(
        file([
          {
            ...line,
            points: [
              [10, 10],
              [10.5, 10],
              [60, 10],
            ],
          },
        ]),
      ),
    ).toThrow(/closer than 1 px/);
    expect(() => parseLines(file([{ ...line, corners: [2] }]))).toThrow(/corner 2 is not a point/);
    expect(() => parseLines(file([{ ...line, closed: true }]))).toThrow(
      /closed line needs 3 points/,
    );
    expect(() => parseLines(file([{ ...line, id: 'Not A Slug' }]))).toThrow(LinesFormatError);
    expect(() => parseLines({ ...(file([]) as object), formatVersion: 2 })).toThrow(
      LinesFormatError,
    );
  });

  it('hands named lines to the outline template in the order asked', () => {
    const f = parseLines(
      file([
        {
          id: 'one',
          mode: 'pegs',
          points: [
            [10, 10],
            [60, 10],
          ],
          spacing: 40,
        },
        {
          id: 'two',
          mode: 'bricks',
          points: [
            [10, 50],
            [60, 50],
            [90, 80],
          ],
          corners: [1],
        },
      ]),
    );
    expect(linePaths(f, ['two', 'one'])).toEqual([
      {
        mode: 'bricks',
        closed: false,
        points: [
          [10, 50],
          [60, 50],
          [90, 80],
        ],
        corners: [1],
      },
      {
        mode: 'pegs',
        closed: false,
        points: [
          [10, 10],
          [60, 10],
        ],
        spacing: 40,
      },
    ]);
    expect(() => linePaths(f, ['three'])).toThrow(/no line "three"/);
  });
});

describe('smoothLine', () => {
  it('passes through every control point', () => {
    const pts: [number, number][] = [
      [100, 300],
      [180, 220],
      [300, 260],
      [380, 180],
      [460, 240],
    ];
    const out = smoothLine({ closed: false, points: pts, corners: [] }).points;
    for (const [x, y] of pts) expect(contains(out, x, y)).toBe(true);
    expect(out[0]).toEqual({ x: 100, y: 300 });
    expect(out[out.length - 1]).toEqual({ x: 460, y: 240 });
  });

  it('samples at most SAMPLE_STEP apart', () => {
    const out = smoothLine({
      closed: false,
      points: [
        [100, 300],
        [200, 200],
        [300, 300],
      ],
      corners: [],
    }).points;
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1];
      const b = out[i];
      if (a === undefined || b === undefined) continue;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(SAMPLE_STEP * 1.2);
    }
  });

  it('keeps points in a straight row straight', () => {
    const out = smoothLine({
      closed: false,
      points: [
        [100, 100],
        [130, 115],
        [220, 160],
        [240, 170],
      ],
      corners: [],
    }).points;
    for (const p of out) expect(Math.abs(p.y - 100 - 0.5 * (p.x - 100))).toBeLessThan(1e-9);
  });

  it('makes sharp corners, with straight segments between neighboring corners', () => {
    const out = smoothLine(
      geometry({
        mode: 'bricks',
        points: [
          [200, 200],
          [200, 420],
          [420, 420],
        ],
        corners: [1],
      }),
    ).points;
    expect(out).toEqual([
      { x: 200, y: 200 },
      { x: 200, y: 420 },
      { x: 420, y: 420 },
    ]);
  });

  it('makes no loop or wide swing where a long chord follows a short one', () => {
    // Centripetal knots: the curve keeps moving right and stays within a pixel of the points' box.
    const out = smoothLine({
      closed: false,
      points: [
        [100, 300],
        [110, 300],
        [400, 100],
        [410, 100],
      ],
      corners: [],
    }).points;
    for (let i = 1; i < out.length; i++) {
      expect(out[i]?.x ?? 0).toBeGreaterThan(out[i - 1]?.x ?? 0);
    }
    for (const p of out) {
      expect(p.y).toBeGreaterThan(99);
      expect(p.y).toBeLessThan(301);
    }
  });

  it('closes a ring smoothly through eight points on a circle', () => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      pts.push([458 + 100 * Math.cos(a), 280 + 100 * Math.sin(a)]);
    }
    const path = smoothLine({ closed: true, points: pts, corners: [] });
    expect(path.closed).toBe(true);
    const first = path.points[0];
    const last = path.points[path.points.length - 1];
    expect(first).not.toEqual(last);
    for (const p of path.points) {
      expect(Math.abs(Math.hypot(p.x - 458, p.y - 280) - 100)).toBeLessThan(2.5);
    }
  });

  it('closes a ring with corners: straight sides between corners', () => {
    const square = smoothLine({
      closed: true,
      points: [
        [100, 100],
        [200, 100],
        [200, 200],
        [100, 200],
      ],
      corners: [0, 1, 2, 3],
    });
    expect(square.points).toEqual([
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ]);
  });

  it('gives the same points for the same line', () => {
    const line = {
      closed: true,
      points: [
        [300, 300],
        [380, 260],
        [420, 340],
        [330, 380],
      ] as [number, number][],
      corners: [2],
    };
    expect(smoothLine(line)).toEqual(smoothLine(line));
  });
});
