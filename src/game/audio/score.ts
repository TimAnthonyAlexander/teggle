// The Fever music as data: the "Ode to Joy" theme (Beethoven, Symphony No. 9, finale; public
// domain), written out here note by note, and Teggle's arrangement of it as a short, bright
// march in C major (the key the peg hits climb in). Pure: music.ts plays these events.
//
// Form, at 150 beats per minute (0.4 s a beat, 1.6 s a bar):
//   bar 0     intro: a C major chord on the hit, timpani and a snare roll lead in
//   bars 1-4  the theme's first phrase (ends on the dominant)
//   bars 5-8  the answering phrase (ends on the tonic), glockenspiel doubling
//   beat 36   the closing chord, held two beats, then the room rings out

export const MUSIC_BPM = 150;
export const BEAT_SECONDS = 60 / MUSIC_BPM;
export const BEATS_PER_BAR = 4;
/** The closing chord starts here. */
export const CODA_BEAT = 36;
/** The last note ends here. */
export const MUSIC_END_BEAT = 38;
/** Release and reverb after the last note. */
export const MUSIC_TAIL_SECONDS = 1.6;
/** Length of the rendered piece. */
export const MUSIC_SECONDS = MUSIC_END_BEAT * BEAT_SECONDS + MUSIC_TAIL_SECONDS;

export function beatToSeconds(beat: number): number {
  return beat * BEAT_SECONDS;
}

// ---------------------------------------------------------------------------------------------
// Notation

export interface ScoreNote {
  readonly beat: number;
  readonly beats: number;
  readonly midi: number;
}

