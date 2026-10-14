import { describe, expect, it } from 'vitest';
import { MAX_AIM_ANGLE } from '../../sim/tuning';
import {
  AimController,
  ARROW_STEP,
  JITTER_TICKS,
  MOUSE_IGNORE_TICKS,
  SETTLE_TICKS,
  TURN_RATE,
  WHEEL_STEP,
} from './aim';

function ticks(aim: AimController, n: number): void {
  for (let i = 0; i < n; i++) aim.tick();
}

describe('cannon aim', () => {
  it('turns toward the pointer at 0.2 rad per tick', () => {
    const aim = new AimController();
    aim.pointAt(100, 0, 0, -100, true);
    expect(aim.target).toBeCloseTo(Math.PI / 4, 12);
    aim.tick();
    expect(aim.angle).toBeCloseTo(TURN_RATE, 12);
    ticks(aim, 3);
    expect(aim.arrived).toBe(true);
    expect(aim.angle).toBe(aim.target);
  });

  it('stays within 97 degrees either side of straight down', () => {
    const aim = new AimController();
    aim.pointAt(-50, -400, 0, 0, true);
    expect(aim.target).toBe(-MAX_AIM_ANGLE);
    aim.nudge(-1);
    expect(aim.target).toBe(-MAX_AIM_ANGLE);
  });

  it('nudges by 0.1 degree per wheel notch and ignores the mouse for 30 ticks after', () => {
    const aim = new AimController();
    aim.nudge(3 * WHEEL_STEP);
    expect(aim.target).toBeCloseTo((0.3 * Math.PI) / 180, 12);
    aim.pointAt(100, 100, 0, 0, true);
    expect(aim.target).toBeCloseTo((0.3 * Math.PI) / 180, 12);
    ticks(aim, MOUSE_IGNORE_TICKS);
    aim.pointAt(100, 100, 0, 0, true);
    expect(aim.target).toBeCloseTo(Math.PI / 4, 12);
    expect(ARROW_STEP).toBeCloseTo(5 * WHEEL_STEP, 12);
  });

  it('touch is never ignored after a nudge', () => {
    const aim = new AimController();
    aim.nudge(WHEEL_STEP);
    aim.pointAt(-100, 100, 0, 0, false);
    expect(aim.target).toBeCloseTo(-Math.PI / 4, 12);
  });

  it('turns a touch drag across the aim line into fine aim at reduced sensitivity', () => {
    const aim = new AimController();
    aim.drag(100, 0);
    // Straight down, a drag to the right turns the aim toward +x by 0.1 rad: much finer than
    // pointing (100 units at a typical 300 unit reach is 0.32 rad).
    expect(aim.target).toBeCloseTo(0.1, 12);
    aim.set(Math.PI / 2);
    aim.drag(0, -100);
    expect(aim.target).toBeCloseTo(Math.PI / 2 + 0.1, 12);
  });

  it('fires a click right after a small twitch at the settled angle', () => {
    const aim = new AimController();
    aim.set(0.5);
    ticks(aim, SETTLE_TICKS);
    aim.nudge(0.005);
    aim.tick();
    expect(aim.angle).toBeCloseTo(0.505, 12);
    expect(aim.shotAngle(true)).toBe(0.5);
    expect(aim.shotAngle(false)).toBeCloseTo(0.505, 12);
    ticks(aim, JITTER_TICKS);
    expect(aim.shotAngle(true)).toBeCloseTo(0.505, 12);
  });

  it('fires a deliberate swing where the barrel points', () => {
    const aim = new AimController();
    aim.set(0);
    ticks(aim, SETTLE_TICKS);
    aim.pointAt(100, 100, 0, 0, true);
    aim.tick();
    expect(aim.shotAngle(true)).toBeCloseTo(TURN_RATE, 12);
  });
});
