// Style shot detection for the shapes of a ball's path (spec 5; exact definitions in spec 14.2):
// Long Shot, Super Long Shot, Double Long Shot, Bucket Bounce, Lucky Bounce, Long Slide, and the
// "bucket since the last peg" flag Bucket Kick needs. It reads the simulation's events and the
// ball positions; the attempt handles the style shots that depend on rules state (Bucket Kick,
// Bucket Streak, Orange Rush, Clean Finish, Double Power, Double Catch). It also keeps the path
// facts the master-specific style shots read (BallPathView); the powers award those. Nothing
// here allocates per tick.

import type { SimEvent } from '../sim/events';
import type { BallView } from '../sim/world';
import {
  LONG_SHOT_FRACTION,
  LONG_SLIDE_PEGS,
  LUCKY_BOUNCE_FRACTION,
  SLIDE_GAP_TICKS,
  SUPER_LONG_SHOT_FRACTION,
} from './tuning';

/** The base game's style shots (spec 5; Off the Wall is expansion-only). */
export type StyleShotId =
  | 'bucketBounce'
  | 'longShot'
  | 'superLongShot'
  | 'doubleLongShot'
  | 'bucketKick'
  | 'luckyBounce'
  | 'bucketStreak'
  | 'bigBucketStreak'
  | 'longSlide'
  | 'orangeRush'
  | 'cleanFinish'
  | 'doublePower'
  | 'doubleCatch';

/** Master-specific style shots are named by their power: `power:<power id>:<name>`. */
export type PowerStyleShotId = `power:${string}`;
export type StyleShot = StyleShotId | PowerStyleShotId;

export const STYLE_POINTS: Readonly<Record<StyleShotId, number>> = {
  bucketBounce: 5000,
  longShot: 25000,
  superLongShot: 50000,
  doubleLongShot: 25000,
  bucketKick: 25000,
  luckyBounce: 25000,
  bucketStreak: 25000,
  bigBucketStreak: 100000,
  longSlide: 50000,
  orangeRush: 50000,
  cleanFinish: 50000,
  doublePower: 25000,
  doubleCatch: 100000,
};

/** Banner text (spec 5 naming; Double Catch is Teggle's name, spec 14.2). */
export const STYLE_NAMES: Readonly<Record<StyleShotId, string>> = {
  bucketBounce: 'Bucket Bounce',
  longShot: 'Long Shot',
  superLongShot: 'Super Long Shot',
  doubleLongShot: 'Double Long Shot',
  bucketKick: 'Bucket Kick',
  luckyBounce: 'Lucky Bounce',
  bucketStreak: 'Bucket Streak',
  bigBucketStreak: 'Big Bucket Streak',
  longSlide: 'Long Slide',
  orangeRush: 'Orange Rush',
  cleanFinish: 'Clean Finish',
  doublePower: 'Double Power',
  doubleCatch: 'Double Catch',
};

export interface PowerStyleShot {
  readonly shot: PowerStyleShotId;
  /** Banner text: Teggle's plain name, never the original's (spec 14.2). */
  readonly name: string;
  readonly points: number;
}

/**
 * The master-specific style shots (spec 5, the fan wiki's points; triggers in spec 14.2). The
 * powers award them through PowerContext.style; each scores at most once per shot.
 */
export const POWER_STYLE_SHOTS = {
  feverMultiball: {
    shot: 'power:multiball:feverMultiball',
    name: 'Fever Multiball',
    points: 25000,
  },
  pyramidCatch: { shot: 'power:pyramid:pyramidCatch', name: 'Pyramid Catch', points: 10000 },
  flipperRally: { shot: 'power:flippers:flipperRally', name: 'Flipper Rally', points: 25000 },
  fireballCatch: { shot: 'power:fireball:fireballCatch', name: 'Fireball Catch', points: 25000 },
  bigBallCatch: { shot: 'power:luckySpin:bigBallCatch', name: 'Big Ball Catch', points: 10000 },
} as const satisfies Record<string, PowerStyleShot>;

const POWER_STYLE_BY_SHOT: ReadonlyMap<string, PowerStyleShot> = new Map(
  Object.values(POWER_STYLE_SHOTS).map((s) => [s.shot, s]),
);

function isStyleShotId(shot: StyleShot): shot is StyleShotId {
  return Object.hasOwn(STYLE_POINTS, shot);
}

/** Banner name of any style shot; an unknown power shot shows the last part of its id. */
export function styleShotName(shot: StyleShot): string {
  if (isStyleShotId(shot)) return STYLE_NAMES[shot];
  const known = POWER_STYLE_BY_SHOT.get(shot);
  if (known !== undefined) return known.name;
  const parts = shot.split(':');
  return parts[parts.length - 1] ?? 'Style Shot';
}

/** Points of a style shot from the tables, or null for a power shot they do not list. */
export function styleShotPoints(shot: StyleShot): number | null {
  if (isStyleShotId(shot)) return STYLE_POINTS[shot];
  return POWER_STYLE_BY_SHOT.get(shot)?.points ?? null;
}

