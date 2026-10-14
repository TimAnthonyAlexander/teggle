// DEV ONLY: a handle on the play screen for automated checks (Playwright drives real clicks; this
// lets it read the attempt's totals, aim precisely and read frame timings). Installed only in
// development builds, as window.__teggle.

export interface PlayDebug {
  /** Plain data about the attempt and the show. */
  snapshot(): Record<string, unknown>;
  /** Points the cannon at `angle` radians from straight down, at once. */
  setAim(angle: number): void;
  /**
   * An angle found by trying every 0.01 rad on a copy of the attempt: the one that lights the
   * most orange pegs ('best'), or the first that hits nothing and flips the coin ('coin', NaN if
   * there is none).
   */
  pickAim(goal?: 'best' | 'coin'): number;
  /** Render and frame-interval statistics over the last few seconds, ms. */
  perf(): Record<string, number>;
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
