// The phone resolution cap (spec 14.2, mobile pass). A phone draws at its full device pixel
// ratio (up to 3) as long as it keeps up; if its frames stay slow for 1.5 s (after 3 s to
// settle), the backing store steps down (3 -> 2.25 -> 1.7, never below 1.5) and stays there for
// the session. Frame times
// measured on a phone-sized screen showed full resolution keeping 60 fps where the canvas is
// drawn on the GPU, so this only acts where it is not (a weak or blocklisted GPU).

export interface GovernorOptions {
  /** Real time averaged before a decision, ms. */
  readonly windowMs: number;
  /** An average frame interval above this is too slow, ms. */
  readonly slowMs: number;
  /** Frames are not judged this long after a start, a resize or a step down, ms. */
  readonly settleMs: number;
  /** Each step multiplies the cap by this. */
  readonly step: number;
  /** The cap never goes below this. */
  readonly floor: number;
}

export const GOVERNOR: GovernorOptions = {
  windowMs: 1500,
  slowMs: 28,
  settleMs: 3000,
  step: 0.75,
  floor: 1.5,
};

export class ResolutionGovernor {
  private sum = 0;
  private count = 0;
  private settle: number;

  constructor(
    /** The current cap on the device pixel ratio. */
    public cap: number,
    private readonly opts: GovernorOptions = GOVERNOR,
  ) {
    this.settle = opts.settleMs;
  }

  /** Starts the settling time over (a resize, a page shown again, a new screen). */
  restart(): void {
    this.settle = this.opts.settleMs;
    this.sum = 0;
    this.count = 0;
  }

  /** Feeds one frame's interval; true when the cap has just stepped down. */
  frame(frameMs: number): boolean {
    if (this.settle > 0) {
      this.settle -= frameMs;
      return false;
    }
    this.sum += frameMs;
    this.count++;
    if (this.sum < this.opts.windowMs) return false;
    const slow = this.sum / this.count > this.opts.slowMs;
    this.sum = 0;
    this.count = 0;
    if (!slow || this.cap <= this.opts.floor) return false;
    this.cap = Math.max(this.opts.floor, this.cap * this.opts.step);
    this.settle = this.opts.settleMs;
    return true;
  }
}
