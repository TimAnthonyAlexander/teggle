// Every sound effect in Teggle, synthesized (spec 14.1). Each audio bus event maps to one or more
// of these in board.ts. A sound plays into one output node from time `t` and returns the time it
// has died away; `n` carries the event's number (the hit index, the multiplier, the points, the
// letter count). Lengths, pitches and envelopes follow the character of the original's sounds as
// measured in the visual guide (section 14); none of its audio is used.

import type { PowerId, PowerMoment } from './bus';
import { loudnessTrim, midiToHz, pegHitMidi, pegPopMidi } from './pitch';
import {
  adsr,
  boom,
  brass,
  celesta,
  chime,
  cymbal,
  filterNode,
  gainNode,
  glide,
  glock,
  lfo,
  mulberry32,
  nextSeed,
  noiseHit,
  noiseNode,
  oscNode,
  panNode,
  perc,
  reed,
  strings,
  struck,
  timpani,
  type Ctx,
  type Mode,
} from './synth';

const hz = midiToHz;

export type PegVariant = 'blue' | 'orange' | 'green' | 'purple';

export type SoundId =
  | `hit.${PegVariant}`
  | 'pop'
  | 'cannon'
  | 'bucket'
  | 'free.bucket'
  | 'free.t1'
  | 'free.t2'
  | 'free.t3'
  | 'free.coin'
  | 'coinSpin'
  | 'coinWon'
  | 'coinLost'
  | 'style.small'
  | 'style.medium'
  | 'style.big'
  | 'style.huge'
  | 'purple'
  | 'low'
  | 'meter'
  | 'tick'
  | 'dialog'
  | 'click'
  | 'hover'
  | 'roll'
  | 'cymbal'
  | 'gong'
  | 'feverBoom'
  | 'letter'
  | 'feverBucket'
  | 'fireworks'
  | 'rainbow'
  | 'applause'
  | 'applauseFull'
  | 'lost'
  | 'powerUp'
  | `power.${PowerId}`
  | `moment.${PowerMoment}`;

export type Recipe = (ctx: Ctx, out: AudioNode, t: number, n: number) => number;

export interface SoundDef {
  /** Trim for the mix. */
  readonly level: number;
  /** Reverb send, 0 to 1. */
  readonly wet: number;
  /** Long sounds duck while the game is paused. */
  readonly long?: boolean;
  /** At most this many voices at once (default 4). */
  readonly voices?: number;
  /** Seconds between onsets (default 0) and how late a crowded onset may slip (default 0). */
  readonly spacing?: number;
  readonly maxDelay?: number;
  /** Sounds that share one voice pool. */
  readonly pool?: string;
  /** Rendered once into a buffer after audio unlocks: its length and channels. */
  readonly prerender?: { readonly seconds: number; readonly channels: 1 | 2 };
  readonly play: Recipe;
}

// ---------------------------------------------------------------------------------------------
// Helpers

function maxOf(...xs: number[]): number {
  return Math.max(...xs);
}

/** Notes one after another on one instrument; returns the last end. */
function run(
  notes: readonly number[],
  gap: number,
  play: (t: number, f: number, i: number) => number,
  t: number,
): number {
  let end = t;
  notes.forEach((m, i) => {
    end = Math.max(end, play(t + i * gap, hz(m), i));
  });
  return end;
}

/** Vibraphone: a mellow bar with a motor tremolo. */
function vibes(ctx: Ctx, out: AudioNode, t: number, f: number, level: number, tau: number): number {
  const am = gainNode(ctx, out, 0.75);
  const end = struck(
    ctx,
    am,
    t,
    f,
    [
      { ratio: 1, gain: 1, tau },
      { ratio: 4, gain: 0.1, tau: 0.05 },
      { ratio: 2, gain: 0.06, tau: tau * 0.4 },
    ],
    level,
  );
  lfo(ctx, 'sine', 5.5, 0.25, t, end, am.gain);
  return end;
}

/** Tiny sharp clicks spread over a stretch of time (crackle of sparks or fire). */
function crackle(
  ctx: Ctx,
  out: AudioNode,
  t: number,
  span: number,
  count: number,
  level: number,
  pan: number,
  r: () => number,
): number {
  let end = t;
  for (let i = 0; i < count; i++) {
    const dt = Math.pow(r(), 1.6) * span;
    end = Math.max(
      end,
      noiseHit(ctx, out, t + dt, {
        type: 'bandpass',
        freq: 1200 + r() * 3000,
        q: 0.9,
        tau: 0.003 + r() * 0.004,
        level: level * (1 - (0.7 * dt) / Math.max(span, 0.01)) * (0.4 + r() * 0.6),
        pan: Math.max(-1, Math.min(1, pan + (r() - 0.5) * 0.7)),
      }),
    );
  }
  return end;
}

/** A singing bowl: two close fundamentals beat slowly, the upper modes fade first. */
function bowl(ctx: Ctx, out: AudioNode, t: number, f: number, level: number, tau: number): number {
  return struck(
    ctx,
    out,
    t,
    f,
    [
      { ratio: 1, gain: 1, tau, attack: 0.004 },
      { ratio: 1.0045, gain: 0.7, tau, attack: 0.004 },
      { ratio: 2.71, gain: 0.32, tau: tau * 0.45 },
      { ratio: 2.716, gain: 0.25, tau: tau * 0.45 },
      { ratio: 5.15, gain: 0.1, tau: tau * 0.18 },
    ],
    level,
  );
}

// ---------------------------------------------------------------------------------------------
// Pegs

/** Peg hit: a short bright chime, a scale step higher for every further peg in the shot. */
function pegHit(variant: PegVariant): Recipe {
  return (ctx, out, t, n) => {
    const f = hz(pegHitMidi(n));
    const level = 0.5 * loudnessTrim(f, 523.25);
    const end = chime(ctx, out, t, f, level, {
      tau: 0.088,
      bright: variant === 'orange' ? 2.6 : 2.1,
      strikeTau: 0.055,
      octave: 0,
    });
    // Upper partials that ring almost as long as the fundamental: a bright glassy bell.
    struck(
      ctx,
      out,
      t,
      f,
      [
        { ratio: 2.003, gain: 0.5, tau: 0.075 },
        { ratio: 3.004, gain: variant === 'orange' ? 0.28 : 0.2, tau: 0.06 },
        { ratio: 5.07, gain: 0.09, tau: 0.035 },
      ],
      level,
    );
    // The tick of the strike: a breath of bright noise.
    noiseHit(ctx, out, t, { type: 'highpass', freq: 3500, q: 0.7, tau: 0.018, level: level * 0.1 });
    if (variant === 'green') {
      // A second, slightly sharp voice: a soft chorus.
      chime(ctx, out, t, f * 1.0045, level * 0.35, { tau: 0.12, bright: 0.5, octave: 0 });
    } else if (variant === 'purple') {
      struck(
        ctx,
        out,
        t,
        f,
        [
          { ratio: 4.02, gain: 0.08, tau: 0.07 },
          { ratio: 6.01, gain: 0.06, tau: 0.05 },
        ],
        level,
      );
    }
    return end;
  };
}

