// Synthesis building blocks for Teggle's sound effects and music. Everything takes a
// BaseAudioContext, so the same code plays live and renders offline (the buffers made at startup
// and the WAV renders for review), and every instrument returns the context time at which its
// sound has died away. No recorded samples anywhere: oscillators, generated noise, filters,
// envelopes and a generated room impulse.

export type Ctx = BaseAudioContext;

/** A percussive envelope with time constant tau is 60 dB down after this many taus. */
export const T60 = 6.91;

// ---------------------------------------------------------------------------------------------
// Randomness (seeded, so renders repeat exactly)

/** mulberry32: a small, fast PRNG; returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let seedState = 0x51ed;

/** A fresh seed for one sound's random details (crackles, claps), different every call. */
export function nextSeed(): number {
  seedState = (seedState + 0x9e3779b9) >>> 0;
  return seedState;
}

/** Restarts the seed sequence (renders call this so every run is identical). */
export function resetSeeds(seed = 0x51ed): void {
  seedState = seed >>> 0;
}

// ---------------------------------------------------------------------------------------------
// Nodes

export function gainNode(ctx: Ctx, dest: AudioNode, value = 0): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(dest);
  return g;
}

/** A gain feeding an AudioParam (FM depth, vibrato, tremolo). */
export function modGain(ctx: Ctx, param: AudioParam, value = 0): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(param);
  return g;
}

export function oscNode(
  ctx: Ctx,
  type: OscillatorType,
  freq: number,
  t: number,
  end: number,
  dest: AudioNode,
  detune = 0,
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  if (detune !== 0) o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(Math.max(t + 0.01, end));
  return o;
}

/** An oscillator feeding an AudioParam through a gain (an LFO or an FM modulator). */
export function lfo(
  ctx: Ctx,
  type: OscillatorType,
  freq: number,
  depth: number,
  t: number,
  end: number,
  param: AudioParam,
): { osc: OscillatorNode; depth: GainNode } {
  const g = modGain(ctx, param, depth);
  const o = oscNode(ctx, type, freq, t, end, g);
  return { osc: o, depth: g };
}

export function filterNode(
  ctx: Ctx,
  type: BiquadFilterType,
  freq: number,
  q: number,
  dest: AudioNode,
  gainDb = 0,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  if (gainDb !== 0) f.gain.value = gainDb;
  f.connect(dest);
  return f;
}

export function panNode(ctx: Ctx, pan: number, dest: AudioNode): StereoPannerNode {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(dest);
  return p;
}

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();
const NOISE_SECONDS = 2;

/** Two seconds of white noise, made once per context. */
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (b === undefined) {
    const len = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = mulberry32(0x7e991e);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** White noise from `t` to `end`, from a random point in the loop. */
export function noiseNode(
  ctx: Ctx,
  t: number,
  end: number,
  dest: AudioNode,
  rate = 1,
): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.playbackRate.value = rate;
  s.connect(dest);
  s.start(t, mulberry32(nextSeed())() * NOISE_SECONDS);
  s.stop(Math.max(t + 0.01, end));
  return s;
}

// ---------------------------------------------------------------------------------------------
// Envelopes

/** 0 to `peak` over `attack`, then an exponential fall with time constant `tau`. Returns its end. */
export function perc(p: AudioParam, t: number, peak: number, attack: number, tau: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(0, t + attack, tau);
  return t + attack + T60 * tau;
}

/**
 * Attack to `peak`, decay toward `peak * sustain`, hold until `t + hold`, release. Returns its
 * end. Time constants, not times, for decay and release.
 */
export function adsr(
  p: AudioParam,
  t: number,
  hold: number,
  peak: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(peak * sustain, t + attack, decay);
  const off = t + Math.max(hold, attack + 0.001);
  p.setTargetAtTime(0, off, release);
  return off + T60 * release;
}

/** Exponential glide of a frequency-like parameter. */
export function glide(p: AudioParam, t: number, from: number, to: number, time: number): void {
  p.setValueAtTime(from, t);
  p.exponentialRampToValueAtTime(Math.max(1e-4, to), t + Math.max(0.001, time));
}

