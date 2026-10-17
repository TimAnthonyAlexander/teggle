// Offline play for production builds: registers the service worker that tools/build-sw.ts
// writes into dist/ (the whole game in one cache per build). The Vite dev server never runs it.
//
// A newer build installs in the background and waits. It takes over, and the page reloads into
// it, at the first moment a reload loses nothing (spec 14.2, mobile pass): no route is loading
// and the screen on show holds nothing a reload would drop. Every menu is such a moment, and so
// is a level before its first shot: a fresh deep link, a reload, or the next level after an end
// dialog's button. A level that has taken a shot keeps the running build through its pause and
// end dialogs, and so does a challenge run past its first level, which lives in memory only. So
// the scripts of two builds never meet in one page, and nothing in play is cut off.

/** What the page is doing, as far as switching builds goes. */
export interface PageState {
  /** A route is loading: the screen on show is about to be replaced. */
  readonly navigating: boolean;
  /** The screen on show would lose something to a reload (Screen.busy). */
  readonly busy: boolean;
}

/** A reload now loses nothing. */
export function maySwitch(s: PageState): boolean {
  return !s.navigating && !s.busy;
}

/**
 * A level would lose something to a reload: a shot has left the cannon on its screen (the
 * attempt counts, the score and the end dialog are the player's), or it is a challenge level
 * after the run's first (the run lives in memory, so a reload would end it).
 */
export function levelBusy(shotTaken: boolean, laterRunLevel: boolean): boolean {
  return shotTaken || laterRunLevel;
}

/** The part of a ServiceWorker the switch talks to. */
export interface WaitingWorker {
  postMessage(message: unknown): void;
}

/**
 * Holds a newer build that waits, asks it to take over once the page allows, and reloads the
 * page into it once it does. Another tab can let the new build take over too; the page then
 * also reloads only once that loses nothing. `check` runs when the build is ready, when it has
 * taken over, and after every route the app shows; nothing else turns a busy page idle, since a
 * level stays busy from its first shot until it is left.
 */
export class BuildSwitch {
  private waiting: WaitingWorker | null = null;
  private asked = false;
  private changed = false;
  private reloading = false;

  constructor(
    private readonly state: () => PageState,
    private readonly reload: () => void,
  ) {}

  /** A newer build has installed and waits to take over. */
  offer(worker: WaitingWorker): void {
    this.waiting = worker;
    this.check();
  }

  /** A newer build controls the page now (this page or another tab let it take over). */
  controllerChanged(): void {
    this.changed = true;
    this.check();
  }

  /** Moves the switch on as far as the page allows now. */
  check(): void {
    if (this.reloading || !maySwitch(this.state())) return;
    if (this.changed) {
      this.reloading = true;
      this.reload();
    } else if (this.waiting !== null && !this.asked) {
      this.asked = true;
      this.waiting.postMessage('activate');
    }
  }
}

let gate: BuildSwitch | null = null;

/** The app has shown a route: a waiting build may take over now. */
export function routeShown(): void {
  gate?.check();
}

export function registerOffline(state: () => PageState): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  const offline = new BuildSwitch(state, () => {
    window.location.reload();
  });
  gate = offline;
  sw.addEventListener('controllerchange', () => {
    offline.controllerChanged();
  });
  window.addEventListener('load', () => {
    sw.register(`${import.meta.env.BASE_URL}sw.js`).then(
      (reg) => {
        // A page that a worker already controls is an update; the first install is not.
        const watch = (next: ServiceWorker | null): void => {
          next?.addEventListener('statechange', () => {
            if (next.state === 'installed' && sw.controller !== null) offline.offer(next);
          });
        };
        if (reg.waiting !== null && sw.controller !== null) offline.offer(reg.waiting);
        watch(reg.installing);
        reg.addEventListener('updatefound', () => {
          watch(reg.installing);
        });
        // Browsers look for a new worker when a page loads, but a phone resumes a suspended tab
        // or home screen app without loading it, sometimes for days; so look on every return.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
        });
      },
      () => undefined,
    );
  });
}