/** Peg pop after the shot: a soft round bloop, climbing like the hits. */
const pegPop: Recipe = (ctx, out, t, n) => {
  const f = hz(pegPopMidi(n));
  const level = 0.55 * loudnessTrim(f, 392);
  const g = gainNode(ctx, out);
  const end = perc(g.gain, t, level, 0.003, 0.06);
  const o = oscNode(ctx, 'sine', f, t, end, g);
  glide(o.frequency, t, f * 0.7, f, 0.025);
  // The soft ring after the pop, at the same pitch.
  const tail = gainNode(ctx, out);
  const tailEnd = perc(tail.gain, t + 0.012, level * 0.09, 0.008, 0.15);
  oscNode(ctx, 'sine', f, t, tailEnd, tail);
  noiseHit(ctx, out, t, {
    type: 'lowpass',
    freq: f * 2.5,
    q: 0.7,
    tau: 0.008,
    level: level * 0.12,
  });
  return Math.max(end, tailEnd);
};

// ---------------------------------------------------------------------------------------------
// Cannon, bucket, free balls, coin

const cannon: Recipe = (ctx, out, t) =>
  maxOf(
    boom(ctx, out, t, { from: 230, to: 70, drop: 0.12, tau: 0.07, level: 0.8 }),
    // The blast: bright at first, closing fast.
    noiseHit(ctx, out, t, {
      type: 'lowpass',
      freq: 7000,
      to: 400,
      sweep: 0.22,
      q: 0.8,
      tau: 0.06,
      level: 0.75,
    }),
    // The barrel's clank.
    struck(
      ctx,
      out,
      t + 0.002,
      1240,
      [
        { ratio: 1, gain: 1, tau: 0.03 },
        { ratio: 1.41, gain: 0.7, tau: 0.025 },
        { ratio: 2.37, gain: 0.4, tau: 0.018 },
      ],
      0.07,
    ),
    // The low rumble after the shot.
    noiseHit(ctx, out, t + 0.02, {
      type: 'lowpass',
      freq: 220,
      q: 0.7,
      attack: 0.03,
      tau: 0.12,
      level: 0.3,
    }),
  );

/** A metal bar: the modes of a free bar (also the glockenspiel's). */
const BAR: readonly Mode[] = [
  { ratio: 1, gain: 1, tau: 0.12 },
  { ratio: 2.756, gain: 0.42, tau: 0.07 },
  { ratio: 5.404, gain: 0.16, tau: 0.035 },
  { ratio: 8.933, gain: 0.06, tau: 0.018 },
];

const bucketCatch: Recipe = (ctx, out, t) =>
  maxOf(
    struck(ctx, out, t, hz(79), BAR, 0.45),
    boom(ctx, out, t, { from: 160, to: 90, drop: 0.06, tau: 0.05, level: 0.5 }),
    noiseHit(ctx, out, t, { type: 'bandpass', freq: 1800, q: 0.8, tau: 0.01, level: 0.3 }),
    celesta(ctx, out, t + 0.06, hz(88), 0.22, 0.17),
  );

function jingle(
  notes: readonly number[],
  gap: number,
  level: number,
  tau: number,
  chord: readonly number[] = [],
  sparkle = false,
): Recipe {
  return (ctx, out, t) => {
    let end = run(notes, gap, (at, f) => celesta(ctx, out, at, f, level, tau), t);
    const chordAt = t + notes.length * gap;
    for (const m of chord) {
      end = Math.max(
        end,
        brass(ctx, out, chordAt, hz(m), 0.35, 0.035, { attack: 0.05, bright: 0.7 }),
      );
    }
    if (sparkle) {
      end = Math.max(
        end,
        cymbal(ctx, out, chordAt - 0.25, 0.08, { tau: 0.35, hp: 6000, swell: 0.25 }),
        run([96, 100, 103, 108], 0.04, (at, f) => glock(ctx, out, at, f, 0.08), chordAt),
      );
    }
    return end;
  };
}

const coinSpin: Recipe = (ctx, out, t) => {
  const r = mulberry32(nextSeed());
  let at = 0.03;
  let gap = 0.16;
  let k = 0;
  while (at < 1.26) {
    // The two faces ring a little apart; the knocks come faster as the coin settles.
    const f = (k % 2 === 0 ? 760 : 850) * (1 + (r() - 0.5) * 0.01);
    const level = 0.16 - 0.05 * at;
    struck(
      ctx,
      out,
      t + at,
      f,
      [
        { ratio: 1, gain: 1, tau: 0.06 },
        { ratio: 1.48, gain: 0.55, tau: 0.04 },
        { ratio: 2.13, gain: 0.35, tau: 0.025 },
        { ratio: 3.1, gain: 0.15, tau: 0.015 },
      ],
      level,
    );
    noiseHit(ctx, out, t + at, { type: 'bandpass', freq: 2400, q: 1.5, tau: 0.005, level });
    at += gap;
    gap = Math.max(0.034, gap * 0.87);
    k++;
  }
  // The whir of the spin, wobbling faster as the coin settles.
  const g = gainNode(ctx, out);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.07, t + 0.06);
  g.gain.linearRampToValueAtTime(0.05, t + 1.2);
  g.gain.linearRampToValueAtTime(0, t + 1.3);
  const am = gainNode(ctx, g, 0.5);
  const wobble = lfo(ctx, 'sine', 6, 0.5, t, t + 1.3, am.gain);
  glide(wobble.osc.frequency, t, 6, 26, 1.25);
  noiseNode(ctx, t, t + 1.3, filterNode(ctx, 'bandpass', 1500, 3, am));
  return t + 1.35;
};

const coinWon: Recipe = (ctx, out, t) =>
  maxOf(
    struck(
      ctx,
      out,
      t,
      3150,
      [
        { ratio: 1, gain: 1, tau: 0.12 },
        { ratio: 1.33, gain: 0.7, tau: 0.1 },
        { ratio: 1.86, gain: 0.45, tau: 0.07 },
        { ratio: 2.41, gain: 0.3, tau: 0.05 },
      ],
      0.11,
    ),
    noiseHit(ctx, out, t, { type: 'highpass', freq: 4000, q: 0.7, tau: 0.02, level: 0.15 }),
    celesta(ctx, out, t + 0.06, hz(91), 0.3, 0.45),
    celesta(ctx, out, t + 0.15, hz(96), 0.3, 0.6),
  );

