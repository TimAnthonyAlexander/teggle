// Master portraits (spec 7; visual guide 7.4, 10.5 and 13): ten masters, four expressions each,
// shipped as found images under public/art/masters/<powerId>/<expression>.webp (built by
// tools/master-art.ts; sources in docs/art/masters-sources.md and docs/assets.md). Images load
// lazily and are cached by power and expression. Nothing here throws on a missing or broken file:
// a failed load is remembered as missing, and callers draw nothing in its place (or the neutral
// portrait, via `best`).

import type { PowerId } from '../audio/bus';

/** Power ids in stage order; index i is the master of stage i + 1 and of THEMES[i]. */
export const MASTER_POWERS: readonly PowerId[] = [
  'guide',
  'multiball',
  'pyramid',
  'spaceBlast',
  'flippers',
  'spookyBall',
  'flowerPower',
  'luckySpin',
  'fireball',
  'zenBall',
];

/**
 * neutral: resting; happy: a good shot or a free ball; power: the power just triggered;
 * sad: a miss or a lost level.
 */
export const EXPRESSIONS = ['neutral', 'happy', 'power', 'sad'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** Stage index (0-based) of the master that owns `power`. */
export function masterIndex(power: PowerId): number {
  return MASTER_POWERS.indexOf(power);
}

/** URL of one portrait, under the app's base URL (Vite's `import.meta.env.BASE_URL`). */
export function portraitPath(power: PowerId, expression: Expression, base = '/'): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}art/masters/${power}/${expression}.webp`;
}

/** Anything Canvas 2D can draw that also knows its pixel size. */
export type PortraitImage = CanvasImageSource & { readonly width: number; readonly height: number };

export type ImageLoader = (url: string) => Promise<PortraitImage>;

export type PortraitStatus = 'idle' | 'loading' | 'ready' | 'missing';

/** Browser loader: an <img> decoded off the main thread before it is first drawn. */
export const loadImageElement: ImageLoader = async (url) => {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
};

interface Entry {
  status: PortraitStatus;
  image: PortraitImage | null;
  promise: Promise<void> | null;
}

export class MasterPortraits {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly base = '/',
    private readonly loader: ImageLoader = loadImageElement,
  ) {}

  private entry(power: PowerId, expression: Expression): Entry {
    const key = `${power}/${expression}`;
    let e = this.entries.get(key);
    if (e === undefined) {
      e = { status: 'idle', image: null, promise: null };
      this.entries.set(key, e);
    }
    return e;
  }

  /** Starts loading one portrait if it has not been requested yet; settles, never rejects. */
  request(power: PowerId, expression: Expression): Promise<void> {
    const e = this.entry(power, expression);
    if (e.promise !== null) return e.promise;
    e.status = 'loading';
    e.promise = this.loader(portraitPath(power, expression, this.base)).then(
      (image) => {
        e.status = 'ready';
        e.image = image;
      },
      () => {
        e.status = 'missing';
        e.image = null;
      },
    );
    return e.promise;
  }

  /** Loads all four expressions of one master; resolves when every load has settled. */
  async preload(power: PowerId): Promise<void> {
    await Promise.all(EXPRESSIONS.map((x) => this.request(power, x)));
  }

  /** Loads every portrait of every master. */
  async preloadAll(): Promise<void> {
    await Promise.all(MASTER_POWERS.map((p) => this.preload(p)));
  }

  status(power: PowerId, expression: Expression): PortraitStatus {
    return this.entries.get(`${power}/${expression}`)?.status ?? 'idle';
  }

  /** The portrait if it has loaded, else null. Requests it on first use. */
  get(power: PowerId, expression: Expression): PortraitImage | null {
    const e = this.entry(power, expression);
    if (e.promise === null) void this.request(power, expression);
    return e.image;
  }

  /** The requested expression if loaded, else the neutral portrait if loaded, else null. */
  best(power: PowerId, expression: Expression): PortraitImage | null {
    return this.get(power, expression) ?? this.get(power, 'neutral');
  }
}

/** The app's one portrait cache. */
export const masterPortraits = new MasterPortraits(import.meta.env.BASE_URL);
