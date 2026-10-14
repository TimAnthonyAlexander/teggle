import { describe, expect, it } from 'vitest';
import {
  feverZoom,
  lowBallWarning,
  popGapTicks,
  popOffsets,
  rampSpeed,
  SLOW_MOTION_LEAD_TICKS,
  SLOW_MOTION_SCALE,
  slowMotionDue,
  tallyLine1,
  tallyLine2,
  ZOOM_APPROACH,
  ZOOM_HIT,
  ZOOM_OUT_MS,
} from './timing';

describe('pop cadence (research 4.4)', () => {
  it('is clamp(8 - remaining / 10, 1, 5) with integer division', () => {
    expect(popGapTicks(0)).toBe(5);
    expect(popGapTicks(9)).toBe(5);
    expect(popGapTicks(39)).toBe(5);
    expect(popGapTicks(40)).toBe(4);
    expect(popGapTicks(52)).toBe(3);
    expect(popGapTicks(65)).toBe(2);
    expect(popGapTicks(70)).toBe(1);
    expect(popGapTicks(140)).toBe(1);
  });

  it('pops nine pegs 5 ticks apart', () => {
    expect(popOffsets(9)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40]);
  });

  it('speeds up while many pegs remain and slows as the board empties', () => {
    const offsets = popOffsets(75);
    expect(offsets).toHaveLength(75);
    const gaps = offsets.slice(1).map((t, i) => t - (offsets[i] ?? 0));
    // 74 left after the first pop: 1 tick; the last gaps are 5 ticks.
    expect(gaps[0]).toBe(1);
    expect(gaps[gaps.length - 1]).toBe(5);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1] ?? 0);
  });

  it('pops nothing for an empty shot', () => {
    expect(popOffsets(0)).toEqual([]);
  });
});

describe('shot tally text (guide 9.2)', () => {
  it('shows the sum before the first pop, then counts the pegs', () => {
    expect(tallyLine1(2390, 0)).toBe('2,390 X PEGS');
    expect(tallyLine2(2390, 0)).toBeNull();
    expect(tallyLine1(2390, 1)).toBe('2,390 X 1 PEG');
    expect(tallyLine2(2390, 1)).toBe('2,390');
    expect(tallyLine1(2390, 9)).toBe('2,390 X 9 PEGS');
    expect(tallyLine2(2390, 9)).toBe('21,510');
  });

  it('ends on the patent formula: sum times count', () => {
    // Patent example: 9 pegs worth 850 in total give 7,650.
    expect(tallyLine2(850, 9)).toBe('7,650');
  });
});

describe('low-ball warnings', () => {
  it('warns once at 3, 2 and 1 balls', () => {
    expect(lowBallWarning(4, 0)).toBe(0);
    expect(lowBallWarning(3, 0)).toBe(3);
    expect(lowBallWarning(3, 3)).toBe(0);
    expect(lowBallWarning(2, 3)).toBe(2);
    expect(lowBallWarning(1, 2)).toBe(1);
    expect(lowBallWarning(0, 1)).toBe(0);
  });

  it('warns again after a free ball takes the stock back up and down', () => {
    expect(lowBallWarning(3, 2)).toBe(3);
  });
});

describe('slow motion window', () => {
  it('starts only when the hit is predicted within the lead', () => {
    expect(slowMotionDue(-1)).toBe(false);
    expect(slowMotionDue(0)).toBe(true);
    expect(slowMotionDue(SLOW_MOTION_LEAD_TICKS)).toBe(true);
    expect(slowMotionDue(SLOW_MOTION_LEAD_TICKS + 1)).toBe(false);
  });

  it('ramps back from 0.25x at 20 per mille per tick', () => {
    let speed = SLOW_MOTION_SCALE;
    let ticks = 0;
    while (speed < 1) {
      speed = rampSpeed(speed);
      ticks++;
    }
    expect(speed).toBe(1);
    expect(ticks).toBe(38);
  });
});

describe('Fever zoom', () => {
  const start = 1000;

  it('is 1 before slow motion and approaches 1.5 while closing in', () => {
    const z = { start, hit: null, end: null };
    expect(feverZoom(900, z)).toBe(1);
    expect(feverZoom(start, z)).toBe(1);
    expect(feverZoom(start + 200, z)).toBeGreaterThan(1);
    expect(feverZoom(start + 200, z)).toBeLessThan(ZOOM_APPROACH);
    expect(feverZoom(start + 2000, z)).toBeCloseTo(ZOOM_APPROACH, 6);
  });

  it('goes on to 2x after the hit without a jump', () => {
    const hit = start + 300;
    const z = { start, hit, end: null };
    const before = feverZoom(hit - 1e-6, { start, hit: null, end: null });
    expect(feverZoom(hit, z)).toBeCloseTo(before, 6);
    expect(feverZoom(hit + 5000, z)).toBeCloseTo(ZOOM_HIT, 6);
    let last = 0;
    for (let t = start; t <= hit + 600; t += 25) {
      const v = feverZoom(t, z);
      expect(v).toBeGreaterThanOrEqual(last - 1e-9);
      last = v;
    }
  });

  it('returns to 1 when slow motion ends or is clicked away', () => {
    const z = { start, hit: start + 300, end: start + 3300 };
    expect(feverZoom(start + 3300, z)).toBeCloseTo(ZOOM_HIT, 6);
    expect(feverZoom(start + 3300 + ZOOM_OUT_MS, z)).toBe(1);
    const cancelled = { start, hit: null, end: start + 100 };
    expect(feverZoom(start + 100 + ZOOM_OUT_MS + 1, cancelled)).toBe(1);
  });
});
