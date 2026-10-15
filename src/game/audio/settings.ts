// Audio settings: effects volume, music volume and mute, kept in localStorage. Storage is
// untrusted and may be missing (private windows, blocked site data), so every read and write is
// guarded and a bad or absent record falls back to the defaults field by field.

import { z } from 'zod';

export interface AudioSettings {
  /** Sound effects volume, 0 to 1. */
  readonly sfxVolume: number;
  /** Music volume, 0 to 1. */
  readonly musicVolume: number;
  readonly muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  sfxVolume: 0.8,
  musicVolume: 0.7,
  muted: false,
};

export const AUDIO_SETTINGS_KEY = 'teggle.audio.v1';

export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

const volume = (fallback: number) => z.number().transform(clampVolume).catch(fallback);

const schema = z.object({
  sfxVolume: volume(DEFAULT_AUDIO_SETTINGS.sfxVolume),
  musicVolume: volume(DEFAULT_AUDIO_SETTINGS.musicVolume),
  muted: z.boolean().catch(DEFAULT_AUDIO_SETTINGS.muted),
});

/** Reads a stored record; anything unreadable gives the defaults for the fields it spoils. */
export function parseAudioSettings(raw: string | null | undefined): AudioSettings {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_AUDIO_SETTINGS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return DEFAULT_AUDIO_SETTINGS;
  }
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : DEFAULT_AUDIO_SETTINGS;
}

export function serializeAudioSettings(s: AudioSettings): string {
  return JSON.stringify({
    sfxVolume: clampVolume(s.sfxVolume),
    musicVolume: clampVolume(s.musicVolume),
    muted: s.muted,
  });
}

/** The part of Storage the settings use. */
export interface SettingsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's localStorage, or null where reading it throws. */
export function browserStore(): SettingsStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadAudioSettings(store: SettingsStore | null): AudioSettings {
  if (store === null) return DEFAULT_AUDIO_SETTINGS;
  try {
    return parseAudioSettings(store.getItem(AUDIO_SETTINGS_KEY));
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

/** Writes the settings; false where storage refused (full, blocked, missing). */
export function saveAudioSettings(store: SettingsStore | null, s: AudioSettings): boolean {
  if (store === null) return false;
  try {
    store.setItem(AUDIO_SETTINGS_KEY, serializeAudioSettings(s));
    return true;
  } catch {
    return false;
  }
}

/** Gain for a volume slider: a gentle curve, so the lower half of the slider stays usable. */
export function volumeToGain(v: number): number {
  const c = clampVolume(v);
  return c * c;
}