/** What the style tracker knows about one ball of the current shot (master-specific shots). */
export interface BallPathView {
  /** The ball has touched a peg or brick. */
  readonly touchedPeg: boolean;
  /** The ball touched a Pyramid slope after its last contact with a peg or brick. */
  readonly pyramidSincePeg: boolean;
  /** The ball has touched a flipper. */
  readonly flipped: boolean;
}

export interface StyleSink {
  awardStyle(shot: StyleShotId, ball: number, x: number, y: number): void;
}

/** True when the peg or brick with this element id is orange, green or purple. */
export type NonBlueLookup = (element: number) => boolean;

class BallTrack implements BallPathView {
  // Long Shot chain: the peg the ball touched last and where it touched it.
  anchor = -1;
  anchorNonBlue = false;
  /** The anchor ended a Long or Super Long Shot hop. */
  anchorChained = false;
  anchorX = 0;
  anchorY = 0;
  // Bucket Bounce.
  firstPeg = -1;
  manyPegs = false;
  touchedSincePeg = false;
  // Bucket Kick.
  bucketSincePeg = false;
  litFromBucket = false;
  // Lucky Bounce.
  rising = false;
  bucketY = 0;
  minY = 0;
  maxRise = 0;
  // Long Slide.
  readonly slid = new Int32Array(LONG_SLIDE_PEGS);
  slideCount = 0;
  lastSlideTick = 0;
  // Master-specific shots (Pyramid Catch, Flipper Rally).
  pyramidSincePeg = false;
  flipped = false;

  get touchedPeg(): boolean {
    return this.firstPeg >= 0;
  }

  reset(): void {
    this.anchor = -1;
    this.anchorNonBlue = false;
    this.anchorChained = false;
    this.anchorX = 0;
    this.anchorY = 0;
    this.firstPeg = -1;
    this.manyPegs = false;
    this.touchedSincePeg = false;
    this.bucketSincePeg = false;
    this.litFromBucket = false;
    this.rising = false;
    this.bucketY = 0;
    this.minY = 0;
    this.maxRise = 0;
    this.slideCount = 0;
    this.lastSlideTick = 0;
    this.pyramidSincePeg = false;
    this.flipped = false;
  }

  copyFrom(o: BallTrack): void {
    this.anchor = o.anchor;
    this.anchorNonBlue = o.anchorNonBlue;
    this.anchorChained = o.anchorChained;
    this.anchorX = o.anchorX;
    this.anchorY = o.anchorY;
    this.firstPeg = o.firstPeg;
    this.manyPegs = o.manyPegs;
    this.touchedSincePeg = o.touchedSincePeg;
    this.bucketSincePeg = o.bucketSincePeg;
    this.litFromBucket = o.litFromBucket;
    this.rising = o.rising;
    this.bucketY = o.bucketY;
    this.minY = o.minY;
    this.maxRise = o.maxRise;
    this.slid.set(o.slid);
    this.slideCount = o.slideCount;
    this.lastSlideTick = o.lastSlideTick;
    this.pyramidSincePeg = o.pyramidSincePeg;
    this.flipped = o.flipped;
  }

  /** A teleport or a Spooky return: the path is broken. */
  jump(): void {
    this.anchor = -1;
    this.anchorChained = false;
    this.touchedSincePeg = true;
    this.rising = false;
    this.slideCount = 0;
    this.pyramidSincePeg = false;
  }
}

export class StyleTracker {
  private readonly tracks: BallTrack[] = [];
  private longSlideDone = false;
  private flipperLit = 0;
  private readonly longDistance2: number;
  private readonly superLongDistance2: number;
  private readonly luckyRise: number;

  /** Thresholds scale with the board: Long Shot by its width, Lucky Bounce by its height. */
  constructor(boardWidth: number, boardHeight: number) {
    const long = boardWidth * LONG_SHOT_FRACTION;
    const superLong = boardWidth * SUPER_LONG_SHOT_FRACTION;
    this.longDistance2 = long * long;
    this.superLongDistance2 = superLong * superLong;
    this.luckyRise = boardHeight * LUCKY_BOUNCE_FRACTION;
  }

  /** Call when a shot starts. Ball tracks reset as their balls spawn. */
  startShot(): void {
    this.longSlideDone = false;
    this.flipperLit = 0;
  }

  /** The path facts of a ball of the current shot. */
  path(ball: number): BallPathView {
    return this.track(ball);
  }

  /** Pegs and bricks lit this shot by balls that had touched a flipper before (Flipper Rally). */
  get flipperPegs(): number {
    return this.flipperLit;
  }

  /**
   * True when the contact that just lit a peg came after a contact with the free ball bucket
   * (rim, Pyramid slope or cover), with no peg contact in between (Bucket Kick).
   */
  litFromBucket(ball: number): boolean {
    return this.tracks[ball]?.litFromBucket ?? false;
  }

