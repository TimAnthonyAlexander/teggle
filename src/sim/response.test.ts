import { describe, expect, it } from 'vitest';
import { createContactResult, respondCircle, respondLine } from './response';
import { CIRCLE_BOUNCY, CIRCLE_ROLLY, LINE_BOUNCY, LINE_ROLLY } from './tuning';

const ball = (vx: number, vy: number) => ({ x: 0, y: 0, vx, vy });

describe('respondCircle (research 4.3)', () => {
  it('bounces with normal restitution 2b - 1 = 0.8 and keeps the tangential speed', () => {
    const b = ball(1, 5);
    const r = createContactResult();
    respondCircle(b, 0, -1, 0, 0, CIRCLE_BOUNCY, CIRCLE_ROLLY, r);
    expect(r).toEqual({ applied: true, slide: false, impact: 5 });
    expect(b.vx).toBe(1);
    expect(b.vy).toBeCloseTo(-4, 12);
  });

  it('slides when b times the approach speed is at most the rolly threshold', () => {
    const b = ball(2, 1);
    const r = createContactResult();
    respondCircle(b, 0, -1, 0, 0, CIRCLE_BOUNCY, CIRCLE_ROLLY, r);
    expect(r.slide).toBe(true);
    // 1 - b of the approach remains.
    expect(b.vy).toBeCloseTo(0.1, 12);
    expect(b.vx).toBe(2);
  });

  it('uses the velocity relative to a moving peg', () => {
    const b = ball(0, 0);
    const r = createContactResult();
    // A peg below the ball rising at 3 px/tick.
    respondCircle(b, 0, -1, 0, -3, CIRCLE_BOUNCY, CIRCLE_ROLLY, r);
    expect(r.impact).toBe(3);
    expect(b.vy).toBeCloseTo(-5.4, 12);
  });

  it('leaves a separating ball alone', () => {
    const b = ball(0, -2);
    const r = createContactResult();
    respondCircle(b, 0, -1, 0, 0, CIRCLE_BOUNCY, CIRCLE_ROLLY, r);
    expect(r.applied).toBe(false);
    expect(b.vy).toBe(-2);
  });
});

describe('respondLine (research 4.3)', () => {
  it('scales the whole reflected velocity by b on a static surface', () => {
    const b = ball(3, 4);
    const r = createContactResult();
    respondLine(b, 0, -1, 0, 0, 0, 0, LINE_BOUNCY, LINE_ROLLY, 0, r);
    expect(r.slide).toBe(false);
    expect(b.vx).toBeCloseTo(3 * 0.82, 12);
    expect(b.vy).toBeCloseTo(-4 * 0.82, 12);
  });

  it('slides below the threshold, dropping the normal speed only', () => {
    const b = ball(3, 1);
    const r = createContactResult();
    respondLine(b, 0, -1, 0, 0, 0, 0, LINE_BOUNCY, LINE_ROLLY, 0, r);
    expect(r.slide).toBe(true);
    expect(b.vx).toBe(3);
    expect(b.vy).toBe(0);
  });

  it('makes near-vertical surfaces bounce by multiplying the impact by 5', () => {
    const b = ball(-0.5, 0);
    const r = createContactResult();
    respondLine(b, 1, 0, 0, 0, 0, 0, LINE_BOUNCY, LINE_ROLLY, 0, r);
    expect(r.slide).toBe(false);
    expect(b.vx).toBeCloseTo(0.5 * 0.82, 12);
  });

  it('lets a moving platform slide under a resting ball (Teggle reading, spec 14.2)', () => {
    const b = ball(0, 0.05);
    const r = createContactResult();
    respondLine(b, 0, -1, 1, 0, 0, 0, LINE_BOUNCY, LINE_ROLLY, 0, r);
    expect(r.slide).toBe(true);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it('pushes the ball with a surface moving into it and caps the bounce speed', () => {
    const b = ball(0, 4);
    const r = createContactResult();
    respondLine(b, 0, -1, 0, -3, 0, 0, LINE_BOUNCY, LINE_ROLLY, 0, r);
    // Reflected and scaled: -3.28; plus the surface velocity times (1 + b): -5.46.
    expect(b.vy).toBeCloseTo(-3.28 - 5.46, 12);
    expect(b.y).toBeCloseTo(-5.46, 12);

    const capped = ball(0, 4);
    respondLine(capped, 0, -1, 0, -3, 0, 0, LINE_BOUNCY, LINE_ROLLY, 7, r);
    expect(Math.hypot(capped.vx, capped.vy)).toBeCloseTo(7, 12);
  });

  it('adds rotational surface velocity (a flipper swinging up)', () => {
    const b = ball(0, 2);
    const r = createContactResult();
    respondLine(b, 0, -1, 0, 0, 0, -2, LINE_BOUNCY, LINE_ROLLY, 0, r);
    expect(r.impact).toBe(4);
    expect(b.vy).toBeCloseTo(-2 * 0.82 - 2 * 1.82, 12);
  });
});
