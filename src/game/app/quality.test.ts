import { describe, expect, it } from 'vitest';
import { GOVERNOR, ResolutionGovernor } from './quality';

/** Feeds `ms` of frames; `frameMs` may depend on the cap. Returns how often the cap changed. */
function run(g: ResolutionGovernor, frameMs: number | ((cap: number) => number), ms: number) {
  let changes = 0;
  for (let t = 0; t < ms;) {
    const f = typeof frameMs === 'number' ? frameMs : frameMs(g.cap);
    if (g.frame(f)) changes++;
    t += f;
  }
  return changes;
}

/** A device whose frame time follows the pixels it draws: `ms` at DPR 3. */
const fillBound = (ms: number) => (cap: number) => ms * (cap / 3) ** 2;

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

  it('steps down while fewer pixels keep making the frames faster, waits between steps', () => {
    const g = new ResolutionGovernor(3);
    run(g, fillBound(60), GOVERNOR.settleMs + GOVERNOR.windowMs + 60);
    expect(g.cap).toBeCloseTo(2.25, 9);
    // 33.75 ms at 2.25 is still slow; 19 ms at 1.69 keeps up.
    run(g, fillBound(60), 120_000);
    expect(g.cap).toBeCloseTo(1.6875, 9);
  });

  it('stops at the floor', () => {
    const g = new ResolutionGovernor(3);
    run(g, fillBound(120), 120_000);
    expect(g.cap).toBe(GOVERNOR.floor);
  });

  it('undoes a step that does not speed the frames up (30 fps in Low Power Mode)', () => {
    const g = new ResolutionGovernor(3);
    expect(run(g, 33.4, 20_000)).toBe(2);
    expect(g.cap).toBe(3);
    expect(run(g, 33.4, 120_000)).toBe(0);
    expect(g.cap).toBe(3);
  });

  it('keeps a step through the restart its own resize causes', () => {
    const g = new ResolutionGovernor(3);
    let changes = 0;
    for (let t = 0; t < 60_000; t += 16) {
      const f = fillBound(45)(g.cap);
      if (g.frame(f)) {
        changes++;
        g.restart();
      }
    }
    // 45 ms at 3 is slow, 25 ms at 2.25 is not: one step, and it stands.
    expect(changes).toBe(1);
    expect(g.cap).toBeCloseTo(2.25, 9);
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