// ---------------------------------------------------------------------------------------------
// Instruments

/** One vibrating mode of a struck object: its frequency ratio, level and decay. */
export interface Mode {
  readonly ratio: number;
  readonly gain: number;
  readonly tau: number;
  readonly attack?: number;
  /** Cents. */
  readonly detune?: number;
}

/** A struck object as a sum of decaying sine modes. */
export function struck(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  freq: number,
  partials: readonly Mode[],
  level: number,
): number {
  let end = t;
  for (const p of partials) {
    const f = freq * p.ratio;
    if (f >= ctx.sampleRate / 2) continue;
    const g = gainNode(ctx, dest);
    const e = perc(g.gain, t, level * p.gain, p.attack ?? 0.002, p.tau);
    oscNode(ctx, 'sine', f, t, e, g, p.detune ?? 0);
    end = Math.max(end, e);
  }
  return end;
}

export interface ChimeOptions {
  /** Decay time constant of the body. */
  readonly tau?: number;
  /** FM depth at the strike, as a multiple of the frequency. */
  readonly bright?: number;
  /** FM modulator ratio (3.5 rings glassy, 1 harmonic and warm). */
  readonly ratio?: number;
  readonly strikeTau?: number;
  /** Level of the octave partial. */
  readonly octave?: number;
  /** Level of the twelfth (3x). */
  readonly twelfth?: number;
}

/** A struck chime: an FM strike that fades into a sine with a shimmering octave. */
export function chime(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  freq: number,
  level: number,
  o: ChimeOptions = {},
): number {
  const tau = o.tau ?? 0.1;
  const body = gainNode(ctx, dest);
  let end = perc(body.gain, t, level, 0.002, tau);
  const car = oscNode(ctx, 'sine', freq, t, end, body);
  const mod = lfo(ctx, 'sine', freq * (o.ratio ?? 3.5), 0, t, end, car.frequency);
  perc(mod.depth.gain, t, freq * (o.bright ?? 1.2), 0.0005, o.strikeTau ?? 0.03);
  const extra: Mode[] = [];
  const octave = o.octave ?? 0.25;
  if (octave > 0) extra.push({ ratio: 2.0035, gain: octave, tau: tau * 0.55 });
  if ((o.twelfth ?? 0) > 0) extra.push({ ratio: 3.002, gain: o.twelfth ?? 0, tau: tau * 0.4 });
  if (extra.length > 0) end = Math.max(end, struck(ctx, dest, t, freq, extra, level));
  return end;
}

/** Celesta: a felt hammer on a metal bar; bright for an instant, then nearly a pure tone. */
export function celesta(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  freq: number,
  level: number,
  tau = 0.45,
): number {
  const end = chime(ctx, dest, t, freq, level, {
    tau,
    ratio: 1,
    bright: 2.4,
    strikeTau: 0.05,
    octave: 0.1,
  });
  struck(ctx, dest, t, freq, [{ ratio: 4.01, gain: 0.12, tau: 0.04 }], level);
  return end;
}

const GLOCK: readonly Mode[] = [
  { ratio: 1, gain: 1, tau: 0.55 },
  { ratio: 2.76, gain: 0.3, tau: 0.16 },
  { ratio: 5.4, gain: 0.1, tau: 0.06 },
  { ratio: 8.93, gain: 0.04, tau: 0.025 },
];

/** Glockenspiel: the modes of a free bar. */
export function glock(ctx: Ctx, dest: AudioNode, t: number, freq: number, level: number): number {
  return struck(ctx, dest, t, freq, GLOCK, level);
}

/** Frequencies of the classic six-square metal source (drum machine cymbals and hats). */
const METAL_HZ = [205.3, 304.4, 369.6, 522.7, 540, 800];

