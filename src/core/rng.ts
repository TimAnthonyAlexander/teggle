// Seeded random numbers for color assignment, the purple peg, the coin flip and every other
// random rule. sfc32 uses only 32-bit integer operations, so its output is identical in every
// JS engine. The state is four uint32 values and round-trips through JSON for replays.

export type RngState = readonly [number, number, number, number];

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  /** Builds a generator from any 32-bit seed, mixed with splitmix32 so nearby seeds diverge. */
  static fromSeed(seed: number): Rng {
    let s = seed >>> 0;
    const next = (): number => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      return (z ^ (z >>> 15)) >>> 0;
    };
    const rng = new Rng([next(), next(), next(), next()]);
    for (let i = 0; i < 12; i++) rng.nextU32();
    return rng;
  }

  state(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  nextU32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }

  /** Uniform in [0, 1). Exact: division by a power of two. */
  nextFloat(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform integer in [0, n) without modulo bias. n must be in [1, 2^32]. */
  nextInt(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > 4294967296) {
      throw new RangeError(`nextInt bound must be an integer in [1, 2^32], got ${n}`);
    }
    const limit = 4294967296 - (4294967296 % n);
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return x % n;
  }

  /** True with probability 1/2. */
  nextBool(): boolean {
    return (this.nextU32() & 1) === 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick from an empty list');
    return items[this.nextInt(items.length)] as T;
  }

  /** Fisher-Yates shuffle of a copy. */
  shuffled<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /** k distinct items in random order. */
  sample<T>(items: readonly T[], k: number): T[] {
    if (k > items.length) throw new RangeError(`cannot sample ${k} of ${items.length}`);
    return this.shuffled(items).slice(0, k);
  }
}
