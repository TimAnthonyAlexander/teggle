import { describe, expect, it } from 'vitest';
import {
  dialogDrop,
  ease,
  LAST_BALL_WARNING,
  pegValueFrame,
  popIn,
  POP_TOTAL_MS,
  warningIn,
} from './motion';

describe('popIn', () => {
  it('peaks at 1.85x at 80 ms and settles to 1x by 250 ms', () => {
    expect(popIn(0).scale).toBeCloseTo(1, 6);
    expect(popIn(80).scale).toBeCloseTo(1.85, 6);
    expect(popIn(250).scale).toBeCloseTo(1, 6);
    expect(popIn(500)).toEqual({ scale: 1, alpha: 1, done: false });
  });

  it('fades out and finishes after hold and fade', () => {
    expect(popIn(250 + 600 + 175).alpha).toBeCloseTo(0.5, 6);
    expect(popIn(POP_TOTAL_MS).done).toBe(true);
    expect(popIn(POP_TOTAL_MS).alpha).toBe(0);
  });

  it('never shrinks below its rest size while growing or settling', () => {
    for (let t = 0; t <= 250; t += 5) expect(popIn(t).scale).toBeGreaterThanOrEqual(1 - 1e-9);
  });
});

describe('warningIn', () => {
  it('shrinks from the entrance size to rest, holds, then fades', () => {
    expect(warningIn(0, 3).scale).toBeCloseTo(3, 6);
    expect(warningIn(450, 3).scale).toBeCloseTo(1, 6);
    expect(warningIn(2000, 3).alpha).toBe(1);
    expect(warningIn(450 + 3000 + 400, 3).done).toBe(true);
  });

  it('shows LAST BALL! for 200 ms at most', () => {
    expect(warningIn(60, 1.5, LAST_BALL_WARNING)).toEqual({ scale: 1, alpha: 1, done: false });
    expect(warningIn(199, 1.5, LAST_BALL_WARNING).done).toBe(false);
    expect(warningIn(200, 1.5, LAST_BALL_WARNING).done).toBe(true);
  });
});

describe('dialogDrop', () => {
  it('starts above by the full distance and rests at 0', () => {
    expect(dialogDrop(0, 300)).toBeCloseTo(-300, 6);
    expect(dialogDrop(170, 300)).toBeCloseTo(0, 6);
    expect(dialogDrop(1000, 300)).toBeCloseTo(0, 6);
  });

  it('overshoots slightly before resting', () => {
    let maxDown = -Infinity;
    for (let t = 0; t <= 170; t += 2) maxDown = Math.max(maxDown, dialogDrop(t, 300));
    expect(maxDown).toBeGreaterThan(0);
    expect(maxDown).toBeLessThan(40);
  });
});

describe('easing', () => {
  it('maps 0 to 0 and 1 to 1', () => {
    for (const f of [
      ease.outQuad,
      ease.outCubic,
      ease.inOutSine,
      ease.inOutCubic,
      ease.outBack(),
    ]) {
      expect(f(0)).toBeCloseTo(0, 9);
      expect(f(1)).toBeCloseTo(1, 9);
    }
  });
});

describe('pegValueFrame', () => {
  it('is visible at first and gone at the end', () => {
    expect(pegValueFrame(0).alpha).toBe(1);
    expect(pegValueFrame(10_000).done).toBe(true);
  });
});