/** The coin lands on the losing face: a flat clack and a low two-note "nope". */
const coinLost: Recipe = (ctx, out, t) =>
  maxOf(
    struck(
      ctx,
      out,
      t,
      1950,
      [
        { ratio: 1, gain: 1, tau: 0.03 },
        { ratio: 1.41, gain: 0.5, tau: 0.02 },
      ],
      0.12,
    ),
    boom(ctx, out, t, { from: 180, to: 110, drop: 0.05, tau: 0.04, level: 0.35 }),
    noiseHit(ctx, out, t, { type: 'lowpass', freq: 1400, q: 0.7, tau: 0.02, level: 0.3 }),
    brass(ctx, out, t + 0.09, hz(52), 0.1, 0.13, { bright: 1.3, vibrato: 0 }),
    brass(ctx, out, t + 0.24, hz(47), 0.18, 0.13, { bright: 1.1, vibrato: 0 }),
  );

// ---------------------------------------------------------------------------------------------
// Callouts, warnings, HUD

function stinger(tier: 0 | 1 | 2 | 3): Recipe {
  return (ctx, out, t) => {
    if (tier === 0) {
      return maxOf(
        celesta(ctx, out, t, hz(79), 0.3, 0.3),
        celesta(ctx, out, t + 0.08, hz(84), 0.3, 0.45),
        celesta(ctx, out, t + 0.16, hz(88), 0.18, 0.4),
      );
    }
    const lead = tier === 1 ? [67, 72] : tier === 2 ? [72, 76, 79] : [72, 76, 79, 84];
    const under = tier === 1 ? [64, 67] : tier === 2 ? [67, 72, 76] : [64, 67, 72, 76];
    const last = tier === 3 ? 0.75 : tier === 2 ? 0.55 : 0.42;
    let end = t;
    lead.forEach((m, i) => {
      const final = i === lead.length - 1;
      const at = t + i * 0.085;
      end = Math.max(
        end,
        brass(ctx, out, at, hz(m), final ? last : 0.06, 0.15, { bright: 1.15, vibrato: 12 }),
      );
      const u = under[i];
      if (u !== undefined) brass(ctx, out, at, hz(u), final ? last : 0.06, 0.08, { bright: 0.9 });
    });
    const top = t + (lead.length - 1) * 0.085;
    end = Math.max(
      end,
      run([84, 88, 91, 96], 0.035, (at, f) => celesta(ctx, out, at, f, 0.1, 0.3), top + 0.05),
    );
    if (tier >= 2) {
      end = Math.max(
        end,
        cymbal(ctx, out, top, tier === 3 ? 0.22 : 0.12, { tau: tier === 3 ? 0.5 : 0.3, hp: 4200 }),
      );
    }
    return end;
  };
}

const purple: Recipe = (ctx, out, t) => {
  const g = gainNode(ctx, out);
  const end = perc(g.gain, t, 0.16, 0.03, 0.12);
  const o = oscNode(ctx, 'sine', 700, t, end, g);
  glide(o.frequency, t, 700, 1500, 0.22);
  lfo(ctx, 'sine', 18, 30, t, end, o.detune);
  return Math.max(
    end,
    run([91, 93, 96, 98, 100], 0.055, (at, f) => glock(ctx, out, at, f, 0.08), t + 0.06),
  );
};

const lowBalls: Recipe = (ctx, out, t, n) => {
  const notes = n >= 3 ? [76, 72] : n === 2 ? [77, 74] : [81, 77, 74];
  const gap = n <= 1 ? 0.13 : 0.17;
  let end = run(notes, gap, (at, f) => vibes(ctx, out, at, f, 0.3, 0.32), t);
  if (n <= 1) end = Math.max(end, timpani(ctx, out, t, hz(50), 0.12));
  return end;
};

/** Fever meter step: the tonic arpeggio, an inversion higher at each multiplier. */
const meterStep: Recipe = (ctx, out, t, n) => {
  const notes =
    n >= 10 ? [84, 88, 91, 96] : n >= 5 ? [79, 84, 88] : n >= 3 ? [76, 79, 84] : [72, 76, 79];
  return maxOf(
    noiseHit(ctx, out, t, {
      type: 'bandpass',
      freq: 500,
      to: 4000,
      sweep: 0.22,
      q: 1.4,
      attack: 0.12,
      tau: 0.05,
      level: 0.12,
    }),
    run(notes, 0.055, (at, f) => celesta(ctx, out, at, f, 0.26, 0.35), t + 0.05),
    run(
      notes,
      0.055,
      (at, f, i) =>
        brass(ctx, out, at, f, i === notes.length - 1 ? 0.25 : 0.04, 0.05, { bright: 1.3 }),
      t + 0.05,
    ),
  );
};

const tick: Recipe = (ctx, out, t) => {
  const g = gainNode(ctx, out);
  const end = perc(g.gain, t, 0.3, 0.001, 0.012);
  const o = oscNode(ctx, 'square', 1000, t, end, filterNode(ctx, 'lowpass', 2600, 0.7, g));
  glide(o.frequency, t, 1100, 850, 0.02);
  return end + 0.01;
};

const dialog: Recipe = (ctx, out, t) =>
  maxOf(
    noiseHit(ctx, out, t, {
      type: 'bandpass',
      freq: 600,
      to: 1800,
      sweep: 0.12,
      q: 1.1,
      attack: 0.06,
      tau: 0.035,
      level: 0.3,
    }),
    // The panel lands at the end of its drop (170 ms with a little overshoot).
    boom(ctx, out, t + 0.15, { from: 140, to: 80, drop: 0.05, tau: 0.04, level: 0.3 }),
    noiseHit(ctx, out, t + 0.15, { type: 'lowpass', freq: 900, q: 0.7, tau: 0.02, level: 0.2 }),
  );

const click: Recipe = (ctx, out, t) => {
  const g = gainNode(ctx, out);
  const end = perc(g.gain, t, 0.22, 0.0008, 0.014);
  const o = oscNode(ctx, 'sine', 1300, t, end, g);
  glide(o.frequency, t, 1500, 900, 0.02);
  return maxOf(
    end,
    boom(ctx, out, t, { from: 260, to: 150, drop: 0.03, tau: 0.03, level: 0.45 }),
    noiseHit(ctx, out, t, { type: 'bandpass', freq: 3500, q: 1, tau: 0.003, level: 0.25 }),
  );
};

const hover: Recipe = (ctx, out, t) => {
  const g = gainNode(ctx, out);
  const end = perc(g.gain, t, 0.3, 0.012, 0.09);
  const o = oscNode(ctx, 'sine', 196, t, end, g);
  glide(o.frequency, t, 180, 262, 0.08);
  const o2 = oscNode(ctx, 'sine', 392, t, end, gainNode(ctx, g, 0.2));
  glide(o2.frequency, t, 360, 524, 0.08);
  return end;
};

// ---------------------------------------------------------------------------------------------
// Fever

/**
 * Slow motion: a timpani roll on C that swells into the hit about a second later (slow motion
 * starts 25 ticks ahead of it at 0.25x), then dies away if the hit never comes.
 */
