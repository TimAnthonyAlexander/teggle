import { describe, expect, it } from 'vitest';
import { createSweepHit, sweepCircle, sweepFace } from './collide';

describe('sweepCircle', () => {
  it('finds a head-on contact at the touching distance', () => {
    const h = createSweepHit();
    expect(sweepCircle(0, 0, 10, 0, 20, 0, 15.99, h)).toBe(true);
    expect(h.t).toBeCloseTo((20 - 15.99) / 10, 12);
    expect(h.nx).toBeCloseTo(-1, 12);
    expect(h.ny).toBeCloseTo(0, 12);
    expect(h.overlap).toBe(false);
  });

  it('finds a glancing contact with the normal toward the ball', () => {
    const h = createSweepHit();
    // Moving right along y = 10 past a circle at the origin with reach 15.
    expect(sweepCircle(-30, 10, 40, 0, 0, 0, 15, h)).toBe(true);
    const x = -30 + 40 * h.t;
    expect(x * x + 100).toBeCloseTo(225, 9);
    expect(h.nx).toBeCloseTo(x / 15, 9);
    expect(h.ny).toBeCloseTo(10 / 15, 9);
  });

  it('ignores circles the ball misses, moves away from or does not reach this tick', () => {
    const h = createSweepHit();
    expect(sweepCircle(0, 20, 10, 0, 5, 0, 15, h)).toBe(false);
    expect(sweepCircle(0, 0, -10, 0, 20, 0, 15, h)).toBe(false);
    expect(sweepCircle(0, 0, 4, 0, 20, 0, 15, h)).toBe(false);
  });

  it('reports an overlap at t = 0 with the separating normal', () => {
    const h = createSweepHit();
    expect(sweepCircle(0, -10, 0, 1, 0, 0, 15, h)).toBe(true);
    expect(h.overlap).toBe(true);
    expect(h.t).toBe(0);
    expect(h.ny).toBe(-1);
  });
});

describe('sweepFace', () => {
  // A floor from (0, 100) to (100, 100) whose outward normal points up (y down).
  const floor = [0, 100, 1, 0, 100, 0, -1] as const;

  it('hits a one-sided face from the front', () => {
    const h = createSweepHit();
    expect(sweepFace(50, 80, 0, 20, ...floor, false, 5.99, h)).toBe(true);
    expect(h.t).toBeCloseTo((20 - 5.99) / 20, 12);
    expect([h.nx, h.ny]).toEqual([0, -1]);
  });

  it('lets a ball pass a one-sided face from behind and outside its extent', () => {
    const h = createSweepHit();
    expect(sweepFace(50, 120, 0, -30, ...floor, false, 5.99, h)).toBe(false);
    expect(sweepFace(120, 80, 0, 30, ...floor, false, 5.99, h)).toBe(false);
  });

  it('blocks a two-sided rod from either side', () => {
    const h = createSweepHit();
    expect(sweepFace(50, 120, 0, -30, ...floor, true, 5.99, h)).toBe(true);
    expect([h.nx, h.ny]).toEqual([-0, 1]);
    expect(h.t).toBeCloseTo((20 - 5.99) / 30, 12);
  });

  it('reports an overlap inside the face band', () => {
    const h = createSweepHit();
    expect(sweepFace(50, 97, 1, 0, ...floor, false, 5.99, h)).toBe(true);
    expect(h.overlap).toBe(true);
    expect(h.t).toBe(0);
  });
});
