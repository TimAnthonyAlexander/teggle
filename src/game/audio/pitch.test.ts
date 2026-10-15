import { describe, expect, it } from 'vitest';
import {
  loudnessTrim,
  majorStep,
  midiToHz,
  PEG_HIT_STEPS,
  PEG_POP_STEPS,
  pegHitMidi,
  pegPopMidi,
} from './pitch';

describe('midiToHz', () => {
  it('maps A4 to 440 Hz and octaves to doublings', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880, 9);
    expect(midiToHz(72)).toBeCloseTo(523.2511, 3);
  });
});

describe('majorStep', () => {
  it('walks the major scale and wraps at the octave', () => {
    const c4 = 60;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => majorStep(c4, s) - c4)).toEqual([
      0, 2, 4, 5, 7, 9, 11, 12, 14,
    ]);
  });

  it('treats negative and fractional steps as the floor, from 0', () => {
    expect(majorStep(60, -3)).toBe(60);
    expect(majorStep(60, 2.9)).toBe(64);
  });
});

describe('peg hit pitch', () => {
  it('starts at C5 and rises with every hit up to the cap', () => {
    expect(pegHitMidi(0)).toBe(72);
    for (let i = 1; i <= PEG_HIT_STEPS; i++) {
      expect(pegHitMidi(i)).toBeGreaterThan(pegHitMidi(i - 1));
    }
  });

  it('stays on C7 after two octaves', () => {
    expect(pegHitMidi(PEG_HIT_STEPS)).toBe(96);
    expect(pegHitMidi(PEG_HIT_STEPS + 1)).toBe(96);
    expect(pegHitMidi(500)).toBe(96);
  });

  it('keeps every note in C major', () => {
    const inKey = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (let i = 0; i < 30; i++) expect(inKey.has(pegHitMidi(i) % 12)).toBe(true);
  });

  it('survives bad input', () => {
    expect(pegHitMidi(-1)).toBe(72);
    expect(pegHitMidi(Number.NaN)).toBe(72);
  });
});

describe('peg pop pitch', () => {
  it('starts at G4 and climbs two octaves', () => {
    expect(pegPopMidi(0)).toBe(67);
    expect(midiToHz(pegPopMidi(0))).toBeCloseTo(392, 0);
    expect(pegPopMidi(PEG_POP_STEPS)).toBe(91);
    expect(pegPopMidi(99)).toBe(91);
  });
});

describe('loudnessTrim', () => {
  it('is 1 at or below the reference and falls above it', () => {
    expect(loudnessTrim(523, 523)).toBe(1);
    expect(loudnessTrim(200, 523)).toBe(1);
    const twoOctaves = loudnessTrim(2093, 523.25);
    expect(twoOctaves).toBeLessThan(1);
    expect(twoOctaves).toBeGreaterThan(0.55);
  });

  it('is 1 for nonsense input', () => {
    expect(loudnessTrim(0, 523)).toBe(1);
    expect(loudnessTrim(Number.NaN, 523)).toBe(1);
  });
});