const roll: Recipe = (ctx, out, t) => {
  const r = mulberry32(nextSeed());
  const f = hz(48);
  let at = 0;
  let k = 0;
  let end = t;
  while (at < 1.7) {
    const swell = at < 1 ? 0.12 + 0.88 * Math.pow(at, 1.6) : 1 - (0.75 * (at - 1)) / 0.7;
    const vel = swell * (k % 2 === 0 ? 1 : 0.86) * (0.92 + r() * 0.16);
    end = Math.max(end, timpani(ctx, out, t + at, f, 0.3 * vel, 0.45));
    at += 0.047 + (r() - 0.5) * 0.008;
    k++;
  }
  return end;
};

const crash: Recipe = (ctx, out, t) =>
  cymbal(ctx, out, t, 0.55, { tau: 0.26, hp: 2400, noise: 0.5, scale: 0.85 });

const GONG_RATIOS = [1, 1.53, 2.03, 2.68, 3.05, 3.61, 4.27, 5.12, 6.02, 7.13, 8.4, 9.9];

/** Gong: inharmonic modes whose upper partials bloom after the strike. */
const gong: Recipe = (ctx, out, t) => {
  const r = mulberry32(nextSeed());
  const f = hz(48);
  const partials: Mode[] = GONG_RATIOS.map((ratio, i) => ({
    ratio,
    gain: (i === 0 ? 0.7 : 1) / Math.pow(1 + i * 0.3, 0.5),
    tau: 0.75 / (1 + i * 0.08),
    attack: 0.004 + i * 0.03,
    detune: (r() - 0.5) * 16,
  }));
  const body = gainNode(ctx, out, 1);
  const end = struck(ctx, body, t, f, partials, 0.16);
  return maxOf(
    end,
    boom(ctx, out, t, { from: 90, to: 60, drop: 0.08, tau: 0.08, level: 0.25 }),
    noiseHit(ctx, out, t, { type: 'lowpass', freq: 600, q: 0.7, tau: 0.03, level: 0.3 }),
    // The wash of a large gong.
    noiseHit(ctx, out, t, {
      type: 'bandpass',
      freq: 2500,
      q: 0.8,
      attack: 0.3,
      tau: 0.5,
      level: 0.025,
    }),
  );
};

/** The Fever hit's deep impact (n = 1 for Full Clear: bigger, with a rising sparkle). */
const feverBoom: Recipe = (ctx, out, t, n) => {
  let end = maxOf(
    boom(ctx, out, t, { from: 95, to: 32, drop: 0.45, tau: 0.22, level: 0.8 }),
    noiseHit(ctx, out, t, { type: 'lowpass', freq: 420, q: 0.7, tau: 0.15, level: 0.4 }),
    // The blast around the thump.
    noiseHit(ctx, out, t, {
      type: 'lowpass',
      freq: 4500,
      to: 500,
      sweep: 0.4,
      q: 0.7,
      attack: 0.01,
      tau: 0.12,
      level: 0.35,
    }),
  );
  if (n >= 1) {
    end = maxOf(
      end,
      boom(ctx, out, t + 0.12, { from: 70, to: 30, drop: 0.5, tau: 0.4, level: 0.6 }),
      run([84, 88, 91, 96, 100, 103, 108], 0.045, (at, f) => glock(ctx, out, at, f, 0.12), t),
    );
  }
  return end;
};

/** One letter of the title flying in: letters come from the left and right edges in turn. */
const letter: Recipe = (ctx, out, t, n) => {
  const side = n % 2 === 0 ? -1 : 1;
  const p = panNode(ctx, side * 0.85, out);
  p.pan.setValueAtTime(side * 0.85, t);
  p.pan.linearRampToValueAtTime(side * 0.1, t + 0.3);
  const lift = 1 + 0.07 * Math.min(n, 12);
  return noiseHit(ctx, p, t, {
    type: 'bandpass',
    freq: 300 * lift,
    to: 1900 * lift,
    sweep: 0.2,
    q: 1.6,
    attack: 0.13,
    tau: 0.07,
    level: 0.5,
  });
};

/** The ball lands in a Fever bucket: an impact and a chord, bigger for bigger buckets. */
const feverBucket: Recipe = (ctx, out, t, n) => {
  const big = n >= 100_000 ? 2 : n >= 50_000 ? 1 : 0;
  const chord = big === 2 ? [60, 64, 67, 72, 76] : big === 1 ? [60, 64, 67, 72] : [60, 64, 67];
  const runUp = big === 2 ? [72, 76, 79, 84, 88, 91, 96] : big === 1 ? [72, 76, 79, 84] : [72, 79];
  let end = maxOf(
    boom(ctx, out, t, { from: 120, to: 45, drop: 0.2, tau: 0.16, level: 0.7 }),
    noiseHit(ctx, out, t, { type: 'lowpass', freq: 1500, q: 0.7, tau: 0.04, level: 0.35 }),
    run(runUp, 0.05, (at, f) => celesta(ctx, out, at, f, 0.2, 0.4), t),
  );
  for (const m of chord) {
    end = Math.max(end, brass(ctx, out, t, hz(m), 0.5 + 0.2 * big, 0.07, { bright: 1.2 }));
  }
  if (big === 2) end = Math.max(end, cymbal(ctx, out, t, 0.18, { tau: 0.45, hp: 4000 }));
  return end;
};

/** The bucket's fountain of sparks, then bursts at the presenter's 350, 800, 1300, 1700 ms. */
const fireworks: Recipe = (ctx, out, t) => {
  const r = mulberry32(nextSeed());
  const fountain = gainNode(ctx, out);
  fountain.gain.setValueAtTime(0, t);
  fountain.gain.linearRampToValueAtTime(0.16, t + 0.08);
  fountain.gain.setValueAtTime(0.16, t + 0.6);
  fountain.gain.linearRampToValueAtTime(0, t + 1.25);
  const fizz = gainNode(ctx, fountain, 0.6);
  for (let k = 0; k < 100; k++) fizz.gain.setValueAtTime(0.25 + r() * 0.75, t + k * 0.0125);
  const hp = filterNode(ctx, 'highpass', 1600, 0.7, fizz);
  noiseNode(ctx, t, t + 1.3, filterNode(ctx, 'lowpass', 7000, 0.7, hp));
  let end = t + 1.3;
  for (const at of [0.35, 0.8, 1.3, 1.7]) {
    const pan = (r() - 0.5) * 1.2;
    const pn = panNode(ctx, pan, out);
    end = maxOf(
      end,
      boom(ctx, pn, t + at, { from: 110, to: 38, drop: 0.25, tau: 0.17, level: 0.55 }),
      noiseHit(ctx, pn, t + at, {
        type: 'lowpass',
        freq: 1800,
        to: 300,
        sweep: 0.3,
        q: 0.7,
        tau: 0.09,
        level: 0.5,
      }),
      crackle(ctx, out, t + at + 0.12, 0.85, 28 + Math.floor(r() * 10), 0.13, pan, r),
    );
  }
  return end;
};