/** A dense, clangy source: six square waves at unrelated pitches, summed. */
export function metal(ctx: Ctx, dest: AudioNode, t: number, end: number, scale = 1): void {
  const mix = gainNode(ctx, dest, 1 / METAL_HZ.length);
  for (const f of METAL_HZ) oscNode(ctx, 'square', f * scale, t, end, mix);
}

export interface CymbalOptions {
  /** Time constant of the long wash. */
  readonly tau: number;
  /** Highpass corner. */
  readonly hp: number;
  /** Pitch scale of the metal source. */
  readonly scale?: number;
  /** Share of white noise in the wash. */
  readonly noise?: number;
  /** Seconds of swell before the peak (0 for a struck crash). */
  readonly swell?: number;
}

/** A crash cymbal (or a hat, with a short tau): metal plus noise, highpassed and shaped. */
export function cymbal(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  level: number,
  o: CymbalOptions,
): number {
  const swell = o.swell ?? 0;
  const attack = swell > 0 ? swell : 0.003;
  const end = t + attack + 0.1 + T60 * o.tau;
  const vca = gainNode(ctx, dest);
  const g = vca.gain;
  g.setValueAtTime(0, t);
  if (swell > 0) {
    g.linearRampToValueAtTime(level * 0.05, t + swell * 0.5);
    g.exponentialRampToValueAtTime(level, t + swell);
  } else {
    g.linearRampToValueAtTime(level, t + attack);
  }
  // A bright splash that settles into the long wash.
  g.setTargetAtTime(level * 0.45, t + attack, 0.04);
  g.setTargetAtTime(0, t + attack + 0.1, o.tau);
  // The square waves' highest harmonics would sound thin and fizzy: roll them off above 10 kHz.
  const top = filterNode(ctx, 'lowpass', 10000, 0.7, vca);
  const hp = filterNode(ctx, 'highpass', o.hp, 0.7, top);
  const shine = filterNode(ctx, 'peaking', 6000, 0.9, hp, 3);
  metal(ctx, shine, t, end, o.scale ?? 1);
  const n = gainNode(ctx, shine, o.noise ?? 0.5);
  noiseNode(ctx, t, end, n);
  return end;
}

/** Hi-hat: the cymbal source, very short. */
export function hat(ctx: Ctx, dest: AudioNode, t: number, level: number, tau = 0.022): number {
  const vca = gainNode(ctx, dest);
  const end = perc(vca.gain, t, level, 0.001, tau);
  const hp = filterNode(ctx, 'highpass', 7200, 0.7, vca);
  metal(ctx, hp, t, end, 1.6);
  noiseNode(ctx, t, end, gainNode(ctx, hp, 0.4));
  return end;
}

export function kick(ctx: Ctx, dest: AudioNode, t: number, level: number): number {
  const g = gainNode(ctx, dest);
  const end = perc(g.gain, t, level, 0.002, 0.1);
  const o = oscNode(ctx, 'sine', 150, t, end, g);
  glide(o.frequency, t, 150, 47, 0.09);
  // Beater click.
  const c = gainNode(ctx, dest);
  perc(c.gain, t, level * 0.22, 0.0005, 0.004);
  noiseNode(ctx, t, t + 0.04, filterNode(ctx, 'lowpass', 3500, 0.7, c));
  return end;
}

export function snare(ctx: Ctx, dest: AudioNode, t: number, level: number, tau = 0.065): number {
  const body = gainNode(ctx, dest);
  perc(body.gain, t, level * 0.55, 0.001, 0.045);
  const o = oscNode(ctx, 'triangle', 200, t, t + 0.35, body);
  glide(o.frequency, t, 200, 165, 0.05);
  const wires = gainNode(ctx, dest);
  const end = perc(wires.gain, t, level, 0.001, tau);
  const hp = filterNode(ctx, 'highpass', 1700, 0.7, wires);
  noiseNode(ctx, t, end, filterNode(ctx, 'peaking', 4200, 1, hp, 4));
  return Math.max(end, t + 0.35);
}

