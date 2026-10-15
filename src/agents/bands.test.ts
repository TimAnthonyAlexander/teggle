import { describe, expect, it } from 'vitest';
import { inStageBand, REFERENCE_BANDS, stageBand } from './bands';
import { REFERENCE_NOISE } from './tuning';

describe('reference bands', () => {
  it('cover every stage with the five levels that span each band', () => {
    expect(REFERENCE_BANDS.stages.map((s) => s.stage)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const s of REFERENCE_BANDS.stages) {
      expect(s.levels).toHaveLength(5);
      const rates = s.levels.map((l) => l.clearRate);
      expect(s.low).toBe(Math.min(...rates));
      expect(s.high).toBe(Math.max(...rates));
      expect(s.mean).toBeGreaterThanOrEqual(s.low);
      expect(s.mean).toBeLessThanOrEqual(s.high);
      for (const l of s.levels) {
        expect(l.id.startsWith(`${s.stage}-`)).toBe(true);
        expect(l.low).toBeLessThanOrEqual(l.clearRate);
        expect(l.high).toBeGreaterThanOrEqual(l.clearRate);
      }
    }
  });

  it('were measured with the reference noisy agent', () => {
    expect(REFERENCE_BANDS.agent.tier).toBe('noisy');
    expect(REFERENCE_BANDS.agent.noise).toBe(REFERENCE_NOISE);
  });

  it('tell whether a clear rate fits its stage', () => {
    const band = stageBand(1);
    expect(inStageBand(1, band.low)).toBe(true);
    expect(inStageBand(1, band.high)).toBe(true);
    expect(inStageBand(1, (band.low + band.high) / 2)).toBe(true);
    expect(inStageBand(1, band.high + 0.01)).toBe(false);
    expect(() => stageBand(12)).toThrow(RangeError);
  });
});