/** The rainbow arch: a harp glissando from right to left, then a high shimmer. */
const rainbow: Recipe = (ctx, out, t) => {
  const r = mulberry32(nextSeed());
  const gliss = [96, 93, 91, 88, 86, 84, 81, 79, 76, 74, 72];
  let end = t;
  gliss.forEach((m, i) => {
    const pan = 0.7 - (1.4 * i) / (gliss.length - 1);
    end = Math.max(end, celesta(ctx, panNode(ctx, pan, out), t + i * 0.064, hz(m), 0.14, 0.6));
  });
  for (const m of [84, 88, 91, 96, 100]) {
    const g = gainNode(ctx, out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.5);
    g.gain.setValueAtTime(0.022, t + 1.6);
    g.gain.linearRampToValueAtTime(0, t + 3.1);
    const am = gainNode(ctx, g, 0.6);
    lfo(ctx, 'sine', 5 + r() * 4, 0.4, t, t + 3.1, am.gain);
    oscNode(ctx, 'sine', hz(m), t, t + 3.1, am, (r() - 0.5) * 8);
  }
  for (let i = 0; i < 18; i++) {
    const m = [96, 98, 100, 103, 105, 108, 110][Math.floor(r() * 7)] ?? 96;
    const at = t + 0.5 + r() * 2.1;
    glock(ctx, panNode(ctx, (r() - 0.5) * 1.6, out), at, hz(m), 0.035 * (1 - (at - t) / 3.2));
  }
  noiseHit(ctx, out, t, {
    type: 'highpass',
    freq: 7000,
    q: 0.7,
    attack: 0.6,
    tau: 0.7,
    level: 0.03,
  });
  return Math.max(end, t + 3.2);
};

/** Applause: two dozen clappers, each at its own pace and place, under a soft room noise. */
function applause(full: boolean): Recipe {
  return (ctx, out, t) => {
    const r = mulberry32(nextSeed());
    const clappers = full ? 34 : 24;
    const length = full ? 3.6 : 2.6;
    for (let c = 0; c < clappers; c++) {
      const pn = panNode(ctx, (r() * 2 - 1) * 0.9, out);
      const freq = 650 + r() * 1100;
      const q = 1.2 + r() * 1.5;
      const rate = 3.6 + r() * 1.6;
      const stop = length * (0.55 + r() * 0.45);
      const level = 0.2 + r() * 0.16;
      let at = Math.pow(r(), 2) * 0.45;
      while (at < stop) {
        const rise = Math.min(1, at / 0.35);
        const fall = at > length * 0.5 ? 1 - (0.6 * (at - length * 0.5)) / (length * 0.5) : 1;
        const v = level * rise * fall * (0.8 + r() * 0.4);
        noiseHit(ctx, pn, t + at, { type: 'bandpass', freq, q, tau: 0.008, level: v });
        noiseHit(ctx, pn, t + at + 0.004, {
          type: 'bandpass',
          freq: freq * 1.3,
          q,
          tau: 0.006,
          level: v * 0.5,
        });
        at += (0.85 + r() * 0.3) / rate;
      }
    }
    const bed = gainNode(ctx, out);
    bed.gain.setValueAtTime(0, t);
    bed.gain.linearRampToValueAtTime(0.16, t + 0.4);
    bed.gain.setValueAtTime(0.16, t + length * 0.5);
    bed.gain.linearRampToValueAtTime(0, t + length);
    noiseNode(ctx, t, t + length, filterNode(ctx, 'bandpass', 1500, 0.5, bed));
    if (full) {
      for (const [at, pan] of [
        [0.6, -0.5],
        [1.5, 0.6],
      ] as const) {
        const g = gainNode(ctx, panNode(ctx, pan, out));
        const e = adsr(g.gain, t + at, 0.45, 0.18, 0.04, 0.2, 0.8, 0.06);
        const o = oscNode(ctx, 'sine', 1800, t + at, e, g);
        o.frequency.setValueAtTime(1800, t + at);
        o.frequency.linearRampToValueAtTime(2600, t + at + 0.18);
        o.frequency.linearRampToValueAtTime(2300, t + at + 0.5);
      }
    }
    return t + length + 0.3;
  };
}

/** Level lost: a short sad sting in C minor. */
const lost: Recipe = (ctx, out, t) => {
  let end = run(
    [67, 63, 60],
    0.17,
    (at, f, i) => reed(ctx, out, at, f, i === 2 ? 0.38 : 0.13, 0.16, i === 2 ? 20 : 8),
    t,
  );
  for (const m of [48, 51, 55]) {
    end = Math.max(end, strings(ctx, out, t + 0.34, hz(m), 0.38, 0.03));
  }
  return end;
};

// ---------------------------------------------------------------------------------------------
// Powers

/** Every green hit: a bright sweep up and a ding. */
const powerUp: Recipe = (ctx, out, t) => {
  const vca = gainNode(ctx, out);
  const end = adsr(vca.gain, t, 0.28, 0.16, 0.02, 0.2, 0.7, 0.1);
  const lp = filterNode(ctx, 'lowpass', 300, 8, vca);
  glide(lp.frequency, t, 300, 6000, 0.3);
  for (const [f, d] of [
    [220, -10],
    [330, 8],
  ] as const) {
    const o = oscNode(ctx, 'sawtooth', f, t, end, lp, d);
    glide(o.frequency, t, f, f * 2, 0.3);
  }
  return maxOf(
    end,
    noiseHit(ctx, out, t, {
      type: 'highpass',
      freq: 3000,
      to: 9000,
      sweep: 0.3,
      attack: 0.15,
      tau: 0.08,
      level: 0.1,
    }),
    chime(ctx, out, t + 0.24, hz(91), 0.12, { tau: 0.25 }),
  );
};

