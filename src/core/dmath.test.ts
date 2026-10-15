import { describe, expect, it } from 'vitest';
import { atan, atan2, cos, HALF_PI, log, PI, sin, sincos, wrapAngle } from './dmath';
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

  it('sincos gives exactly the bits of sin and cos', () => {
    const out = { sin: 0, cos: 0 };
    for (const x of [...samples, Infinity, Number.NaN]) {
      sincos(x, out);
      expect(Object.is(out.sin, sin(x))).toBe(true);
      expect(Object.is(out.cos, cos(x))).toBe(true);
    }
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

describe('dmath log', () => {
  // Built with exact arithmetic only, so every engine starts from the same bits.
  const inputs: number[] = [];
  for (let i = 1; i <= 4000; i++) {
    inputs.push(i / 4000, i * 0.731, 1 + i * 1e-9, 1 - i * 1e-12);
    inputs.push(Number.MIN_VALUE * i * 977, 1e-300 * i, 1e300 / i);
  }
  inputs.push(Number.MIN_VALUE, 2.2250738585072014e-308, 1e-310, 0.5, 2, 2.718281828459045);
  inputs.push(Number.MAX_VALUE);

  it('matches the engine within 1 ulp', () => {
    for (const x of inputs) {
      const expected = Math.log(x);
      const ulp = Math.max(Math.abs(expected) * Number.EPSILON, Number.MIN_VALUE);
      expect(Math.abs(log(x) - expected)).toBeLessThanOrEqual(ulp);
    }
  });

  it('handles the special values like Math.log', () => {
    expect(log(1)).toBe(0);
    expect(log(0)).toBe(-Infinity);
    expect(log(-0)).toBe(-Infinity);
    expect(log(Infinity)).toBe(Infinity);
    expect(log(-1)).toBeNaN();
    expect(log(Number.NaN)).toBeNaN();
    expect(log(-Infinity)).toBeNaN();
  });

  it('produces the golden bit pattern', () => {
    expect(digestNumbers(inputs.map(log))).toBe(LOG_GOLDEN);
  });
});

// Same value under V8 (Node) and JavaScriptCore (Bun); the native Math functions differ there.
const GOLDEN = 'a76fe5067cbb30ef';
const LOG_GOLDEN = '4b2285d36e634c92';
