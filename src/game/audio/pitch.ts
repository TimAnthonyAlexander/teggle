// Pitch for the sounds that climb: each further peg lit in a shot rings one step higher (spec 11),
// and the pops after the shot climb the same way. Both walk up the C major scale, the key every
// jingle and the Fever music are in, so a long run of hits stays in tune with the music around it.

/** Equal temperament, A4 (MIDI 69) = 440 Hz. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Semitones of the major scale above its root. */
export const MAJOR_SCALE: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

/** The MIDI note `step` degrees above `root` on the major scale (step 7 is the octave). */
export function majorStep(root: number, step: number): number {
  const s = Math.max(0, Math.floor(step));
  return root + 12 * Math.floor(s / 7) + (MAJOR_SCALE[s % 7] ?? 0);
}

/** The first peg hit of a shot: C5, the original's peg hit pitch (visual guide 14). */
export const PEG_HIT_ROOT = 72;
/** Hits climb this many scale steps, two octaves to C7, then stay on the top note. */
export const PEG_HIT_STEPS = 14;
/** The first pop of a shot: G4, near the original's pop at about 385 Hz (visual guide 14). */
export const PEG_POP_ROOT = 67;
/** Pops climb two octaves too, to G6. */
export const PEG_POP_STEPS = 14;

function climb(root: number, steps: number, index: number): number {
  const i = Number.isFinite(index) ? index : 0;
  return majorStep(root, Math.min(Math.max(0, i), steps));
}

/** MIDI note of the `index`-th peg lit in a shot (0-based). */
export function pegHitMidi(index: number): number {
  return climb(PEG_HIT_ROOT, PEG_HIT_STEPS, index);
}

/** MIDI note of the `index`-th pop after a shot (0-based). */
export function pegPopMidi(index: number): number {
  return climb(PEG_POP_ROOT, PEG_POP_STEPS, index);
}

/**
 * Level trim for a high note, so the top of a long run does not stand out: equal loudness
 * curves rise toward 2 to 4 kHz, so a pure gain per octave is enough here. 1 at `ref` Hz.
 */
export function loudnessTrim(hz: number, ref: number): number {
  if (!(hz > 0) || !(ref > 0)) return 1;
  return Math.min(1, Math.pow(ref / hz, 0.35));
}
