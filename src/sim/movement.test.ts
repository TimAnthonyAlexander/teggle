import { describe, expect, it } from 'vitest';
import { HALF_PI, PI } from '../core/dmath';
import type { Movement, MovementInput } from '../level/schema';
import { movementSchema } from '../level/schema';
import { movementPhase, movementPose, type Pose } from './movement';

function mover(m: MovementInput): Movement {
  return movementSchema.parse(m);
}

function pose(m: Movement, tick: number, baseRotation = 0): Pose {
  return movementPose(m, 100, 200, baseRotation, tick, { x: 0, y: 0, rotation: 0 });
}

function expectPose(p: Pose, x: number, y: number, rotation?: number): void {
  expect(p.x).toBeCloseTo(x, 9);
  expect(p.y).toBeCloseTo(y, 9);
  if (rotation !== undefined) expect(p.rotation).toBeCloseTo(rotation, 9);
}

describe('movementPhase (research 3.2)', () => {
  it('runs the clock with offset and start phase, wrapping negative clocks forward', () => {
    const m = mover({ type: 'circle', period: 200, offset: 10, phase: 0.25 });
    expect(movementPhase(m, 0)).toBe(60 / 200);
    expect(movementPhase(m, 150)).toBe(10 / 200);
    expect(movementPhase(mover({ type: 'circle', period: 200, offset: -30 }), 0)).toBe(170 / 200);
  });

  it('holds at both pause points for their durations', () => {
    // 100-tick cycle, pause of 20 at 25% and 10 at 75%: 130 ticks in all.
    const m = mover({
      type: 'circle',
      period: 100,
      pause1: 20,
      pause1At: 25,
      pause2: 10,
      pause2At: 75,
    });
    const phases = Array.from({ length: 130 }, (_, t) => Math.round(movementPhase(m, t) * 100));
    expect(phases.slice(0, 26)).toEqual(Array.from({ length: 26 }, (_, t) => t));
    // Holds at 25 until the first pause has run.
    expect(phases.slice(25, 46).every((p) => p === 25)).toBe(true);
    expect(phases[46]).toBe(26);
    // Reaches 75 and holds again.
    expect(phases.slice(95, 106).every((p) => p === 75)).toBe(true);
    expect(phases[106]).toBe(76);
    expect(movementPhase(m, 130)).toBe(0);
  });

  it('ignores pauses unless pause1 is set', () => {
    const m = mover({ type: 'circle', period: 100 });
    expect(movementPhase(m, 30)).toBe(0.3);
  });
});

