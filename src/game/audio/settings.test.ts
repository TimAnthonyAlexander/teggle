import { describe, expect, it } from 'vitest';
import {
  AUDIO_SETTINGS_KEY,
  clampVolume,
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  parseAudioSettings,
  saveAudioSettings,
  serializeAudioSettings,
  volumeToGain,
  type SettingsStore,
} from './settings';

class MemoryStore implements SettingsStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const throwing: SettingsStore = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('parseAudioSettings', () => {
  it('reads a full record', () => {
    expect(parseAudioSettings('{"sfxVolume":0.5,"musicVolume":0.25,"muted":true}')).toEqual({
      sfxVolume: 0.5,
      musicVolume: 0.25,
      muted: true,
    });
  });

  it('gives the defaults for nothing, garbage and non-objects', () => {
    for (const raw of [null, undefined, '', '{', 'null', '42', '"x"', '[1,2]']) {
      expect(parseAudioSettings(raw)).toEqual(DEFAULT_AUDIO_SETTINGS);
    }
  });

  it('falls back field by field', () => {
    expect(parseAudioSettings('{"musicVolume":0.1}')).toEqual({
      ...DEFAULT_AUDIO_SETTINGS,
      musicVolume: 0.1,
    });
    expect(parseAudioSettings('{"sfxVolume":"loud","muted":"yes","musicVolume":0}')).toEqual({
      ...DEFAULT_AUDIO_SETTINGS,
      musicVolume: 0,
    });
  });

  it('clamps volumes into 0..1', () => {
    const s = parseAudioSettings('{"sfxVolume":7,"musicVolume":-2,"muted":false}');
    expect(s.sfxVolume).toBe(1);
    expect(s.musicVolume).toBe(0);
  });

  it('ignores unknown fields', () => {
    expect(parseAudioSettings('{"sfxVolume":0.3,"extra":1}').sfxVolume).toBe(0.3);
  });
});

describe('serializeAudioSettings', () => {
  it('round-trips and clamps', () => {
    const s = { sfxVolume: 0.42, musicVolume: 0.9, muted: true };
    expect(parseAudioSettings(serializeAudioSettings(s))).toEqual(s);
    const wild = { sfxVolume: Number.NaN, musicVolume: 3, muted: false };
    expect(parseAudioSettings(serializeAudioSettings(wild))).toEqual({
      sfxVolume: 0,
      musicVolume: 1,
      muted: false,
    });
  });
});

describe('storage', () => {
  it('saves and loads through a store', () => {
    const store = new MemoryStore();
    const s = { sfxVolume: 0.2, musicVolume: 0.6, muted: true };
    expect(saveAudioSettings(store, s)).toBe(true);
    expect(store.data.has(AUDIO_SETTINGS_KEY)).toBe(true);
    expect(loadAudioSettings(store)).toEqual(s);
  });

  it('works without storage', () => {
    expect(loadAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(saveAudioSettings(null, DEFAULT_AUDIO_SETTINGS)).toBe(false);
  });

  it('survives a store that throws', () => {
    expect(loadAudioSettings(throwing)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(saveAudioSettings(throwing, DEFAULT_AUDIO_SETTINGS)).toBe(false);
  });
});

describe('volume helpers', () => {
  it('clamps and curves', () => {
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampVolume(0.5)).toBe(0.5);
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25, 9);
  });
});
