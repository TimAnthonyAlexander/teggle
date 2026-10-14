import { describe, expect, it } from 'vitest';
import { atan, atan2, cos, HALF_PI, PI, sin, wrapAngle } from './dmath';
import { digestNumbers } from './digest';

const samples: number[] = [];
for (let i = -4000; i <= 4000; i++) samples.push(i * 0.0123456789);
samples.push(0, -0, 1e-12, -1e-12, PI, -PI, HALF_PI, 1e5, -1e5, 123456.789);

describe('dmath', () => {
  it('sin and cos match the engine within 2 ulp-scale error', () => {
    for (const x of samples) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThanOrEqual(4.5e-16);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThanOrEqual(4.5e-16);
    }
  });

  it('atan2 matches the engine within 2 ulp-scale error', () => {
    for (let i = 0; i < 2000; i++) {
      const y = sin(i * 0.37) * (1 + i);
      const x = cos(i * 0.91) * (1 + (i % 17));
      expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThanOrEqual(9e-16);
    }
    expect(atan(1)).toBe(Math.atan(1));
  });

  it('handles signed zeros and special values like Math', () => {
    expect(Object.is(sin(-0), -0)).toBe(true);
    expect(cos(0)).toBe(1);
    expect(sin(Infinity)).toBeNaN();
    expect(atan2(0, -1)).toBe(PI);
    expect(atan2(-0, -1)).toBe(-PI);
    expect(Object.is(atan2(-0, 1), -0)).toBe(true);
    expect(atan2(1, 0)).toBe(HALF_PI);
    expect(atan2(Infinity, Infinity)).toBe(Math.atan2(Infinity, Infinity));
  });

  it('wrapAngle lands in [-PI, PI)', () => {
    for (const x of samples) {
      const w = wrapAngle(x);
      expect(w).toBeGreaterThanOrEqual(-PI);
      expect(w).toBeLessThan(PI);
      expect(Math.abs(sin(w) - sin(x))).toBeLessThan(1e-9);
    }
  });

  // The golden digest pins the exact bits. If it changes, every recorded replay breaks.
  it('produces the golden bit pattern', () => {
    const out: number[] = [];
    for (const x of samples) out.push(sin(x), cos(x), atan2(x, 1.5 - x));
    expect(digestNumbers(out)).toBe(GOLDEN);
  });
});

// Same value under V8 (Node) and JavaScriptCore (Bun); the native Math functions differ there.
const GOLDEN = 'a76fe5067cbb30ef';