const TIMPANI: readonly Mode[] = [
  { ratio: 1, gain: 1, tau: 0.85 },
  { ratio: 1.504, gain: 0.6, tau: 0.5 },
  { ratio: 1.742, gain: 0.35, tau: 0.35 },
  { ratio: 2.0, gain: 0.4, tau: 0.32 },
  { ratio: 2.245, gain: 0.25, tau: 0.22 },
  { ratio: 2.494, gain: 0.18, tau: 0.18 },
];

/** Timpani: the head's modes, starting a little sharp as the stroke stretches the head. */
export function timpani(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  freq: number,
  level: number,
  tauScale = 1,
): number {
  let end = t;
  for (const p of TIMPANI) {
    const g = gainNode(ctx, dest);
    const e = perc(g.gain, t, level * p.gain, 0.003, p.tau * tauScale);
    const o = oscNode(ctx, 'sine', freq * p.ratio, t, e, g);
    o.frequency.setValueAtTime(freq * p.ratio * 1.03, t);
    o.frequency.setTargetAtTime(freq * p.ratio, t, 0.035);
    end = Math.max(end, e);
  }
  // The felt mallet.
  const stick = gainNode(ctx, dest);
  perc(stick.gain, t, level * 0.6, 0.001, 0.012);
  noiseNode(ctx, t, t + 0.1, filterNode(ctx, 'lowpass', 2400, 0.8, stick));
  return end;
}

export interface ToneOptions {
  readonly attack?: number;
  /** Filter brightness, 1 normal. */
  readonly bright?: number;
  /** Vibrato depth in cents on long notes. */
  readonly vibrato?: number;
  /** Pan, -1 to 1. */
  readonly pan?: number;
}

/** Brass: two detuned saws, a filter that opens on the attack, a scoop up to pitch, vibrato. */
export function brass(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  freq: number,
  hold: number,
  level: number,
  o: ToneOptions = {},
): number {
  const out = o.pan === undefined ? dest : panNode(ctx, o.pan, dest);
  const a = o.attack ?? 0.03;
  const vca = gainNode(ctx, out);
  const end = adsr(vca.gain, t, hold, level, a, 0.09, 0.78, 0.07);
  const bright = o.bright ?? 1;
  const nyq = ctx.sampleRate * 0.45;
  const lp = filterNode(ctx, 'lowpass', freq * 1.2, 1.3, vca);
  lp.frequency.setValueAtTime(freq * 1.2, t);
  lp.frequency.linearRampToValueAtTime(Math.min(nyq, freq * 7 * bright), t + a + 0.01);
  lp.frequency.setTargetAtTime(Math.min(nyq, freq * 4 * bright), t + a + 0.01, 0.1);
  lp.frequency.setTargetAtTime(freq * 1.4, t + Math.max(hold, a + 0.02), 0.05);
  const s1 = oscNode(ctx, 'sawtooth', freq, t, end, lp, -7);
  const s2 = oscNode(ctx, 'sawtooth', freq, t, end, lp, 7);
  glide(s1.frequency, t, freq * 0.985, freq, 0.035);
  glide(s2.frequency, t, freq * 0.985, freq, 0.035);
  const vib = o.vibrato ?? 9;
  if (hold > 0.5 && vib > 0) {
    const v = lfo(ctx, 'sine', 5.4, 0, t, end, s1.detune);
    v.depth.connect(s2.detune);
    v.depth.gain.setValueAtTime(0, t + 0.25);
    v.depth.gain.linearRampToValueAtTime(vib, t + 0.6);
  }
  return end;
}

/** Strings: three detuned saws, soft attack, gently filtered. */
export function strings(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  freq: number,
  hold: number,
  level: number,
): number {
  const vca = gainNode(ctx, dest);
  const end = adsr(vca.gain, t, hold, level, 0.09, 0.25, 0.85, 0.2);
  const lp = filterNode(ctx, 'lowpass', Math.min(5200, freq * 5), 0.6, vca);
  const saws = [-11, 0, 11].map((d) => oscNode(ctx, 'sawtooth', freq, t, end, lp, d));
  const vibrato = ctx.createGain();
  vibrato.gain.value = 5;
  for (const s of saws) vibrato.connect(s.detune);
  oscNode(ctx, 'sine', 4.8, t, end, vibrato);
  return end;
}

