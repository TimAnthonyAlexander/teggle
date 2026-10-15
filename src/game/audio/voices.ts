// Voice limits per sound, so rapid repeats stay clean. Each sound has a pool: at most `max`
// voices sound at once (a new one fades out the oldest), and onsets keep `spacing` seconds apart.
// A trigger that comes too soon is moved later, up to `maxDelay`, so a burst (a power lighting ten
// pegs in one tick) plays as a quick run instead of one smeared chord; past that it is dropped.
// Pure bookkeeping on plain numbers: the board supplies the voices and the clock.

export interface PoolVoice {
  /** When it starts, in context seconds. */
  readonly start: number;
  /** When it has died away. */
  readonly end: number;
  /** Fades it out from `at`. */
  stop(at: number): void;
  /** Frees its nodes once it is over. */
  release(): void;
}

export interface VoicePolicy {
  readonly max: number;
  /** Minimum seconds between two onsets. */
  readonly spacing: number;
  /** How far a too-early onset may be pushed back before it is dropped. */
  readonly maxDelay: number;
}

export class VoicePool<V extends PoolVoice = PoolVoice> {
  private readonly voices: V[] = [];
  private lastOnset = Number.NEGATIVE_INFINITY;

  constructor(readonly policy: VoicePolicy) {}

  /** Voices that have not ended (after the last prune). */
  get size(): number {
    return this.voices.length;
  }

  /**
   * The onset for a voice asked for at `t`, or null to drop it. A granted onset is reserved: the
   * next request is spaced from it.
   */
  reserve(t: number): number | null {
    const at = Math.max(t, this.lastOnset + this.policy.spacing);
    if (at - t > this.policy.maxDelay + 1e-9) return null;
    this.lastOnset = at;
    return at;
  }

  /** Adds a started voice; fades out the oldest beyond the limit at the new voice's onset. */
  add(voice: V, now: number): void {
    this.prune(now);
    this.voices.push(voice);
    while (this.voices.length > Math.max(1, this.policy.max)) {
      const old = this.voices.shift();
      old?.stop(Math.max(now, voice.start));
    }
  }

  /** Releases voices that ended before `now`. */
  prune(now: number): void {
    let w = 0;
    for (const v of this.voices) {
      if (v.end <= now) v.release();
      else this.voices[w++] = v;
    }
    this.voices.length = w;
  }

  /** Fades out every voice from `at` and forgets them. */
  stopAll(at: number): void {
    for (const v of this.voices) v.stop(at);
    this.voices.length = 0;
    this.lastOnset = Number.NEGATIVE_INFINITY;
  }
}
