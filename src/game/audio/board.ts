// The sound board: turns audio bus events into sounds on a context. It owns the voice pools, the
// buffers rendered at startup and the Fever music's transport. It works on any BaseAudioContext,
// so the live engine and the offline WAV renders share it; `t` is always the event's context time.

import type { AudioEvent } from './bus';
import { MusicPlayer } from './music';
import { routeEvent } from './routing';
import { SOUNDS, type SoundDef, type SoundId } from './sounds';
import { gainNode, type Ctx, type Mixer } from './synth';
import { VoicePool, type PoolVoice } from './voices';

/** A short margin so a sound asked for "now" is never scheduled in the past. */
const LEAD = 0.005;
/** How fast a stolen or stopped voice fades (time constant, s). */
const STEAL_TAU = 0.012;

class Voice implements PoolVoice {
  constructor(
    readonly start: number,
    readonly end: number,
    private readonly out: GainNode,
  ) {}

  stop(at: number, tau = STEAL_TAU): void {
    const g = this.out.gain;
    g.cancelScheduledValues(at);
    g.setTargetAtTime(0, at, tau);
  }

  release(): void {
    this.out.disconnect();
  }
}

export interface BoardStats {
  /** Events handled, by type. */
  readonly events: Record<string, number>;
  /** Voices started, by sound. */
  readonly voices: Record<string, number>;
  /** Sounds played from a startup buffer. */
  buffered: number;
}

export class SoundBoard {
  readonly music: MusicPlayer;
  readonly stats: BoardStats = { events: {}, voices: {}, buffered: 0 };
  private readonly pools = new Map<string, VoicePool<Voice>>();
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private letters = 0;
  /** While true, effects other than the music's transport are skipped (muted). */
  silent = false;

  constructor(
    private readonly ctx: Ctx,
    private readonly mixer: Mixer,
  ) {
    this.music = new MusicPlayer(ctx, mixer.music, mixer.musicWet);
  }

  setBuffer(id: SoundId, buffer: AudioBuffer): void {
    this.buffers.set(id, buffer);
  }

  /** Handles one bus event at context time `now`. */
  handle(e: AudioEvent, now: number): void {
    const s = this.stats.events;
    s[e.type] = (s[e.type] ?? 0) + 1;
    const t = now + LEAD;
    if (e.type === 'feverStart') this.letters = 0;
    const route = routeEvent(e, this.letters);
    if (e.type === 'feverLetter') this.letters++;
    // The roll lands on the hit: it gives way to the cymbal, the gong and the music.
    if (route.endRoll) this.pools.get('roll')?.stopAll(t + 0.05);
    if (route.music === 'stop') this.music.stop(t, 0.8);
    for (const c of route.cues) this.play(c.id, t + c.delay, c.n);
    if (route.music === 'start') this.music.play(t);
  }

  private pool(id: SoundId, def: SoundDef): VoicePool<Voice> {
    const key = def.pool ?? id;
    let pool = this.pools.get(key);
    if (pool === undefined) {
      pool = new VoicePool<Voice>({
        max: def.voices ?? 4,
        spacing: def.spacing ?? 0,
        maxDelay: def.maxDelay ?? 0,
      });
      this.pools.set(key, pool);
    }
    return pool;
  }

  /** Plays one sound at `t` (or as soon after as its pool allows). */
  play(id: SoundId, t: number, n = 0): void {
    if (this.silent) return;
    const def = SOUNDS[id];
    const pool = this.pool(id, def);
    const now = this.ctx.currentTime;
    pool.prune(now);
    const at = pool.reserve(Math.max(t, now));
    if (at === null) return;
    const ctx = this.ctx;
    const m = this.mixer;
    const out = gainNode(ctx, def.long === true ? m.long : m.sfx, def.level);
    if (def.wet > 0) out.connect(gainNode(ctx, def.long === true ? m.longWet : m.sfxWet, def.wet));
    let end: number;
    const buffer = this.buffers.get(id);
    if (buffer !== undefined) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(out);
      src.start(at);
      end = at + buffer.duration;
      this.stats.buffered++;
    } else {
      end = def.play(ctx, out, at, n);
    }
    pool.add(new Voice(at, end + 0.1, out), now);
    const v = this.stats.voices;
    v[id] = (v[id] ?? 0) + 1;
  }

  /** Fades out every sound and the music (leaving a screen). */
  stopAll(now: number, fade = 0.25): void {
    for (const pool of this.pools.values()) pool.stopAll(now);
    this.music.stop(now, fade);
  }
}
