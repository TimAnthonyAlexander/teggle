// DEV ONLY: a handle on the play screen for automated checks (Playwright drives real clicks; this
// lets it read the attempt's totals, aim precisely and read frame timings). Installed only in
// development builds, as window.__teggle.

import type { World } from '../../sim/world';

/**
 * What searchAim looks for in a shot: a style shot by id, a power action ('multiball', or
 * 'luckySpin:<outcome or power>'), a Spooky return within 40 px of board x `returnNear`, or a
 * quiet shot that lights no orange or green peg.
 */
export type AimGoal =
  | { readonly style: string }
  | { readonly action: string }
  | { readonly returnNear: number }
  | { readonly quiet: true };

export interface PlayDebug {
  /** Plain data about the attempt and the show. */
  snapshot(): Record<string, unknown>;
  /** Points the cannon at `angle` radians from straight down, at once. */
  setAim(angle: number): void;
  /**
   * An angle found by trying every 0.01 rad on a copy of the attempt: the one that lights the
   * most orange pegs ('best'), the best of those that light a green peg ('green', NaN if none
   * does), or the first that hits nothing and flips the coin ('coin', NaN if there is none).
   */
  pickAim(goal?: 'best' | 'coin' | 'green'): number;
  /**
   * A shot that reaches `goal`, found on copies of the attempt by trying every 0.01 rad after
   * waits of 0 to `maxWait` ticks (steps of 15), or null. With `fire`, the shot found is also
   * scheduled in the same call, so it leaves at exactly the tick the search tried.
   */
  searchAim(
    goal: AimGoal,
    maxWait?: number,
    fire?: boolean,
  ): { angle: number; wait: number } | null;
  /** Fires at `angle` after `wait` more simulation ticks, exactly; false if no shot may leave. */
  fire(angle: number, wait?: number): boolean;
  /** The flipper button follows autoFlipper instead of the input (searchAim does the same). */
  setAutoFlip(on: boolean): void;
  /** Holds the simulation and the show where they are (the frame keeps rendering), or lets go. */
  setFrozen(on: boolean): void;
  /** Render and frame-interval statistics over the last few seconds, ms; `reset` starts over. */
  perf(reset?: boolean): Record<string, number>;
}

/**
 * DEV: a simple flipper player for automated checks: the button is down while a ball is low in
 * either bottom corner, over a flipper.
 */
export function autoFlipper(world: World): boolean {
  const w = world.level.width;
  const h = world.level.height;
  for (const b of world.balls) {
    if (b.hiddenTicks > 0 || b.y < h - 125 || b.y > h - 20) continue;
    if (b.x < 135 || b.x > w - 135) return true;
  }
  return false;
}

export function installDebug(handle: PlayDebug): () => void {
  if (!import.meta.env.DEV) return () => undefined;
  Object.assign(window, { __teggle: handle });
  return () => {
    Reflect.deleteProperty(window, '__teggle');
  };
}

/** Ring buffer of frame timings. */
export class FrameStats {
  private readonly render = new Float64Array(600);
  private readonly interval = new Float64Array(600);
  private n = 0;
  private i = 0;

  reset(): void {
    this.n = 0;
    this.i = 0;
  }

  add(renderMs: number, intervalMs: number): void {
    this.render[this.i] = renderMs;
    this.interval[this.i] = intervalMs;
    this.i = (this.i + 1) % this.render.length;
    if (this.n < this.render.length) this.n++;
  }

  summary(): Record<string, number> {
    const n = this.n;
    if (n === 0) return { frames: 0 };
    let rSum = 0;
    let rMax = 0;
    let iSum = 0;
    let iMax = 0;
    let slow = 0;
    for (let k = 0; k < n; k++) {
      const r = this.render[k] ?? 0;
      const v = this.interval[k] ?? 0;
      rSum += r;
      rMax = Math.max(rMax, r);
      iSum += v;
      iMax = Math.max(iMax, v);
      if (v > 20) slow++;
    }
    return {
      frames: n,
      renderAvg: rSum / n,
      renderMax: rMax,
      intervalAvg: iSum / n,
      intervalMax: iMax,
      fps: iSum > 0 ? (1000 * n) / iSum : 0,
      framesOver20ms: slow,
    };
  }
}