const POWER: Readonly<Record<PowerId, Recipe>> = {
  // Guide: a harp arpeggio up a major ninth chord.
  guide: (ctx, out, t) =>
    run([60, 64, 67, 71, 74, 79, 83, 86], 0.05, (at, f) => celesta(ctx, out, at, f, 0.16, 0.7), t),
  // Multiball: two springy boings and a quick happy run.
  multiball: (ctx, out, t) => {
    let end = t;
    for (const [at, from, to] of [
      [0, 180, 620],
      [0.16, 270, 930],
    ] as const) {
      const g = gainNode(ctx, out);
      const e = perc(g.gain, t + at, 0.18, 0.005, 0.1);
      const o = oscNode(ctx, 'sine', from, t + at, e, g);
      glide(o.frequency, t + at, from, to, 0.12);
      lfo(ctx, 'sine', 14, 40, t + at, e, o.detune);
      end = Math.max(end, e);
    }
    return Math.max(
      end,
      run(
        [79, 83, 86, 91],
        0.06,
        (at, f) => brass(ctx, out, at, f, 0.06, 0.07, { bright: 1.4 }),
        t + 0.35,
      ),
    );
  },
  // Pyramid: a desert phrase on a reed over a frame drum.
  pyramid: (ctx, out, t) => {
    const notes = [64, 65, 68, 69, 71, 69, 68, 64];
    const end = run(
      notes,
      0.12,
      (at, f, i) => reed(ctx, out, at, f, i === notes.length - 1 ? 0.4 : 0.1, 0.14),
      t,
    );
    for (const at of [0, 0.48, 0.84]) {
      boom(ctx, out, t + at, { from: 130, to: 90, drop: 0.05, tau: 0.1, level: 0.35 });
    }
    return end;
  },
  // Space Blast: a rising sci-fi warble, then two laser shots.
  spaceBlast: (ctx, out, t) => {
    const g = gainNode(ctx, out);
    const e = adsr(g.gain, t, 0.35, 0.1, 0.03, 0.2, 0.8, 0.05);
    const o = oscNode(ctx, 'sine', 600, t, e, g);
    glide(o.frequency, t, 600, 2400, 0.4);
    lfo(ctx, 'sine', 25, 200, t, e, o.frequency);
    let end = e;
    for (const at of [0.45, 0.65]) {
      const pg = gainNode(ctx, out);
      const pe = perc(pg.gain, t + at, 0.12, 0.002, 0.06);
      const p = oscNode(ctx, 'square', 2500, t + at, pe, filterNode(ctx, 'lowpass', 5000, 1, pg));
      glide(p.frequency, t + at, 2500, 300, 0.18);
      end = Math.max(end, pe);
    }
    return end;
  },
  // Flippers: pinball bells and a final ring.
  flippers: (ctx, out, t) => {
    let end = run(
      [79, 84, 79, 84, 79, 84],
      0.075,
      (at, f) => chime(ctx, out, at, f, 0.18, { tau: 0.12, bright: 1.6 }),
      t,
    );
    end = Math.max(end, chime(ctx, out, t + 0.5, hz(96), 0.2, { tau: 0.35, bright: 1.4 }));
    return end;
  },
  // Spooky Ball: a theremin over a dark organ chord.
  spookyBall: (ctx, out, t) => {
    const g = gainNode(ctx, out);
    const e = adsr(g.gain, t, 1.3, 0.13, 0.08, 0.3, 0.9, 0.2);
    const o = oscNode(ctx, 'sine', hz(76), t, e, g);
    o.frequency.setValueAtTime(hz(76), t);
    o.frequency.exponentialRampToValueAtTime(hz(69), t + 0.5);
    o.frequency.exponentialRampToValueAtTime(hz(72), t + 0.85);
    o.frequency.exponentialRampToValueAtTime(hz(69), t + 1.3);
    lfo(ctx, 'sine', 6.5, 35, t, e, o.detune);
    for (const m of [57, 60, 64]) {
      const og = gainNode(ctx, out);
      adsr(og.gain, t, 1.3, 0.03, 0.3, 0.3, 0.9, 0.25);
      oscNode(ctx, 'square', hz(m), t, t + 2.2, filterNode(ctx, 'lowpass', 900, 0.7, og));
    }
    noiseHit(ctx, out, t, {
      type: 'bandpass',
      freq: 500,
      to: 300,
      sweep: 1.4,
      q: 4,
      attack: 0.5,
      tau: 0.4,
      level: 0.08,
    });
    return Math.max(e, t + 2.2);
  },
  // Flower Power: chimes blooming upward over a soft pad.
  flowerPower: (ctx, out, t) => {
    let end = run(
      [84, 86, 88, 91, 93, 96],
      0.09,
      (at, f) => celesta(ctx, out, at, f, 0.14, 0.6),
      t,
    );
    for (const m of [65, 69, 72, 79]) end = Math.max(end, strings(ctx, out, t, hz(m), 1, 0.022));
    return end;
  },
  // Lucky Spin: a slot machine jingle and a bell.
  luckySpin: (ctx, out, t) =>
    maxOf(
      run(
        [72, 76, 79, 84, 79, 84, 88],
        0.07,
        (at, f) => brass(ctx, out, at, f, 0.055, 0.06, { bright: 1.5 }),
        t,
      ),
      chime(ctx, out, t + 0.5, hz(96), 0.16, { tau: 0.3, bright: 1.8 }),
    ),
  // Fireball: a roar that rises and settles, with crackle.
  fireball: (ctx, out, t) => {
    const r = mulberry32(nextSeed());
    const g = gainNode(ctx, out);
    const e = adsr(g.gain, t, 0.5, 0.35, 0.15, 0.3, 0.6, 0.35);
    const lp = filterNode(ctx, 'lowpass', 300, 1.2, g);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(2800, t + 0.35);
    lp.frequency.exponentialRampToValueAtTime(1200, t + 1.2);
    noiseNode(ctx, t, e, lp);
    return maxOf(
      e,
      boom(ctx, out, t, { from: 70, to: 40, drop: 0.4, tau: 0.4, level: 0.3 }),
      crackle(ctx, out, t + 0.1, 1.1, 25, 0.12, 0, r),
    );
  },
  // Zen Ball: a singing bowl and a breath of wind.
  zenBall: (ctx, out, t) =>
    maxOf(
      bowl(ctx, out, t, hz(67), 0.18, 1.6),
      noiseHit(ctx, out, t, {
        type: 'bandpass',
        freq: 700,
        q: 2,
        attack: 0.6,
        tau: 0.5,
        level: 0.04,
      }),
    ),
};

