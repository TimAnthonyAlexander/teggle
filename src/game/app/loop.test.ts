import { describe, expect, it } from 'vitest';
import { FixedStepClock } from './loop';

function run(clock: FixedStepClock, frames: number, frameMs: number): number {
  let ticks = 0;
  for (let i = 0; i < frames; i++) ticks += clock.advance(frameMs);
  return ticks;
}

describe('FixedStepClock', () => {
  it('runs 100 ticks per second regardless of frame rate', () => {
    expect(run(new FixedStepClock(), 60, 1000 / 60)).toBe(100);
    expect(run(new FixedStepClock(), 144, 1000 / 144)).toBe(100);
    expect(run(new FixedStepClock(), 30, 1000 / 30)).toBe(100);
  });

  it('keeps the fractional tick as the render alpha', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(15)).toBe(1);
    expect(clock.alpha).toBeCloseTo(0.5, 9);
    expect(clock.advance(5)).toBe(1);
    expect(clock.alpha).toBeCloseTo(0, 9);
  });

  it('runs 8x faster while fast forward is held', () => {
    const clock = new FixedStepClock();
    clock.fastForward = true;
    expect(run(clock, 60, 1000 / 60)).toBe(800);
  });

  it('slows down with the time scale', () => {
    const clock = new FixedStepClock();
    clock.timeScale = 0.25;
    expect(run(clock, 60, 1000 / 60)).toBe(25);
  });

  it('caps catch-up ticks per frame and drops the surplus', () => {
    const clock = new FixedStepClock({ maxTicksPerFrame: 10 });
    expect(clock.advance(200)).toBe(10);
    expect(clock.droppedTicks).toBe(10);
    expect(clock.advance(10)).toBe(1);
  });

  it('treats long frames as maxFrameMs', () => {
    const clock = new FixedStepClock({ maxTicksPerFrame: 1000, maxFrameMs: 250 });
    expect(clock.advance(10_000)).toBe(25);
  });

  it('runs nothing and forgets time while paused', () => {
    const clock = new FixedStepClock();
    clock.advance(5);
    clock.paused = true;
    expect(clock.advance(1000)).toBe(0);
    clock.paused = false;
    expect(clock.advance(5)).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.5, 9);
  });
});
