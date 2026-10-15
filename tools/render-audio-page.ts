// DEV ONLY, the browser half of tools/render-audio.ts: renders every sound, the Fever music and a
// few whole scenes with an OfflineAudioContext through the game's own mixer and sound board, and
// returns them as 16-bit WAV files. Loaded by the dev server inside a Playwright page.

import { SoundBoard } from '../src/game/audio/board';
import type { AudioEvent } from '../src/game/audio/bus';
import { MUSIC_SECONDS } from '../src/game/audio/score';
import { SOUND_IDS, type SoundId } from '../src/game/audio/sounds';
import { createMixer, resetSeeds } from '../src/game/audio/synth';

export const SAMPLE_RATE = 44100;
/**
 * Everything starts this late and the WAV leaves it out: a DynamicsCompressorNode in a fresh
 * context starts with almost no gain and takes about 0.3 s to open (measured in Chromium), which
 * the live game never hears because its context runs on.
 */
const LEAD_IN = 0.4;

export interface Rendered {
  readonly name: string;
  readonly seconds: number;
  readonly peakDb: number;
  readonly rmsDb: number;
  /** Base64 WAV. */
  readonly wav: string;
}

type Cue = readonly [time: number, event: AudioEvent];

interface Render {
  readonly seconds: number;
  /** Plays into a fresh board at the given times. */
  readonly run: (board: SoundBoard) => void;
}

function scene(seconds: number, cues: readonly Cue[]): Render {
  return {
    seconds,
    run: (board) => {
      for (const [t, e] of cues) board.handle(e, LEAD_IN + t);
    },
  };
}

function single(id: SoundId, seconds: number, n = 0): Render {
  return {
    seconds,
    run: (board) => {
      board.play(id, LEAD_IN + 0.02, n);
    },
  };
}

/** Typical lengths for the single renders (sound plus room tail). */
const SINGLE_SECONDS: Partial<Record<SoundId, number>> = {
  roll: 3.6,
  gong: 4.5,
  cymbal: 3,
  fireworks: 3.6,
  rainbow: 4,
  applause: 3.6,
  applauseFull: 4.6,
  'power.spookyBall': 3,
  'power.zenBall': 4,
};

function fever(fullClear: boolean): Render {
  const cues: Cue[] = [[0, { type: 'slowMotion' }]];
  const hit = 1;
  cues.push([hit, { type: 'pegHit', index: 6, color: 'orange' }]);
  cues.push([hit, { type: 'feverStart', fullClear }]);
  const letters = fullClear ? 13 : 5;
  for (let i = 0; i < letters; i++) cues.push([hit + i * 0.07, { type: 'feverLetter' }]);
  cues.push([hit + 1.2, { type: 'pegHit', index: 7, color: 'blue' }]);
  cues.push([hit + 2.3, { type: 'pegHit', index: 8, color: 'blue' }]);
  const land = hit + 4.4;
  cues.push([land, { type: 'fireworks' }]);
  cues.push([land, { type: 'feverBucket', bucket: 2, points: 100_000 }]);
  cues.push([land + 1.1, { type: 'rainbow' }]);
  for (let t = land + 2; t < land + 3.3; t += 0.04) cues.push([t, { type: 'countTick' }]);
  cues.push([land + 6.4, { type: 'levelWon', fullClear }]);
  cues.push([land + 6.4, { type: 'dialogMove' }]);
  for (let t = land + 6.65; t < land + 9; t += 0.04) cues.push([t, { type: 'countTick' }]);
  return scene(hit + MUSIC_SECONDS + 0.5, cues);
}

