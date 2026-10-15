import { describe, expect, it } from 'vitest';
import { HALF_PI, PI } from '../core/dmath';
import { Track, type TrackPoint } from './track';

function at(t: Track, s: number): TrackPoint {
  return t.at(s, { x: 0, y: 0, turn: 0 });
}

describe('Track', () => {
  // A 100 x 50 rectangle, clockwise on screen: right, down, left, up.
  const box = new Track(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ],
    true,
  );

  it('measures a closed track with its closing segment and walks it by arc length', () => {
    expect(box.length).toBe(300);
    expect(at(box, 130)).toMatchObject({ x: 100, y: 30 });
    expect(at(box, 260)).toMatchObject({ x: 0, y: 40 });
    // Arc length wraps onto the loop, forward and backward.
    expect(at(box, 430)).toMatchObject({ x: 100, y: 30 });
    expect(at(box, -40)).toMatchObject({ x: 0, y: 40 });
  });

  it('turns with the track: a clockwise loop turns a full turn clockwise', () => {
    // Every vertex's tangent is the mean of its two segments, so the start vertex faces 45
    // degrees up from the first segment, and the tangent is linear in between: the middle of
    // each segment faces along it.
    expect(at(box, 0).turn).toBe(0);
    expect(at(box, 50).turn).toBeCloseTo(-PI / 4, 12);
    expect(at(box, 100).turn).toBeCloseTo(-HALF_PI, 12);
    expect(at(box, 125).turn).toBeCloseTo(-3 * (PI / 4), 12);
    expect(at(box, 200).turn).toBeCloseTo(-5 * (PI / 4), 12);
    expect(at(box, 299.999).turn).toBeCloseTo(-2 * PI, 3);
  });

  it('clamps an open track to its ends', () => {
    const line = new Track(
      [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
        { x: 60, y: 0 },
      ],
      false,
    );
    expect(line.length).toBe(100);
    expect(at(line, -5)).toMatchObject({ x: 0, y: 0, turn: 0 });
    expect(at(line, 50)).toMatchObject({ x: 30, y: 40 });
    const end = at(line, 140);
    expect([end.x, end.y]).toEqual([60, 0]);
    // Down-right then up-right: the second segment points 2 * atan(4/3) further counterclockwise.
    expect(end.turn).toBeCloseTo(2 * Math.atan2(4, 3), 12);
  });
});
