import { describe, expect, it } from 'vitest';
import { GOVERNOR, ResolutionGovernor } from './quality';

function run(g: ResolutionGovernor, frameMs: number, ms: number): number {
  let drops = 0;
  for (let t = 0; t < ms; t += frameMs) if (g.frame(frameMs)) drops++;
  return drops;
}

describe('ResolutionGovernor', () => {
  it('keeps full resolution while frames keep up', () => {
    const g = new ResolutionGovernor(3);
    expect(run(g, 16.7, 60_000)).toBe(0);
    expect(g.cap).toBe(3);
  });

  it('ignores slow frames while settling (loading a screen)', () => {
    const g = new ResolutionGovernor(3);
    expect(run(g, 60, GOVERNOR.settleMs - 100)).toBe(0);
    expect(g.cap).toBe(3);
  });

  it('steps down on sustained slow frames, waits between steps, stops at the floor', () => {
    const g = new ResolutionGovernor(3);
    run(g, 60, GOVERNOR.settleMs + GOVERNOR.windowMs + 60);
    expect(g.cap).toBeCloseTo(2.25, 9);
    run(g, 60, 120_000);
    expect(g.cap).toBe(GOVERNOR.floor);
  });

  it('does not step down for a short stall', () => {
    const g = new ResolutionGovernor(3);
    run(g, 16.7, GOVERNOR.settleMs + 500);
    expect(run(g, 200, 400)).toBe(0);
    expect(run(g, 16.7, 10_000)).toBe(0);
    expect(g.cap).toBe(3);
  });

  it('starts settling again after a restart', () => {
    const g = new ResolutionGovernor(2);
    run(g, 16.7, GOVERNOR.settleMs + 500);
    g.restart();
    expect(run(g, 60, GOVERNOR.settleMs - 100)).toBe(0);
    expect(g.cap).toBe(2);
  });
});