function renders(): Map<string, Render> {
  const out = new Map<string, Render>();
  for (const id of SOUND_IDS) out.set(id, single(id, SINGLE_SECONDS[id] ?? 2.6));
  out.set(
    'run.peg-hits',
    scene(
      3,
      Array.from({ length: 18 }, (_, i): Cue => [
        0.02 + i * 0.13,
        { type: 'pegHit', index: i, color: 'blue' },
      ]),
    ),
  );
  out.set(
    'run.peg-pops',
    scene(
      2.6,
      Array.from({ length: 20 }, (_, i): Cue => [
        0.02 + i * 0.05,
        { type: 'pegPop', index: i, color: 'blue' },
      ]),
    ),
  );
  // A power lighting nine pegs in one tick: the pool turns it into a quick run.
  out.set(
    'run.peg-burst',
    scene(
      1.6,
      Array.from({ length: 9 }, (_, i): Cue => [0.02, { type: 'pegHit', index: i, color: 'blue' }]),
    ),
  );
  out.set('hit.blue.mid', single('hit.blue', 1.2, 7));
  out.set('hit.blue.top', single('hit.blue', 1.2, 14));
  out.set('pop.top', single('pop', 1.2, 14));
  for (const balls of [3, 2, 1]) out.set(`low.${balls}`, single('low', 1.6, balls));
  for (const m of [2, 3, 5, 10]) out.set(`meter.x${m}`, single('meter', 1.6, m));
  for (const p of [10_000, 50_000, 100_000]) {
    out.set(`feverBucket.${p / 1000}k`, single('feverBucket', 2.2, p));
  }
  out.set('feverBoom.fullClear', single('feverBoom', 2.4, 1));
  out.set('music', {
    seconds: MUSIC_SECONDS + 0.2,
    run: (board) => {
      board.music.play(LEAD_IN + 0.02);
    },
  });
  out.set('scene.fever', fever(false));
  out.set('scene.fever-full-clear', fever(true));
  // Stress: a burst of seventy pops one tick apart under the fireworks and the music.
  const dense: Cue[] = [
    [0, { type: 'feverStart', fullClear: true }],
    [0.4, { type: 'fireworks' }],
    [0.4, { type: 'feverBucket', bucket: 2, points: 100_000 }],
  ];
  for (let i = 0; i < 70; i++)
    dense.push([0.4 + i * 0.01, { type: 'pegPop', index: i, color: 'blue' }]);
  for (let i = 0; i < 12; i++)
    dense.push([0.5 + i * 0.02, { type: 'pegHit', index: i, color: 'orange' }]);
  out.set('scene.dense', scene(4, dense));
  return out;
}

export function renderNames(): string[] {
  return [...renders().keys()];
}

/** Renders one entry; `raw` makes the limiter transparent, to measure the levels going into it. */
export async function render(name: string, raw = false): Promise<Rendered> {
  const r = renders().get(name);
  if (r === undefined) throw new Error(`No render named ${name}`);
  resetSeeds();
  const length = Math.ceil((LEAD_IN + r.seconds) * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const board = new SoundBoard(ctx, createMixer(ctx, ctx.destination, { limit: !raw }));
  r.run(board);
  const buffer = await ctx.startRendering();
  const from = Math.round(LEAD_IN * SAMPLE_RATE);
  let peak = 0;
  let sum = 0;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (let i = from; i < buffer.length; i++) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    peak = Math.max(peak, Math.abs(a), Math.abs(b));
    sum += a * a + b * b;
  }
  const frames = buffer.length - from;
  const db = (v: number): number => Math.round(20 * Math.log10(Math.max(v, 1e-9)) * 10) / 10;
  return {
    name,
    seconds: frames / SAMPLE_RATE,
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sum / (2 * frames))),
    // Raw renders may exceed full scale, so they are written as float samples.
    wav: toBase64(encodeWav(buffer, from, raw)),
  };
}

/** WAV from frame `from` on, channels interleaved: 16-bit PCM, or 32-bit float. */
function encodeWav(buffer: AudioBuffer, from: number, float: boolean): Uint8Array {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length - from;
  const width = float ? 4 : 2;
  const bytes = new Uint8Array(44 + frames * channels * width);
  const v = new DataView(bytes.buffer);
  const text = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + frames * channels * width, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, float ? 3 : 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * width, true);
  v.setUint16(32, channels * width, true);
  v.setUint16(34, width * 8, true);
  text(36, 'data');
  v.setUint32(40, frames * channels * width, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let at = 44;
  for (let i = from; i < buffer.length; i++) {
    for (const d of data) {
      const s = d[i] ?? 0;
      if (float) v.setFloat32(at, s, true);
      else v.setInt16(at, Math.round(Math.max(-1, Math.min(1, s)) * 32767), true);
      at += width;
    }
  }
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    s += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(s);
}