const MOMENT: Readonly<Record<PowerMoment, Recipe>> = {
  multiballSpawn: (ctx, out, t) => {
    let end = t;
    for (const [at, from, to] of [
      [0, 300, 900],
      [0.08, 450, 1350],
    ] as const) {
      const g = gainNode(ctx, out);
      const e = perc(g.gain, t + at, 0.18, 0.003, 0.05);
      const o = oscNode(ctx, 'sine', from, t + at, e, g);
      glide(o.frequency, t + at, from, to, 0.06);
      end = Math.max(end, e);
    }
    return end;
  },
  bucketChange: (ctx, out, t) => {
    const g = gainNode(ctx, out);
    const e = adsr(g.gain, t, 0.3, 0.1, 0.03, 0.2, 0.9, 0.03);
    const bp = filterNode(ctx, 'bandpass', 400, 3, g);
    glide(bp.frequency, t, 400, 1400, 0.32);
    oscNode(ctx, 'sawtooth', 90, t, e, bp);
    return maxOf(
      e,
      boom(ctx, out, t + 0.33, { from: 150, to: 90, drop: 0.04, tau: 0.04, level: 0.35 }),
      noiseHit(ctx, out, t + 0.33, { type: 'lowpass', freq: 1200, q: 0.7, tau: 0.02, level: 0.25 }),
      struck(ctx, out, t + 0.33, 600, BAR, 0.08),
    );
  },
  spaceBlast: (ctx, out, t) => {
    const g = gainNode(ctx, out);
    const e = perc(g.gain, t, 0.1, 0.002, 0.12);
    const laser = oscNode(ctx, 'sine', 1800, t, e, g);
    glide(laser.frequency, t, 1800, 120, 0.35);
    return maxOf(
      e,
      noiseHit(ctx, out, t, {
        type: 'lowpass',
        freq: 2600,
        to: 180,
        sweep: 0.6,
        q: 0.7,
        attack: 0.004,
        tau: 0.28,
        level: 0.6,
      }),
      boom(ctx, out, t, { from: 75, to: 28, drop: 0.5, tau: 0.35, level: 0.7 }),
      noiseHit(ctx, out, t, {
        type: 'highpass',
        freq: 4000,
        q: 0.7,
        attack: 0.05,
        tau: 0.4,
        level: 0.08,
      }),
    );
  },
  flowerPower: (ctx, out, t) =>
    maxOf(
      run([84, 86, 88, 91, 93, 96, 98, 100], 0.035, (at, f) => glock(ctx, out, at, f, 0.12), t),
      noiseHit(ctx, out, t, {
        type: 'bandpass',
        freq: 800,
        to: 5000,
        sweep: 0.3,
        q: 1,
        attack: 0.15,
        tau: 0.08,
        level: 0.08,
      }),
    ),
  flipperUp: (ctx, out, t) =>
    maxOf(
      noiseHit(ctx, out, t, { type: 'bandpass', freq: 2600, q: 1.2, tau: 0.006, level: 0.35 }),
      boom(ctx, out, t, { from: 170, to: 95, drop: 0.03, tau: 0.025, level: 0.4 }),
      struck(
        ctx,
        out,
        t,
        1150,
        [
          { ratio: 1, gain: 1, tau: 0.05 },
          { ratio: 2.5, gain: 0.6, tau: 0.03 },
        ],
        0.06,
      ),
    ),
  flipperDown: (ctx, out, t) =>
    maxOf(
      noiseHit(ctx, out, t, { type: 'bandpass', freq: 1500, q: 1.2, tau: 0.005, level: 0.25 }),
      boom(ctx, out, t, { from: 120, to: 80, drop: 0.02, tau: 0.02, level: 0.25 }),
    ),
  spookyReturn: (ctx, out, t) => {
    const g = gainNode(ctx, out);
    const e = adsr(g.gain, t, 0.6, 0.15, 0.1, 0.2, 0.9, 0.12);
    const o = oscNode(ctx, 'sine', 320, t, e, g);
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(640, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.7);
    lfo(ctx, 'sine', 6, 40, t, e, o.detune);
    return maxOf(
      e,
      noiseHit(ctx, out, t, {
        type: 'bandpass',
        freq: 800,
        to: 400,
        sweep: 0.7,
        q: 3,
        attack: 0.2,
        tau: 0.2,
        level: 0.08,
      }),
    );
  },
  spinStart: (ctx, out, t) => {
    let at = 0;
    let gap = 0.09;
    let end = t;
    for (let i = 0; i < 10; i++) {
      end = Math.max(end, spinClick(ctx, out, t + at));
      at += gap;
      gap = Math.max(0.035, gap * 0.88);
    }
    return Math.max(
      end,
      noiseHit(ctx, out, t, {
        type: 'bandpass',
        freq: 800,
        to: 2000,
        sweep: 0.5,
        q: 2,
        attack: 0.2,
        tau: 0.1,
        level: 0.06,
      }),
    );
  },
  spinTick: (ctx, out, t) => spinClick(ctx, out, t),
  spinResult: (ctx, out, t) => {
    let end = maxOf(
      chime(ctx, out, t, hz(96), 0.22, { tau: 0.3, bright: 1.8 }),
      run([84, 88, 91, 96], 0.06, (at, f) => celesta(ctx, out, at, f, 0.15, 0.45), t + 0.08),
    );
    for (const m of [72, 76, 79]) {
      end = Math.max(end, brass(ctx, out, t + 0.3, hz(m), 0.25, 0.06, { bright: 1.2 }));
    }
    return end;
  },
  fireballLaunch: (ctx, out, t) => {
    const r = mulberry32(nextSeed());
    return maxOf(
      noiseHit(ctx, out, t, {
        type: 'bandpass',
        freq: 400,
        to: 3200,
        sweep: 0.35,
        q: 0.9,
        attack: 0.08,
        tau: 0.3,
        level: 0.45,
      }),
      boom(ctx, out, t, { from: 90, to: 40, drop: 0.3, tau: 0.25, level: 0.35 }),
      crackle(ctx, out, t + 0.05, 0.9, 15, 0.1, 0, r),
    );
  },
  fireballBurn: (ctx, out, t) => {
    const r = mulberry32(nextSeed());
    return maxOf(
      noiseHit(ctx, out, t, { type: 'bandpass', freq: 1800, q: 0.6, tau: 0.07, level: 0.25 }),
      crackle(ctx, out, t, 0.15, 6, 0.1, 0, r),
      boom(ctx, out, t, { from: 200, to: 120, drop: 0.03, tau: 0.02, level: 0.15 }),
    );
  },
  zenShot: (ctx, out, t) =>
    maxOf(
      noiseHit(ctx, out, t, {
        type: 'bandpass',
        freq: 700,
        to: 2000,
        sweep: 0.3,
        q: 1.2,
        attack: 0.12,
        tau: 0.12,
        level: 0.18,
      }),
      bowl(ctx, out, t + 0.15, hz(79), 0.1, 0.8),
    ),
  powerEnd: (ctx, out, t) =>
    maxOf(
      brass(ctx, out, t, hz(79), 0.1, 0.06, { bright: 0.6, vibrato: 0 }),
      brass(ctx, out, t + 0.13, hz(72), 0.18, 0.06, { bright: 0.45, vibrato: 0 }),
    ),
};

function spinClick(ctx: Ctx, out: AudioNode, t: number): number {
  return maxOf(
    noiseHit(ctx, out, t, { type: 'bandpass', freq: 3000, q: 2, tau: 0.004, level: 0.3 }),
    struck(ctx, out, t, 1900, [{ ratio: 1, gain: 1, tau: 0.008 }], 0.12),
  );
}

// ---------------------------------------------------------------------------------------------
// The table

// Levels are trims measured with `npm run audio:render -- --raw`: each sound's peak going into
// the limiter (threshold -10 dBFS), at full volume. Targets: about -11 for the big moments
// (jingles, gong, fireworks, stingers, powers), -14 for a peg hit (a fast run reaches about -10),
// -18 for a pop, -17 for a click, -22 for a count tick, -24 for a hover. The original's relative
// levels (visual guide 14 and its resource volumes) set the order.

const HIT = { level: 0.27, wet: 0.1, pool: 'hit', voices: 6, spacing: 0.035, maxDelay: 0.35 };

const POWER_LEVEL: Readonly<Record<PowerId, number>> = {
  guide: 0.39,
  multiball: 1.35,
  pyramid: 0.62,
  spaceBlast: 1.78,
  flippers: 0.77,
  spookyBall: 1.13,
  flowerPower: 0.54,
  luckySpin: 1.12,
  fireball: 0.83,
  zenBall: 0.59,
};

function powerDefs(): Record<`power.${PowerId}`, SoundDef> {
  const out = {} as Record<`power.${PowerId}`, SoundDef>;
  for (const id of Object.keys(POWER) as PowerId[]) {
    out[`power.${id}`] = { level: POWER_LEVEL[id], wet: 0.3, voices: 2, play: POWER[id] };
  }
  return out;
}

