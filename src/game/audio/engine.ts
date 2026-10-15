// The live audio engine. One AudioContext, created on the first pointer or key input and resumed
// there (browsers keep audio blocked until the player interacts). It listens to the audio bus and
// plays every event through the sound board, keeps the volume settings, ducks long sounds and
// pauses the Fever music while the game is paused, suspends audio while the tab is hidden, and
// stops everything when the route changes. Where Web Audio is missing or fails, it stays silent
// and the game runs on: every entry point is a no-op then.

import { SoundBoard } from './board';
import { audioBus, type AudioEvent } from './bus';
import { onGamePaused, setGamePaused } from './cues';
import { renderMusic } from './music';
import {
  browserStore,
  clampVolume,
  loadAudioSettings,
  saveAudioSettings,
  volumeToGain,
  type AudioSettings,
} from './settings';
import { SOUND_IDS, SOUNDS } from './sounds';
import { createMixer, type Mixer } from './synth';

export interface AudioControls {
  /** False where Web Audio is missing or failed to start; the game is then silent. */
  readonly available: boolean;
  readonly settings: AudioSettings;
  setSfxVolume(volume: number): void;
  setMusicVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** Flips mute; returns the new state. */
  toggleMute(): boolean;
  /** Hears every settings change; returns the function that unsubscribes. */
  onChange(listener: (settings: AudioSettings) => void): () => void;
  /** Plays one peg chime at the current effects volume (feedback for a volume slider). */
  previewSfx(): void;
}

type EngineState = 'idle' | 'running' | 'failed';

/** Inputs that count as a user gesture for unlocking audio. */
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown'] as const;
/** Time constant of volume changes and the pause duck, s. */
const SMOOTH = 0.03;
/** The startup renders wait this long after unlock, so the first click stays smooth. */
const PRERENDER_DELAY_MS = 600;

type ContextClass = new (options?: AudioContextOptions) => AudioContext;

function contextClass(): ContextClass | null {
  const g = globalThis as { AudioContext?: ContextClass; webkitAudioContext?: ContextClass };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function canRenderOffline(): boolean {
  return (globalThis as { OfflineAudioContext?: unknown }).OfflineAudioContext !== undefined;
}

/** Fades the last 40 ms of a rendered buffer to silence, so a long tail never ends in a click. */
function fadeOutTail(buffer: AudioBuffer): AudioBuffer {
  const n = Math.min(buffer.length, Math.round(buffer.sampleRate * 0.04));
  const from = buffer.length - n;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) d[from + i] = (d[from + i] ?? 0) * (1 - (i + 1) / n);
  }
  return buffer;
}

class AudioEngine implements AudioControls {
  private ctx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private board: SoundBoard | null = null;
  private state: EngineState = 'idle';
  private current: AudioSettings = loadAudioSettings(browserStore());
  private readonly listeners: ((s: AudioSettings) => void)[] = [];
  private paused = false;
  private started = false;
  private readonly prerendered: string[] = [];

  get available(): boolean {
    return this.state !== 'failed';
  }