describe('movementPose (research 3.3)', () => {
  const quarter = 50;
  const half = 100;

  it('verticalCycle starts at the anchor moving up', () => {
    const m = mover({ type: 'verticalCycle', period: 200, radius: 30 });
    expectPose(pose(m, 0), 100, 200);
    expectPose(pose(m, quarter), 100, 170);
    expectPose(pose(m, 3 * quarter), 100, 230);
  });

  it('horizontalCycle starts at the right end', () => {
    const m = mover({ type: 'horizontalCycle', period: 200, radius: 40 });
    expectPose(pose(m, 0), 140, 200);
    expectPose(pose(m, half), 60, 200);
  });

  it('circle runs counterclockwise on screen, reverse runs clockwise, radius2 makes an ellipse', () => {
    const m = mover({ type: 'circle', period: 200, radius: 40, radius2: 20 });
    expectPose(pose(m, 0), 140, 200);
    expectPose(pose(m, quarter), 100, 180);
    const r = mover({ type: 'circle', period: 200, radius: 40, reverse: true });
    expectPose(pose(r, quarter), 100, 240);
  });

  it('horizontalInfinity and verticalInfinity trace figure eights', () => {
    const h = mover({ type: 'horizontalInfinity', period: 200, radius: 40, radius2: 20 });
    expectPose(pose(h, 25), 100 + 40 * Math.cos(PI / 4), 200 - 10);
    expectPose(pose(h, half), 60, 200);
    const v = mover({ type: 'verticalInfinity', period: 200, radius: 40, radius2: 20 });
    expectPose(pose(v, 25), 140, 200 - 20 * Math.sin(PI / 4));
    expectPose(pose(v, quarter), 100, 180);
  });

  it('horizontalArc eases out to the span and back', () => {
    const m = mover({ type: 'horizontalArc', period: 200, radius: 40 });
    expectPose(pose(m, 0), 140, 200);
    // Halfway the swing reaches PI: the left end of the upper half ellipse.
    expectPose(pose(m, half), 60, 200);
    expectPose(pose(m, quarter), 100, 160);
    const short = mover({ type: 'horizontalArc', period: 200, radius: 40, maxAngle: HALF_PI });
    expectPose(pose(short, half), 100, 160);
  });

  it('verticalArc swings over the right half of the ellipse (Teggle reading, spec 14.2)', () => {
    const m = mover({ type: 'verticalArc', period: 200, radius: 40, radius2: 30 });
    expectPose(pose(m, 0), 100, 170);
    expectPose(pose(m, quarter), 140, 200);
    expectPose(pose(m, half), 100, 230);
  });

  it('rotate turns once per cycle and ignores maxAngle', () => {
    const m = mover({ type: 'rotate', period: 200, maxAngle: 1 });
    expectPose(pose(m, quarter, 0.5), 100, 200, 0.5 + HALF_PI);
    expectPose(
      pose(mover({ type: 'rotate', period: 200, reverse: true }), quarter),
      100,
      200,
      -HALF_PI,
    );
  });

  it('rotateBackAndForth swings by maxAngle and adds pathRotation', () => {
    const m = mover({ type: 'rotateBackAndForth', period: 200, maxAngle: 0.5, pathRotation: 0.1 });
    expectPose(pose(m, 0, 1), 100, 200, 1.1);
    expectPose(pose(m, quarter, 1), 100, 200, 1.6);
    expectPose(pose(m, 3 * quarter, 1), 100, 200, 0.6);
  });

  it('wraps travel linearly and jump back each cycle', () => {
    const h = mover({ type: 'horizontalWrap', period: 200, radius: 300 });
    expectPose(pose(h, half), 250, 200);
    expectPose(pose(h, 200), 100, 200);
    const v = mover({ type: 'verticalWrap', period: 200, radius: 300, reverse: true });
    expectPose(pose(v, half), 100, 350);
  });

  it('rotateAroundCircle turns the element with its travel, on circles and ellipses alike', () => {
    const c = mover({ type: 'rotateAroundCircle', period: 200, radius: 40 });
    expectPose(pose(c, quarter, 0.2), 100, 160, 0.2 + HALF_PI);
    const e = mover({ type: 'rotateAroundCircle', period: 200, radius: 40, radius2: 40 });
    // radius2 equal to radius takes the ellipse branch, which must agree with the circle.
    expectPose(pose(e, 30, 0.2), pose(c, 30, 0.2).x, pose(c, 30, 0.2).y, pose(c, 30, 0.2).rotation);
    const wide = mover({ type: 'rotateAroundCircle', period: 200, radius: 60, radius2: 20 });
    // At the top of the ellipse the outward normal points straight up, as on a circle.
    expectPose(pose(wide, quarter), 100, 180, HALF_PI);
    expect(pose(wide, 10).rotation).toBeGreaterThan(0);
  });

  it('pathRotation turns the whole path counterclockwise about the anchor', () => {
    const m = mover({ type: 'horizontalCycle', period: 200, radius: 40, pathRotation: HALF_PI });
    expectPose(pose(m, 0), 100, 160);
  });

  it('is translation invariant to the bit, so tabulated offsets equal direct poses', () => {
    const m = mover({
      type: 'circle',
      period: 333,
      radius: 37.3,
      radius2: 11.1,
      pathRotation: 0.7,
    });
    for (let t = 0; t < 333; t += 7) {
      const at = movementPose(m, 123.456, 78.9, 0, t, { x: 0, y: 0, rotation: 0 });
      const rel = movementPose(m, 0, 0, 0, t, { x: 0, y: 0, rotation: 0 });
      expect(at.x).toBe(123.456 + rel.x);
      expect(at.y).toBe(78.9 + rel.y);
    }
  });
});
