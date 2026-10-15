import { describe, expect, it } from 'vitest';
import { VoicePool, type PoolVoice } from './voices';

class FakeVoice implements PoolVoice {
  stoppedAt: number | null = null;
  released = false;
  constructor(
    readonly start: number,
    readonly end: number,
  ) {}
  stop(at: number): void {
    this.stoppedAt = at;
  }
  release(): void {
    this.released = true;
  }
}

describe('VoicePool', () => {
  it('fades out the oldest voice beyond the limit', () => {
    const pool = new VoicePool<FakeVoice>({ max: 2, spacing: 0, maxDelay: 0 });
    const a = new FakeVoice(0, 5);
    const b = new FakeVoice(0.1, 5);
    const c = new FakeVoice(0.2, 5);
    pool.add(a, 0);
    pool.add(b, 0.1);
    expect(pool.size).toBe(2);
    pool.add(c, 0.2);
    expect(pool.size).toBe(2);
    expect(a.stoppedAt).toBe(0.2);
    expect(b.stoppedAt).toBeNull();
  });

  it('releases voices that have ended instead of stealing', () => {
    const pool = new VoicePool<FakeVoice>({ max: 1, spacing: 0, maxDelay: 0 });
    const a = new FakeVoice(0, 0.5);
    const b = new FakeVoice(1, 2);
    pool.add(a, 0);
    pool.add(b, 1);
    expect(a.released).toBe(true);
    expect(a.stoppedAt).toBeNull();
    expect(pool.size).toBe(1);
  });

  it('spaces onsets and turns a burst into a run', () => {
    const pool = new VoicePool({ max: 8, spacing: 0.03, maxDelay: 0.1 });
    expect(pool.reserve(1)).toBe(1);
    expect(pool.reserve(1)).toBeCloseTo(1.03, 9);
    expect(pool.reserve(1)).toBeCloseTo(1.06, 9);
    expect(pool.reserve(1)).toBeCloseTo(1.09, 9);
    // Past the allowed delay: dropped, and the reservation does not move.
    expect(pool.reserve(1)).toBeNull();
    expect(pool.reserve(1.2)).toBe(1.2);
  });

  it('drops repeats that come too soon when no delay is allowed', () => {
    const pool = new VoicePool({ max: 4, spacing: 0.04, maxDelay: 0 });
    expect(pool.reserve(0)).toBe(0);
    expect(pool.reserve(0.02)).toBeNull();
    expect(pool.reserve(0.04)).toBe(0.04);
  });

  it('stops everything and forgets the spacing', () => {
    const pool = new VoicePool<FakeVoice>({ max: 4, spacing: 1, maxDelay: 0 });
    const a = new FakeVoice(0, 9);
    pool.reserve(0);
    pool.add(a, 0);
    pool.stopAll(3);
    expect(a.stoppedAt).toBe(3);
    expect(pool.size).toBe(0);
    expect(pool.reserve(0.5)).toBe(0.5);
  });
});