  get settings(): AudioSettings {
    return this.current;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    // A browser under automation (Playwright, the screenshot and check tools) never makes a
    // sound: those runs happen on the user's machine while they work or sleep.
    if (contextClass() === null || navigator.webdriver) {
      this.state = 'failed';
      return;
    }
    for (const type of GESTURES) {
      window.addEventListener(type, this.unlock, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('hashchange', this.onRoute);
    window.addEventListener('keydown', this.onKey);
    audioBus.on(this.onEvent);
    onGamePaused(this.onPause);
    if (import.meta.env.DEV) Object.assign(window, { __teggleAudio: this.debugHandle() });
  }

  // -------------------------------------------------------------------------------------------
  // Settings

  setSfxVolume(volume: number): void {
    this.update({ ...this.current, sfxVolume: clampVolume(volume) });
  }

  setMusicVolume(volume: number): void {
    this.update({ ...this.current, musicVolume: clampVolume(volume) });
  }

  setMuted(muted: boolean): void {
    this.update({ ...this.current, muted });
  }

  toggleMute(): boolean {
    this.setMuted(!this.current.muted);
    return this.current.muted;
  }

  onChange(listener: (s: AudioSettings) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  previewSfx(): void {
    const ctx = this.ctx;
    if (ctx?.state === 'running') this.board?.play('hit.blue', ctx.currentTime, 4);
  }

  private update(next: AudioSettings): void {
    this.current = next;
    saveAudioSettings(browserStore(), next);
    this.apply(false);
    for (const l of this.listeners.slice()) l(next);
  }

  /** Sets the bus gains from the settings, smoothly unless `now` is asked for. */
  private apply(immediate: boolean): void {
    const ctx = this.ctx;
    const m = this.mixer;
    if (ctx === null || m === null) return;
    const s = this.current;
    const sfx = volumeToGain(s.sfxVolume);
    const music = volumeToGain(s.musicVolume);
    const targets: [AudioParam, number][] = [
      [m.sfx.gain, sfx],
      [m.sfxWet.gain, sfx],
      [m.music.gain, music],
      [m.musicWet.gain, music],
      [m.master.gain, s.muted ? 0 : 1],
    ];
    const now = ctx.currentTime;
    for (const [param, value] of targets) {
      param.cancelScheduledValues(now);
      if (immediate) param.setValueAtTime(value, now);
      else param.setTargetAtTime(value, now, SMOOTH);
    }
    if (this.board !== null) this.board.silent = s.muted;
  }

  // -------------------------------------------------------------------------------------------
  // Context

  private readonly unlock = (): void => {
    if (this.state === 'failed') return;
    if (this.ctx === null && !this.create()) return;
    const ctx = this.ctx;
    if (ctx !== null && ctx.state !== 'running' && document.visibilityState === 'visible') {
      ctx.resume().catch(() => undefined);
    }
  };

  private create(): boolean {
    const Ctor = contextClass();
    if (Ctor === null) {
      this.state = 'failed';
      return false;
    }
    try {
      const ctx = new Ctor({ latencyHint: 'interactive' });
      const mixer = createMixer(ctx);
      const board = new SoundBoard(ctx, mixer);
      this.ctx = ctx;
      this.mixer = mixer;
      this.board = board;
      this.state = 'running';
      this.apply(true);
      if (this.paused) this.onPause(true);
      if (canRenderOffline()) {
        setTimeout(() => {
          void this.prerender(ctx.sampleRate, board);
        }, PRERENDER_DELAY_MS);
      }
      return true;
    } catch {
      this.state = 'failed';
      this.ctx = null;
      this.mixer = null;
      this.board = null;
      for (const type of GESTURES) window.removeEventListener(type, this.unlock, true);
      return false;
    }
  }

  /**
   * Renders the Fever music and the heavy sounds (rolls, crowds, fireworks) into buffers, one
   * after another. Anything that fails or is not ready yet simply plays live.
   */
  private async prerender(rate: number, board: SoundBoard): Promise<void> {
    try {
      board.music.setBuffer(await renderMusic(rate));
      this.prerendered.push('music');
    } catch {
      // The music schedules its notes live instead.
    }
    for (const id of SOUND_IDS) {
      const def = SOUNDS[id];
      const pre = def.prerender;
      if (pre === undefined) continue;
      try {
        const off = new OfflineAudioContext(pre.channels, Math.ceil(pre.seconds * rate), rate);
        def.play(off, off.destination, 0, 0);
        board.setBuffer(id, fadeOutTail(await off.startRendering()));
        this.prerendered.push(id);
      } catch {
        // This sound keeps playing live.
      }
    }
  }

  private readonly onEvent = (e: AudioEvent): void => {
    const ctx = this.ctx;
    const board = this.board;
    if (ctx === null || board === null || ctx.state !== 'running') return;
    try {
      board.handle(e, ctx.currentTime);
    } catch {
      // A sound that fails to build must never stop the game.
    }
  };

  private readonly onPause = (paused: boolean): void => {
    this.paused = paused;
    const ctx = this.ctx;
    const m = this.mixer;
    if (ctx === null || m === null || this.board === null) return;
    const now = ctx.currentTime;
    for (const g of [m.long.gain, m.longWet.gain]) {
      g.cancelScheduledValues(now);
      g.setTargetAtTime(paused ? 0 : 1, now, SMOOTH);
    }
    if (paused) this.board.music.pause(now);
    else this.board.music.resume(now);
  };

  private readonly onVisibility = (): void => {
    const ctx = this.ctx;
    if (ctx === null || ctx.state === 'closed') return;
    const op = document.visibilityState === 'hidden' ? ctx.suspend() : ctx.resume();
    op.catch(() => undefined);
  };

  private readonly onRoute = (): void => {
    const ctx = this.ctx;
    if (ctx !== null) this.board?.stopAll(ctx.currentTime);
    setGamePaused(false);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    this.toggleMute();
  };

  /** DEV ONLY: a read-out for automated checks (window.__teggleAudio). */
  private debugHandle(): Record<string, unknown> {
    return {
      snapshot: () => ({
        engine: this.state,
        context: this.ctx?.state ?? null,
        sampleRate: this.ctx?.sampleRate ?? null,
        time: this.ctx?.currentTime ?? null,
        settings: this.current,
        paused: this.paused,
        prerendered: this.prerendered.slice(),
        music: this.ctx === null ? null : (this.board?.music.stateAt(this.ctx.currentTime) ?? null),
        stats: this.board?.stats ?? null,
      }),
      emit: (e: AudioEvent) => {
        audioBus.emit(e);
      },
    };
  }
}

let engine: AudioEngine | null = null;

/** Starts the audio layer once (the app shell calls this at boot) and returns its controls. */
export function startAudio(): AudioControls {
  engine ??= new AudioEngine();
  engine.start();
  return engine;
}

/** The audio controls for menus (the options dialog). */
export function audioControls(): AudioControls {
  return startAudio();
}