const LETTERS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE = /^([A-G])(#|b)?(-?\d)$/;

/** "C4" is MIDI 60; sharps (#) and flats (b) allowed. */
export function noteToMidi(name: string): number {
  const m = NOTE.exec(name);
  if (m === null) throw new Error(`Not a note: ${name}`);
  const [, letter = 'C', accidental, octave = '4'] = m;
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return 12 * (Number(octave) + 1) + (LETTERS[letter] ?? 0) + shift;
}

export interface ParsedLine {
  readonly notes: ScoreNote[];
  /** Length of each bar in beats, for checking. */
  readonly bars: number[];
  readonly endBeat: number;
}

/** Parses "E5 E5:1.5 r:2 | ..." (length in beats after the colon, 1 by default; r is a rest). */
export function parseLine(text: string, startBeat = 0): ParsedLine {
  const notes: ScoreNote[] = [];
  const bars: number[] = [];
  let beat = startBeat;
  let barStart = startBeat;
  for (const token of text.split(/\s+/)) {
    if (token === '') continue;
    if (token === '|') {
      bars.push(beat - barStart);
      barStart = beat;
      continue;
    }
    const [name = '', len] = token.split(':');
    const beats = len === undefined ? 1 : Number(len);
    if (!(beats > 0)) throw new Error(`Bad length: ${token}`);
    if (name !== 'r') notes.push({ beat, beats, midi: noteToMidi(name) });
    beat += beats;
  }
  if (beat > barStart) bars.push(beat - barStart);
  return { notes, bars, endBeat: beat };
}

// ---------------------------------------------------------------------------------------------
// The theme and its harmony

/** The theme's two phrases in C major, one octave above middle C. */
export const THEME =
  'E5 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | E5:1.5 D5:0.5 D5:2 | ' +
  'E5 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | D5:1.5 C5:0.5 C5:2 |';

/**
 * One chord per half bar under the theme, chosen so every note on beats 1 and 3 is a chord tone:
 * I V7 | V7 I | I V | I V, then I IV | V7 I | vi V | V I to close.
 */
export const THEME_CHORDS = 'C G7 | G7 C | C G | C G | C F | G7 C | Am G | G C |';

/** Pitch classes of each chord, root first. */
export const CHORDS: Readonly<Record<string, readonly number[]>> = {
  C: [0, 4, 7],
  F: [5, 9, 0],
  G: [7, 11, 2],
  G7: [7, 11, 2, 5],
  Am: [9, 0, 4],
};

export interface ChordSpan {
  readonly beat: number;
  readonly name: string;
}

export function parseChords(text: string, startBeat: number, beatsEach = 2): ChordSpan[] {
  const out: ChordSpan[] = [];
  let beat = startBeat;
  for (const token of text.split(/\s+/)) {
    if (token === '' || token === '|') continue;
    if (CHORDS[token] === undefined) throw new Error(`Unknown chord: ${token}`);
    out.push({ beat, name: token });
    beat += beatsEach;
  }
  return out;
}

function tones(name: string): readonly number[] {
  return CHORDS[name] ?? [0, 4, 7];
}

/** The chord in close position: its tones upward from the first one at or above `low`. */
export function voiceChord(name: string, low: number, count = 3): number[] {
  const pcs = new Set(tones(name));
  const out: number[] = [];
  for (let m = low; out.length < count && m < low + 36; m++) {
    if (pcs.has(((m % 12) + 12) % 12)) out.push(m);
  }
  return out;
}

/** The chord's root in the bass octave, C2 (36) to B2 (47). */
export function bassRoot(name: string): number {
  return 36 + (tones(name)[0] ?? 0);
}

/** The chord's fifth below its root in the bass octave (for the march bass's second beat). */
export function bassFifth(name: string): number {
  const fifth = 36 + (tones(name)[2] ?? 7);
  return fifth > bassRoot(name) ? fifth - 12 : fifth;
}

// ---------------------------------------------------------------------------------------------
// Arrangement

export type Part =
  'lead' | 'glock' | 'strings' | 'stab' | 'bass' | 'kick' | 'snare' | 'hat' | 'crash' | 'timpani';

export interface MusicEvent {
  readonly part: Part;
  readonly beat: number;
  readonly beats: number;
  /** MIDI note; 0 for unpitched drums. */
  readonly midi: number;
  /** 0 to 1. */
  readonly vel: number;
}

const THEME_START = BEATS_PER_BAR;

/** Every note of the Fever music in beat order. */
export function arrangement(): MusicEvent[] {
  const ev: MusicEvent[] = [];
  const add = (part: Part, beat: number, beats: number, midi: number, vel: number): void => {
    ev.push({ part, beat, beats, midi, vel });
  };

  // Intro: the chord lands with the gong; timpani and a snare roll lead into the theme.
  for (const m of [48, 55, 60, 64, 67, 72]) add('stab', 0, 1.5, m, m >= 60 ? 0.6 : 0.45);
  for (const m of voiceChord('C', 64, 4)) add('strings', 0, 2, m, 0.5);
  add('bass', 0, 1.5, 36, 0.8);
  add('timpani', 0, 1, 48, 0.7);
  add('timpani', 2, 1, 43, 0.55);
  add('timpani', 3, 0.5, 43, 0.7);
  add('timpani', 3.5, 0.5, 43, 0.85);
  for (let i = 0; i < 8; i++) add('snare', 2 + i * 0.25, 0.25, 0, 0.18 + i * 0.07);

  // Theme: brass melody; the glockenspiel doubles it an octave up in the answering phrase.
  const melody = parseLine(THEME, THEME_START);
  for (const n of melody.notes) {
    const second = n.beat >= THEME_START + 16;
    add('lead', n.beat, n.beats, n.midi, second ? 0.9 : 0.82);
    if (second) add('glock', n.beat, n.beats, n.midi + 12, 0.55);
  }

  // Harmony: sustained strings, off-beat brass stabs, a march bass on the strong beats.
  const chords = parseChords(THEME_CHORDS, THEME_START);
  let prev = '';
  for (const c of chords) {
    const second = c.beat >= THEME_START + 16;
    for (const m of voiceChord(c.name, 64, 3)) add('strings', c.beat, 2, m, second ? 0.5 : 0.36);
    for (const m of voiceChord(c.name, 55, 3)) add('stab', c.beat + 1, 0.45, m, 0.42);
    add('bass', c.beat, 0.9, c.name === prev ? bassFifth(c.name) : bassRoot(c.name), 0.85);
    // Walking eighth before a change of chord.
    add('bass', c.beat + 1.5, 0.45, bassRoot(c.name) + 12, 0.45);
    prev = c.name;
  }

  // Drums: kick on 1 and 3, snare on 2 and 4, eighth-note hats, crashes on the phrase starts.
  for (let bar = 1; bar <= 8; bar++) {
    const b = bar * BEATS_PER_BAR;
    add('kick', b, 0.5, 0, 0.9);
    add('kick', b + 2, 0.5, 0, 0.75);
    add('snare', b + 1, 0.5, 0, 0.55);
    add('snare', b + 3, 0.5, 0, 0.6);
    for (let i = 0; i < 8; i++) add('hat', b + i * 0.5, 0.25, 0, i % 2 === 0 ? 0.5 : 0.3);
  }
  add('crash', THEME_START, 4, 0, 0.75);
  add('crash', THEME_START + 16, 4, 0, 0.8);

  // Into the close: a timpani roll under the last melody note.
  for (let i = 0; i < 8; i++) add('timpani', CODA_BEAT - 2 + i * 0.25, 0.25, 48, 0.3 + i * 0.07);

  // Coda: the whole band on one C major chord.
  const c = CODA_BEAT;
  const hold = MUSIC_END_BEAT - CODA_BEAT;
  for (const m of [72, 76, 79]) add('lead', c, hold, m, 0.75);
  for (const m of [48, 55, 60, 64, 67]) add('stab', c, hold, m, 0.75);
  for (const m of voiceChord('C', 60, 4)) add('strings', c, hold + 0.5, m, 0.6);
  add('glock', c, hold, 96, 0.6);
  add('glock', c, hold, 84, 0.5);
  add('bass', c, hold, 36, 1);
  add('timpani', c, 1, 48, 1);
  add('kick', c, 1, 0, 1);
  add('crash', c, 4, 0, 1);

  ev.sort((a, b) => a.beat - b.beat);
  return ev;
}

// ---------------------------------------------------------------------------------------------
// Transport

/** Seconds into the piece at context time `now`, when it started (offset 0) at `startedAt`. */
export function musicPosition(startedAt: number, now: number): number {
  return Math.max(0, now - startedAt);
}

/** The start time that resumes the piece at `position` when it restarts at `now`. */
export function resumeStartedAt(position: number, now: number): number {
  return now - position;
}
