// Plays the Fever music (score.ts) on the instruments in synth.ts. The engine renders the piece
// once into a buffer with an OfflineAudioContext after audio unlocks, so the Fever's busiest
// moment does not also have to schedule hundreds of notes, and so pausing can stop the piece and
// resume it at the same place. Until that buffer is ready the notes are scheduled live.

import { midiToHz } from './pitch';
import {
  arrangement,
  beatToSeconds,
  MUSIC_SECONDS,
  musicPosition,
  resumeStartedAt,
  type MusicEvent,
  type Part,
} from './score';
import {
  bass,
  brass,
  cymbal,
  gainNode,
  glock,
  hat,
  kick,
  panNode,
  roomImpulse,
  snare,
  strings,
  timpani,
  type Ctx,
} from './synth';

interface PartMix {
  readonly pan: number;
  readonly level: number;
  /** Reverb send. */
  readonly wet: number;
}

const MIX: Readonly<Record<Part, PartMix>> = {
  lead: { pan: 0, level: 0.21, wet: 0.35 },
  glock: { pan: 0.3, level: 0.22, wet: 0.45 },
  strings: { pan: -0.25, level: 0.035, wet: 0.5 },
  stab: { pan: 0.2, level: 0.05, wet: 0.3 },
  bass: { pan: 0, level: 0.21, wet: 0.08 },
  kick: { pan: 0, level: 0.26, wet: 0.08 },
  snare: { pan: 0.08, level: 0.2, wet: 0.3 },
  hat: { pan: 0.35, level: 0.07, wet: 0.15 },
  crash: { pan: -0.3, level: 0.16, wet: 0.35 },
  timpani: { pan: -0.15, level: 0.32, wet: 0.4 },
};

const PARTS = Object.keys(MIX) as Part[];

/**
 * Overall trim: the piece runs at about -25 dBFS RMS into the limiter, its loudest chord at about
 * -8, so it sits under the Fever's effects (measured with `npm run audio:render -- --raw music`).
 */
const MUSIC_TRIM = 0.43;

function playEvent(ctx: Ctx, out: AudioNode, t: number, e: MusicEvent): void {
  const level = MIX[e.part].level * e.vel;
  const f = midiToHz(e.midi);
  const hold = beatToSeconds(e.beats);
  switch (e.part) {
    case 'lead':
      brass(ctx, out, t, f, hold * 0.94, level, { bright: 1.05, vibrato: 10 });
      return;
    case 'stab':
      brass(ctx, out, t, f, hold * 0.8, level, { attack: 0.012, bright: 0.8, vibrato: 0 });
      return;
    case 'strings':
      strings(ctx, out, t, f, hold, level);
      return;
    case 'glock':
      glock(ctx, out, t, f, level);
      return;
    case 'bass':
      bass(ctx, out, t, f, hold * 0.9, level);
      return;
    case 'kick':
      kick(ctx, out, t, level);
      return;
    case 'snare':
      snare(ctx, out, t, level);
      return;
    case 'hat':
      hat(ctx, out, t, level);
      return;
    case 'crash':
      cymbal(ctx, out, t, level, { tau: 0.55, hp: 3600, noise: 0.6 });
      return;
    case 'timpani':
      timpani(ctx, out, t, f, level);
      return;
  }
}

/**
 * Schedules the piece so that it starts at `t0`, into `dry` and the reverb send `wet`. Notes that
 * would start before `from` are left out (resuming in the middle). Returns the end time.
 */
export function scheduleMusic(
  ctx: Ctx,
  dry: AudioNode,
  wet: AudioNode,
  t0: number,
  from = Number.NEGATIVE_INFINITY,
): number {
  const outs = new Map<Part, AudioNode>();
  for (const part of PARTS) {
    const mix = MIX[part];
    const bus = gainNode(ctx, panNode(ctx, mix.pan, dry), MUSIC_TRIM);
    bus.connect(gainNode(ctx, wet, mix.wet));
    outs.set(part, bus);
  }
  for (const e of arrangement()) {
    const t = t0 + beatToSeconds(e.beat);
    if (t < from - 1e-3) continue;
    const out = outs.get(e.part);
    if (out !== undefined) playEvent(ctx, out, t, e);
  }
  return t0 + MUSIC_SECONDS;
}

/** Renders the whole piece, reverb included, into a stereo buffer at `sampleRate`. */
export async function renderMusic(sampleRate: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(MUSIC_SECONDS * sampleRate), sampleRate);
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx);
  room.connect(gainNode(ctx, ctx.destination, 0.55));
  scheduleMusic(ctx, ctx.destination, room, 0);
  return ctx.startRendering();
}

type MusicState = 'stopped' | 'playing' | 'paused';

/**
 * The Fever music's transport: play from the top, pause and resume at the same place, fade out.
 * Plays the prerendered buffer when there is one, else schedules the notes live.
 */
export class MusicPlayer {
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  /** The gains the current playback runs through, faded on pause and stop. */
  private faders: GainNode[] = [];
  private state: MusicState = 'stopped';
  private startedAt = 0;
  private position = 0;

  constructor(
    private readonly ctx: Ctx,
    private readonly dry: AudioNode,
    private readonly wet: AudioNode,
  ) {}

  setBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
  }

  /** "playing", "paused" or "stopped" at context time `now`. */
  stateAt(now: number): MusicState {
    if (this.state === 'playing' && musicPosition(this.startedAt, now) >= MUSIC_SECONDS) {
      this.state = 'stopped';
    }
    return this.state;
  }

  /** Starts the piece from the top at `t`. */
  play(t: number): void {
    this.stop(t, 0.03);
    this.state = 'playing';
    this.startedAt = t;
    this.position = 0;
    this.startAt(t, 0);
  }

  pause(now: number): void {
    if (this.stateAt(now) !== 'playing') return;
    this.position = musicPosition(this.startedAt, now);
    this.release(now, 0.04);
    this.state = 'paused';
  }

  resume(now: number): void {
    if (this.state !== 'paused') return;
    this.startedAt = resumeStartedAt(this.position, now);
    this.state = 'playing';
    this.startAt(now, this.position);
  }

  /** Fades out over about `fade` seconds and forgets the place. */
  stop(now: number, fade: number): void {
    if (this.state === 'stopped') return;
    this.release(now, fade);
    this.state = 'stopped';
  }

  private startAt(t: number, offset: number): void {
    // One fader for the dry signal and, when scheduling live, one for the reverb send.
    const fader = gainNode(this.ctx, this.dry, 1);
    const faders = [fader];
    const buffer = this.buffer;
    if (buffer !== null) {
      const s = this.ctx.createBufferSource();
      s.buffer = buffer;
      s.connect(fader);
      s.onended = () => {
        fader.disconnect();
      };
      s.start(t, Math.min(offset, buffer.duration));
      this.source = s;
    } else {
      const wet = gainNode(this.ctx, this.wet, 1);
      faders.push(wet);
      scheduleMusic(this.ctx, fader, wet, t - offset, t);
    }
    if (offset > 0) {
      // A short fade-in, so resuming never clicks.
      for (const f of faders) {
        f.gain.setValueAtTime(0, t);
        f.gain.linearRampToValueAtTime(1, t + 0.05);
      }
    }
    this.faders = faders;
  }

  private release(now: number, fade: number): void {
    for (const f of this.faders) {
      f.gain.cancelScheduledValues(now);
      f.gain.setValueAtTime(f.gain.value, now);
      f.gain.setTargetAtTime(0, now, Math.max(0.005, fade / 3));
    }
    this.source?.stop(now + fade + 0.1);
    this.faders = [];
    this.source = null;
  }
}
