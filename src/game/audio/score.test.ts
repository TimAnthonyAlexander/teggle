import { describe, expect, it } from 'vitest';
import {
  arrangement,
  BEAT_SECONDS,
  BEATS_PER_BAR,
  bassFifth,
  bassRoot,
  beatToSeconds,
  CHORDS,
  CODA_BEAT,
  MUSIC_END_BEAT,
  MUSIC_SECONDS,
  musicPosition,
  noteToMidi,
  parseChords,
  parseLine,
  resumeStartedAt,
  THEME,
  THEME_CHORDS,
  voiceChord,
} from './score';

const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

describe('notation', () => {
  it('names notes in scientific pitch', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#3')).toBe(54);
    expect(noteToMidi('Bb2')).toBe(46);
    expect(() => noteToMidi('H2')).toThrow();
  });

  it('parses lengths, rests and bar lines', () => {
    const p = parseLine('C4 D4:0.5 r:0.5 E4:2 | G4:4 |', 8);
    expect(p.notes.map((n) => [n.beat, n.beats, n.midi])).toEqual([
      [8, 1, 60],
      [9, 0.5, 62],
      [10, 2, 64],
      [12, 4, 67],
    ]);
    expect(p.bars).toEqual([4, 4]);
    expect(p.endBeat).toBe(16);
  });
});

describe('the theme', () => {
  const theme = parseLine(THEME);

  it('has eight bars of four beats', () => {
    expect(theme.bars).toEqual(Array<number>(8).fill(BEATS_PER_BAR));
  });

  it('is the public-domain melody: E E F G G F E D C C D E, twice', () => {
    const names = theme.notes.map((n) => n.midi - 72);
    expect(names.slice(0, 12)).toEqual([4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4]);
    expect(names.slice(15, 27)).toEqual([4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4]);
    // The first phrase ends on the dominant's D, the second resolves to C.
    expect(names[14]).toBe(2);
    expect(names[names.length - 1]).toBe(0);
  });

  it('stays in C major', () => {
    for (const n of theme.notes) expect(C_MAJOR.has(n.midi % 12)).toBe(true);
  });

  it('has a chord for every half bar', () => {
    const chords = parseChords(THEME_CHORDS, 0);
    expect(chords).toHaveLength(16);
    expect(chords[chords.length - 1]?.name).toBe('C');
    for (const c of chords) expect(CHORDS[c.name]).toBeDefined();
  });

  it('puts a chord tone under every melody note on beats 1 and 3', () => {
    const chords = parseChords(THEME_CHORDS, 0);
    let checked = 0;
    for (const n of theme.notes) {
      if (n.beat % 2 !== 0) continue;
      const chord = chords.find((c) => c.beat === n.beat);
      expect(chord).toBeDefined();
      expect(CHORDS[chord?.name ?? '']).toContain(n.midi % 12);
      checked++;
    }
    expect(checked).toBe(16);
  });
});

describe('voicing', () => {
  it('builds close-position chords from a floor', () => {
    expect(voiceChord('C', 64)).toEqual([64, 67, 72]);
    expect(voiceChord('G', 55)).toEqual([55, 59, 62]);
    expect(voiceChord('C', 60, 4)).toEqual([60, 64, 67, 72]);
  });

  it('keeps the bass in the C2 octave', () => {
    for (const name of Object.keys(CHORDS)) {
      expect(bassRoot(name)).toBeGreaterThanOrEqual(36);
      expect(bassRoot(name)).toBeLessThan(48);
      expect(bassFifth(name)).toBeLessThan(bassRoot(name));
    }
    expect(bassRoot('G')).toBe(43);
    expect(bassFifth('C')).toBe(31);
  });
});

describe('arrangement', () => {
  const ev = arrangement();

  it('is sorted and ends on time', () => {
    for (let i = 1; i < ev.length; i++) {
      expect(ev[i]?.beat).toBeGreaterThanOrEqual(ev[i - 1]?.beat ?? 0);
    }
    for (const e of ev) {
      expect(e.beat).toBeGreaterThanOrEqual(0);
      expect(e.beat + e.beats).toBeLessThanOrEqual(MUSIC_END_BEAT + 2);
      expect(e.vel).toBeGreaterThan(0);
      expect(e.vel).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every pitched note in C major', () => {
    for (const e of ev) if (e.midi > 0) expect(C_MAJOR.has(e.midi % 12)).toBe(true);
  });

  it('plays the whole theme on the lead after a one-bar intro', () => {
    const lead = ev.filter((e) => e.part === 'lead' && e.beat < CODA_BEAT);
    expect(lead).toHaveLength(parseLine(THEME).notes.length);
    expect(lead[0]?.beat).toBe(BEATS_PER_BAR);
  });

  it('ends with the whole band on beat 36', () => {
    const last = ev.filter((e) => e.beat === CODA_BEAT).map((e) => e.part);
    for (const part of ['lead', 'stab', 'strings', 'bass', 'timpani', 'crash'] as const) {
      expect(last).toContain(part);
    }
  });
});

describe('timing', () => {
  it('runs at 150 beats per minute', () => {
    expect(BEAT_SECONDS).toBeCloseTo(0.4, 12);
    expect(beatToSeconds(BEATS_PER_BAR)).toBeCloseTo(1.6, 12);
    expect(MUSIC_SECONDS).toBeCloseTo(38 * 0.4 + 1.6, 9);
  });

  it('pauses and resumes at the same place', () => {
    const startedAt = 10;
    const pos = musicPosition(startedAt, 13.25);
    expect(pos).toBeCloseTo(3.25, 12);
    const again = resumeStartedAt(pos, 40);
    expect(musicPosition(again, 41)).toBeCloseTo(4.25, 12);
    expect(musicPosition(startedAt, 5)).toBe(0);
  });
});