/** Levels per moment, and limits for the ones that repeat fast or run long. */
const MOMENT_POLICY: Readonly<Record<PowerMoment, Partial<SoundDef>>> = {
  multiballSpawn: { level: 0.87 },
  bucketChange: { level: 0.43 },
  spaceBlast: { level: 0.29, long: true, wet: 0.35 },
  flowerPower: { level: 0.35 },
  // The original plays its flipper sounds at a quarter volume.
  flipperUp: { level: 0.21, spacing: 0.03 },
  flipperDown: { level: 0.25, spacing: 0.03 },
  spookyReturn: { level: 1.35, wet: 0.45 },
  spinStart: { level: 0.81 },
  spinTick: { level: 0.55, voices: 4, spacing: 0.025, maxDelay: 0.06 },
  spinResult: { level: 0.51 },
  fireballLaunch: { level: 0.7 },
  fireballBurn: { level: 0.61, voices: 3, spacing: 0.06 },
  zenShot: { level: 0.8 },
  powerEnd: { level: 1.48 },
};

function momentDefs(): Record<`moment.${PowerMoment}`, SoundDef> {
  const out = {} as Record<`moment.${PowerMoment}`, SoundDef>;
  for (const id of Object.keys(MOMENT) as PowerMoment[]) {
    out[`moment.${id}`] = { level: 1, wet: 0.2, voices: 3, ...MOMENT_POLICY[id], play: MOMENT[id] };
  }
  return out;
}

export const SOUNDS: Readonly<Record<SoundId, SoundDef>> = {
  'hit.blue': { ...HIT, play: pegHit('blue') },
  'hit.orange': { ...HIT, play: pegHit('orange') },
  'hit.green': { ...HIT, play: pegHit('green') },
  'hit.purple': { ...HIT, play: pegHit('purple') },
  pop: { level: 0.24, wet: 0.1, voices: 8, spacing: 0.02, maxDelay: 0.08, play: pegPop },
  cannon: { level: 0.21, wet: 0.12, voices: 2, play: cannon },
  bucket: { level: 0.26, wet: 0.12, voices: 2, play: bucketCatch },
  'free.bucket': {
    level: 0.26,
    wet: 0.3,
    pool: 'free',
    voices: 2,
    play: jingle([76, 79, 84, 88, 91], 0.065, 0.3, 0.42),
  },
  'free.t1': {
    level: 0.26,
    wet: 0.3,
    pool: 'free',
    voices: 2,
    play: jingle([67, 72, 76, 79, 84, 88], 0.07, 0.3, 0.42),
  },
  'free.t2': {
    level: 0.25,
    wet: 0.3,
    pool: 'free',
    voices: 2,
    play: jingle([72, 76, 79, 84, 88, 91, 96], 0.065, 0.3, 0.45, [60, 64, 67]),
  },
  'free.t3': {
    level: 0.2,
    wet: 0.3,
    pool: 'free',
    voices: 2,
    play: jingle([72, 76, 79, 84, 86, 88, 91, 96], 0.055, 0.3, 0.5, [60, 64, 67, 72], true),
  },
  'free.coin': {
    level: 0.35,
    wet: 0.3,
    pool: 'free',
    voices: 2,
    play: jingle([79, 84, 88], 0.07, 0.28, 0.4),
  },
  coinSpin: {
    level: 0.6,
    wet: 0.15,
    long: true,
    voices: 1,
    prerender: { seconds: 1.8, channels: 1 },
    play: coinSpin,
  },
  coinWon: { level: 0.49, wet: 0.25, voices: 1, play: coinWon },
  coinLost: { level: 0.41, wet: 0.15, voices: 1, play: coinLost },
  'style.small': { level: 0.43, wet: 0.25, pool: 'style', voices: 3, play: stinger(0) },
  'style.medium': { level: 0.56, wet: 0.25, pool: 'style', voices: 3, play: stinger(1) },
  'style.big': { level: 0.59, wet: 0.25, pool: 'style', voices: 3, play: stinger(2) },
  'style.huge': { level: 0.57, wet: 0.25, pool: 'style', voices: 3, play: stinger(3) },
  purple: { level: 0.65, wet: 0.3, voices: 2, play: purple },
  low: { level: 0.59, wet: 0.25, voices: 1, play: lowBalls },
  meter: { level: 0.39, wet: 0.25, voices: 2, spacing: 0.1, maxDelay: 0.3, play: meterStep },
  tick: { level: 0.23, wet: 0.05, voices: 2, spacing: 0.035, play: tick },
  dialog: { level: 0.31, wet: 0.15, voices: 2, play: dialog },
  click: { level: 0.23, wet: 0.08, voices: 2, spacing: 0.03, play: click },
  hover: { level: 0.2, wet: 0.08, voices: 2, spacing: 0.06, play: hover },
  roll: {
    level: 0.31,
    wet: 0.35,
    long: true,
    voices: 1,
    prerender: { seconds: 3.4, channels: 1 },
    play: roll,
  },
  // The Fever hit stacks the cymbal, the gong and the boom: each sits 3 dB under the big-moment
  // target so the three together stay near the limiter's threshold.
  cymbal: {
    level: 0.33,
    wet: 0.3,
    long: true,
    voices: 1,
    prerender: { seconds: 3, channels: 1 },
    play: crash,
  },
  gong: {
    level: 0.3,
    wet: 0.4,
    long: true,
    voices: 1,
    prerender: { seconds: 4.5, channels: 1 },
    play: gong,
  },
  feverBoom: { level: 0.23, wet: 0.25, voices: 1, play: feverBoom },
  letter: { level: 1.07, wet: 0.2, voices: 6, spacing: 0.04, maxDelay: 0.2, play: letter },
  feverBucket: { level: 0.3, wet: 0.3, voices: 2, play: feverBucket },
  fireworks: {
    level: 0.46,
    wet: 0.3,
    long: true,
    voices: 1,
    prerender: { seconds: 3.2, channels: 2 },
    play: fireworks,
  },
  rainbow: {
    level: 0.42,
    wet: 0.4,
    long: true,
    voices: 1,
    prerender: { seconds: 3.4, channels: 2 },
    play: rainbow,
  },
  applause: {
    level: 1.4,
    wet: 0.3,
    long: true,
    pool: 'applause',
    voices: 1,
    prerender: { seconds: 3, channels: 2 },
    play: applause(false),
  },
  applauseFull: {
    level: 0.78,
    wet: 0.3,
    long: true,
    pool: 'applause',
    voices: 1,
    prerender: { seconds: 4, channels: 2 },
    play: applause(true),
  },
  lost: { level: 1, wet: 0.3, voices: 1, play: lost },
  powerUp: { level: 0.46, wet: 0.25, voices: 2, play: powerUp },
  ...powerDefs(),
  ...momentDefs(),
};

export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];
