// The app's one progress record: read once from localStorage, kept in memory, and written back
// after every change. Storage may be missing, full or blocked (private windows, cleared site
// data); then the game keeps its progress for the session only and says nothing. Every read and
// write is guarded.

import { browserStore, type SettingsStore } from '../audio/settings';
import { parseProgress, SAVE_KEY, serializeProgress, type Progress } from './save';

export class ProgressStore {
  private current: Progress;
  /** The last write reached storage. */
  saved = false;

  constructor(private readonly store: SettingsStore | null) {
    let raw: string | null;
    try {
      raw = store?.getItem(SAVE_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.current = parseProgress(raw);
  }

  get progress(): Progress {
    return this.current;
  }

  /** Applies a change and writes it; the change holds in memory even when the write fails. */
  update(change: (p: Progress) => Progress): Progress {
    this.current = change(this.current);
    this.saved = this.write();
    return this.current;
  }

  private write(): boolean {
    if (this.store === null) return false;
    try {
      this.store.setItem(SAVE_KEY, serializeProgress(this.current));
      return true;
    } catch {
      return false;
    }
  }
}

let shared: ProgressStore | null = null;

/** The progress the menus and the play screen share. */
export function progressStore(): ProgressStore {
  shared ??= new ProgressStore(browserStore());
  return shared;
}