/** Bass: a plucky triangle with a little square for edge. */
export function bass(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  freq: number,
  hold: number,
  level: number,
): number {
  const vca = gainNode(ctx, dest);
  const end = adsr(vca.gain, t, hold, level, 0.006, 0.12, 0.65, 0.05);
  const lp = filterNode(ctx, 'lowpass', freq * 8, 1.6, vca);
  lp.frequency.setValueAtTime(freq * 8, t);
  lp.frequency.setTargetAtTime(freq * 3, t, 0.08);
  oscNode(ctx, 'triangle', freq, t, end, lp);
  oscNode(ctx, 'square', freq, t, end, gainNode(ctx, lp, 0.3));
  return end;
}

/** Reed: a nasal square through a vowel-like band, with vibrato (snake charmer, sad sting). */
export function reed(
  ctx: Ctx,
  dest: AudioNode,
  t: number,
  freq: number,
  hold: number,
  level: number,
  vibrato = 14,
): number {
  const vca = gainNode(ctx, dest);
  const end = adsr(vca.gain, t, hold, level, 0.025, 0.1, 0.8, 0.06);
  const band = filterNode(ctx, 'bandpass', Math.max(700, freq * 3), 1.2, vca);
  const lp = filterNode(ctx, 'lowpass', 3200, 0.7, band);
  const o = oscNode(ctx, 'square', freq, t, end, lp);
  const v = lfo(ctx, 'sine', 5.6, 0, t, end, o.detune);
  v.depth.gain.setValueAtTime(0, t + 0.12);
  v.depth.gain.linearRampToValueAtTime(vibrato, t + 0.4);
  return end;
}

export interface NoiseHitOptions {
  readonly type: BiquadFilterType;
  readonly freq: number;
  readonly q?: number;
  /** Filter glides to this frequency over `sweep` seconds. */
  readonly to?: number;
  readonly sweep?: number;
  readonly attack?: number;
  readonly tau: number;
  readonly level: number;
  readonly pan?: number;
}

/** Filtered noise with a percussive envelope (puffs, whooshes, crackles, claps). */
export function noiseHit(ctx: Ctx, dest: AudioNode, t: number, o: NoiseHitOptions): number {
  const out = o.pan === undefined ? dest : panNode(ctx, o.pan, dest);
  const g = gainNode(ctx, out);
  const end = perc(g.gain, t, o.level, o.attack ?? 0.002, o.tau);
  const f = filterNode(ctx, o.type, o.freq, o.q ?? 1, g);
  if (o.to !== undefined) glide(f.frequency, t, o.freq, o.to, o.sweep ?? 0.2);
  noiseNode(ctx, t, end, f);
  return end;
}

export interface BoomOptions {
  readonly from: number;
  readonly to: number;
  /** Seconds for the pitch to fall. */
  readonly drop: number;
  readonly tau: number;
  readonly level: number;
  readonly attack?: number;
}

/** A sine that falls in pitch: kicks, thumps, explosions' low end. */
export function boom(ctx: Ctx, dest: AudioNode, t: number, o: BoomOptions): number {
  const g = gainNode(ctx, dest);
  const end = perc(g.gain, t, o.level, o.attack ?? 0.003, o.tau);
  const s = oscNode(ctx, 'sine', o.from, t, end, g);
  glide(s.frequency, t, o.from, o.to, o.drop);
  return end;
}

// ---------------------------------------------------------------------------------------------
// Room

const rooms = new WeakMap<Ctx, AudioBuffer>();

/**
 * A generated stereo room impulse: a few early reflections, then decorrelated noise that falls
 * 60 dB in 1.8 s and darkens as it decays (high frequencies die first, as in a real hall).
 */
