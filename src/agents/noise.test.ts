import { describe, expect, it } from 'vitest';
import { digestNumbers } from '../core/digest';
import { Rng } from '../core/rng';
import { gaussian } from './noise';

describe('gaussian', () => {
  it('has mean 0 and variance 1', () => {
    const rng = Rng.fromSeed(42);
    const n = 200000;
    let sum = 0;
    let squares = 0;
    let within1 = 0;
    for (let i = 0; i < n; i++) {
      const z = gaussian(rng);
      expect(Number.isFinite(z)).toBe(true);
      sum += z;
      squares += z * z;
      if (Math.abs(z) < 1) within1++;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.01);
    expect(Math.abs(squares / n - 1)).toBeLessThan(0.01);
    // 68.27% of a normal distribution lies within one standard deviation.
    expect(Math.abs(within1 / n - 0.6827)).toBeLessThan(0.005);
  });

  // Built on dmath's log and cos, so every engine draws the same bits.
  it('produces the golden bit pattern', () => {
    const rng = Rng.fromSeed(7);
    const draws: number[] = [];
    for (let i = 0; i < 2000; i++) draws.push(gaussian(rng));
    expect(digestNumbers(draws)).toBe('d06757be5e886826');
  });
});