  handle(e: SimEvent, nonBlue: NonBlueLookup, sink: StyleSink): void {
    switch (e.type) {
      case 'ballSpawned':
        this.track(e.ball).reset();
        return;
      case 'pegContact': {
        const t = this.track(e.ball);
        const colored = nonBlue(e.element);
        let hop = false;
        if (e.first && colored && t.anchor >= 0 && t.anchor !== e.element && t.anchorNonBlue) {
          const dx = e.x - t.anchorX;
          const dy = e.y - t.anchorY;
          const d2 = dx * dx + dy * dy;
          if (d2 >= this.superLongDistance2) {
            sink.awardStyle('superLongShot', e.ball, e.x, e.y);
            hop = true;
          } else if (d2 >= this.longDistance2) {
            sink.awardStyle('longShot', e.ball, e.x, e.y);
            hop = true;
          }
          if (hop && t.anchorChained) sink.awardStyle('doubleLongShot', e.ball, e.x, e.y);
        }
        if (t.anchor !== e.element) {
          t.anchor = e.element;
          t.anchorNonBlue = colored;
          t.anchorChained = hop;
        }
        t.anchorX = e.x;
        t.anchorY = e.y;

        if (t.firstPeg < 0) t.firstPeg = e.element;
        else if (t.firstPeg !== e.element) t.manyPegs = true;
        t.touchedSincePeg = false;

        t.litFromBucket = e.first && t.bucketSincePeg;
        t.bucketSincePeg = false;
        t.pyramidSincePeg = false;

        this.slide(t, e.slide, e.tick, e.element, e.ball, e.x, e.y, sink);
        return;
      }
      case 'bucketContact': {
        const t = this.track(e.ball);
        t.touchedSincePeg = true;
        if (e.part !== 'feverDivider') {
          t.bucketSincePeg = true;
          t.rising = true;
          t.bucketY = e.y;
          t.minY = e.y;
        }
        if (e.part === 'pyramid') t.pyramidSincePeg = true;
        this.slide(t, e.slide, e.tick, -1, e.ball, e.x, e.y, sink);
        return;
      }
      case 'solidContact':
      case 'wallContact':
      case 'flipperContact': {
        const t = this.track(e.ball);
        t.touchedSincePeg = true;
        if (e.type === 'flipperContact') t.flipped = true;
        this.slide(t, e.slide, e.tick, -1, e.ball, e.x, e.y, sink);
        return;
      }
      case 'ballContact':
        this.bump(this.track(e.ball));
        this.bump(this.track(e.other));
        return;
      case 'teleport':
      case 'ballReturned':
        this.track(e.ball).jump();
        return;
      case 'bucketCatch': {
        const t = this.track(e.ball);
        if (t.firstPeg >= 0 && !t.manyPegs && !t.touchedSincePeg) {
          sink.awardStyle('bucketBounce', e.ball, e.x, e.y);
        }
        if (t.maxRise >= this.luckyRise) sink.awardStyle('luckyBounce', e.ball, e.x, e.y);
        return;
      }
      case 'pegLit':
        if (e.ball >= 0 && this.track(e.ball).flipped) this.flipperLit++;
        return;
      case 'pegRemoved':
      case 'feverCatch':
      case 'ballOut':
        return;
    }
  }

  /** Call after every tick with the balls in play: tracks the rise after a bucket contact. */
  sample(balls: readonly BallView[]): void {
    for (let k = 0; k < balls.length; k++) {
      const b = balls[k];
      if (b === undefined) continue;
      const t = this.tracks[b.id];
      if (t === undefined || !t.rising) continue;
      if (b.y < t.minY) t.minY = b.y;
      const rise = t.bucketY - t.minY;
      if (rise > t.maxRise) t.maxRise = rise;
    }
  }

  copyFrom(o: StyleTracker): void {
    for (let k = 0; k < o.tracks.length; k++) {
      const src = o.tracks[k];
      if (src !== undefined) this.track(k).copyFrom(src);
    }
    for (let k = o.tracks.length; k < this.tracks.length; k++) this.tracks[k]?.reset();
    this.longSlideDone = o.longSlideDone;
    this.flipperLit = o.flipperLit;
  }

  private track(id: number): BallTrack {
    let t = this.tracks[id];
    while (t === undefined) {
      this.tracks.push(new BallTrack());
      t = this.tracks[id];
    }
    return t;
  }

  /** Another ball hit this one: a bounce. */
  private bump(t: BallTrack): void {
    t.touchedSincePeg = true;
    t.slideCount = 0;
  }

  /** Long Slide: distinct pegs touched in one run of slide contacts. */
  private slide(
    t: BallTrack,
    slide: boolean,
    tick: number,
    peg: number,
    ball: number,
    x: number,
    y: number,
    sink: StyleSink,
  ): void {
    if (!slide) {
      t.slideCount = 0;
      return;
    }
    if (tick - t.lastSlideTick > SLIDE_GAP_TICKS) t.slideCount = 0;
    t.lastSlideTick = tick;
    if (peg < 0 || this.longSlideDone) return;
    for (let k = 0; k < t.slideCount; k++) if (t.slid[k] === peg) return;
    t.slid[t.slideCount++] = peg;
    if (t.slideCount === LONG_SLIDE_PEGS) {
      this.longSlideDone = true;
      t.slideCount = 0;
      sink.awardStyle('longSlide', ball, x, y);
    }
  }
}