export function roomImpulse(ctx: Ctx): AudioBuffer {
  const cached = rooms.get(ctx);
  if (cached !== undefined) return cached;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2.1);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const r = mulberry32(ch === 0 ? 0xca11ab1e : 0xb0a710ad);
    let low = 0;
    for (let i = 0; i < len; i++) {
      const s = i / sr;
      const cutoff = 1400 + 8000 * Math.exp(-s / 0.45);
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
      low += a * (r() * 2 - 1 - low);
      const fadeIn = s < 0.015 ? s / 0.015 : 1;
      d[i] = low * Math.exp((-T60 * s) / 1.8) * fadeIn;
    }
    for (let k = 0; k < 8; k++) {
      const at = Math.floor(sr * (0.006 + 0.0105 * k + r() * 0.004));
      if (at < len) d[at] = (d[at] ?? 0) + (r() < 0.5 ? -0.6 : 0.6) * Math.exp(-0.32 * k);
    }
  }
  rooms.set(ctx, buf);
  return buf;
}

// ---------------------------------------------------------------------------------------------
// Mixer

export interface Mixer {
  /** Effects, dry and reverb send; their gain is the effects volume. */
  readonly sfx: GainNode;
  readonly sfxWet: GainNode;
  /** Long effects feed the effects buses through these; they duck while the game is paused. */
  readonly long: GainNode;
  readonly longWet: GainNode;
  /** Music, dry and reverb send; their gain is the music volume. */
  readonly music: GainNode;
  readonly musicWet: GainNode;
  /** Mute and master level, after the limiter. */
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
}

/** Limiter threshold: single sounds stay under it, dense moments are held back. */
export const LIMITER_THRESHOLD_DB = -10;

const clipCurves = new WeakMap<Ctx, Float32Array<ArrayBuffer>>();

/**
 * A last-resort soft clipper: exactly linear up to 0.8, then rounding off to 0.99, so even a
 * transient that slips past the limiter's attack never clips the output.
 */
function softClipCurve(ctx: Ctx): Float32Array<ArrayBuffer> {
  let curve = clipCurves.get(ctx);
  if (curve === undefined) {
    const n = 4097;
    curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (2 * i) / (n - 1) - 1;
      const a = Math.abs(x);
      const y = a <= 0.8 ? a : 0.8 + 0.19 * Math.tanh((a - 0.8) / 0.19);
      curve[i] = Math.sign(x) * y;
    }
    clipCurves.set(ctx, curve);
  }
  return curve;
}

export interface MixerOptions {
  /** False makes the limiter and clipper transparent (level measurements in the render tool). */
  readonly limit?: boolean;
}

/**
 * The master chain: effects and music, a shared room reverb, a limiter so dense moments (a burst
 * of pops under fireworks and music) stay clean, a soft clipper as the last safety, then the
 * master gain.
 */
export function createMixer(
  ctx: Ctx,
  dest: AudioNode = ctx.destination,
  options: MixerOptions = {},
): Mixer {
  const limit = options.limit ?? true;
  const master = gainNode(ctx, dest, 1);
  const clip = ctx.createWaveShaper();
  if (limit) clip.curve = softClipCurve(ctx);
  clip.connect(master);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = limit ? LIMITER_THRESHOLD_DB : 0;
  limiter.knee.value = 0;
  limiter.ratio.value = limit ? 20 : 1;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;
  limiter.connect(clip);
  const mix = gainNode(ctx, limiter, 1);
  const reverb = ctx.createConvolver();
  reverb.buffer = roomImpulse(ctx);
  reverb.connect(gainNode(ctx, mix, 0.55));
  const sfx = gainNode(ctx, mix, 1);
  const sfxWet = gainNode(ctx, reverb, 1);
  const music = gainNode(ctx, mix, 1);
  const musicWet = gainNode(ctx, reverb, 1);
  return {
    sfx,
    sfxWet,
    long: gainNode(ctx, sfx, 1),
    longWet: gainNode(ctx, sfxWet, 1),
    music,
    musicWet,
    master,
    limiter,
  };
}
