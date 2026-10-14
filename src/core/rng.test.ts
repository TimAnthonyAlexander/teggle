import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('is reproducible from a seed and from a saved state', () => {
    const a = Rng.fromSeed(42);
    const b = Rng.fromSeed(42);
    const first = [a.nextU32(), a.nextU32(), a.nextU32()];
    expect([b.nextU32(), b.nextU32(), b.nextU32()]).toEqual(first);

    const saved = a.state();
    const tail = [a.nextU32(), a.nextU32()];
    const restored = new Rng(JSON.parse(JSON.stringify(saved)) as [number, number, number, number]);
    expect([restored.nextU32(), restored.nextU32()]).toEqual(tail);
  });

  it('diverges for nearby seeds', () => {
    expect(Rng.fromSeed(1).nextU32()).not.toBe(Rng.fromSeed(2).nextU32());
  });

  it('nextInt stays in range and covers it evenly', () => {
    const rng = Rng.fromSeed(7);
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 60000; i++) {
      const v = rng.nextInt(6);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(400);
  });

  it('nextBool is close to 50/50', () => {
    const rng = Rng.fromSeed(99);
    let heads = 0;
    for (let i = 0; i < 100000; i++) if (rng.nextBool()) heads++;
    expect(Math.abs(heads - 50000)).toBeLessThan(700);
  });

  it('sample returns distinct items', () => {
    const rng = Rng.fromSeed(3);
    const items = Array.from({ length: 100 }, (_, i) => i);
    const picked = rng.sample(items, 25);
    expect(new Set(picked).size).toBe(25);
  });

  it('produces the golden sequence', () => {
    const rng = Rng.fromSeed(20071);
    expect([rng.nextU32(), rng.nextU32(), rng.nextU32()]).toEqual(GOLDEN);
  });
});

const GOLDEN = [561349429, 3170789265, 650281739];
