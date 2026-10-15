// Rules events for the renderer and audio, separate from the simulation's events. An attempt
// queues them until Attempt.takeEvents(); unlike sim events they are plain objects that may be
// kept. Element and ball ids are -1 where none applies; `tick` is the world tick.

import type { PegLitCause } from '../sim/events';
import type { PegColor } from './scoring';
import type { StyleShot } from './style';

export type FreeBallReason = 'bucket' | 'threshold' | 'coinFlip' | 'power';
export type EffectChange = 'granted' | 'extended' | 'started' | 'ended';

/** A ball left the cannon. */
export interface ShotStartEvent {
  readonly type: 'shotStart';
  readonly tick: number;
  /** 0-based shot number in this attempt. */
  readonly shot: number;
  /** Balls in stock after this one was taken. */
  readonly ballsLeft: number;
  readonly orangeLeft: number;
}

/** A peg or brick lit and scored. Its value is already multiplied (the popup shows it). */
export interface PegScoredEvent {
  readonly type: 'pegScored';
  readonly tick: number;
  readonly element: number;
  readonly color: PegColor;
  readonly value: number;
  /** Ball that lit it, or -1 when a power did. */
  readonly ball: number;
  readonly cause: PegLitCause;
  readonly x: number;
  readonly y: number;
  /** Running shot totals including this peg: sum of values, pegs lit, sum x count. */
  readonly shotSum: number;
  readonly shotCount: number;
  readonly shotScore: number;
  /** Orange pegs left after this one. */
  readonly orangeLeft: number;
}

/** The fever meter reached a new multiplier (x2, x3, x5, x10). */
export interface MeterStepEvent {
  readonly type: 'meterStep';
  readonly tick: number;
  readonly multiplier: number;
  readonly orangeLeft: number;
  /** Lit meter segments, 0 to 25. */
  readonly meterLevel: number;
}

/** A green peg lit; `power` is the id of the power it triggered, or null. */
export interface GreenHitEvent {
  readonly type: 'greenHit';
  readonly tick: number;
  readonly element: number;
  readonly ball: number;
  readonly x: number;
  readonly y: number;
  readonly power: string | null;
}

/**
 * What a power did beyond lighting pegs and granting effects, for the presentation: a spawned
 * ball, a blast, the pegs a flower lit, a spin of the wheel, the shot a search found.
 */
export type PowerActionKind =
  | 'multiball'
  | 'spaceBlast'
  | 'flowerPower'
  | 'spookyBall'
  | 'luckySpin'
  | 'coverBurned'
  | 'zenShot';

/** The four outcomes of the Lucky Spin wheel, in wheel order. */
export type LuckySpinOutcome = 'bigBall' | 'tripleScore' | 'extraBall' | 'randomPower';

export interface PowerAction {
  readonly action: PowerActionKind;
  /** Where it happened, board px: the green peg, the bucket, or the cannon for Zen Ball. */
  readonly x: number;
  readonly y: number;
  /**
   * Action-specific number: the spawned ball's id (multiball), the blast radius (spaceBlast),
   * the ball given a return (spookyBall, -1 for all), the wheel segment 0 to 3 (luckySpin),
   * Zen Ball's gain over the player's shot in per mille (zenShot).
   */
  readonly value: number;
  /** Elements the power lit, in the order they lit (Space Blast, Flower Power). */
  readonly elements: readonly number[];
  /**
   * Lucky Spin: the outcome ('bigBall', 'tripleScore', 'extraBall'), or for the random segment
   * the id of the power it drew. Zen Ball: 'better' or 'kept'. Empty otherwise.
   */
  readonly detail: string;
  /** Launch direction a Zen shot found (unit vector); 0, 0 otherwise. */
  readonly dx: number;
  readonly dy: number;
}

export interface PowerActionEvent extends PowerAction {
  readonly type: 'powerAction';
  readonly tick: number;
  readonly power: string;
}

/** A power effect was granted, extended, began covering shots, or ran out. */
export interface EffectEvent {
  readonly type: 'effect';
  readonly tick: number;
  readonly power: string;
  readonly tag: string;
  readonly change: EffectChange;
  readonly shotsLeft: number;
}

export interface StyleShotEvent {
  readonly type: 'styleShot';
  readonly tick: number;
  readonly shot: StyleShot;
  readonly points: number;
  /** Ball that earned it, or -1 (streaks, powers). */
  readonly ball: number;
  readonly x: number;
  readonly y: number;
}

export interface FreeBallEvent {
  readonly type: 'freeBall';
  readonly tick: number;
  readonly reason: FreeBallReason;
  /** The shot score threshold passed (25,000, 75,000 or 125,000), or 0. */
  readonly threshold: number;
  /** Balls in stock after this one was added. */
  readonly ballsLeft: number;
}

/** A shot hit no peg: the coin spun. A win also brings a freeBall event. */
export interface CoinFlipEvent {
  readonly type: 'coinFlip';
  readonly tick: number;
  readonly won: boolean;
}

/** Stuck-ball handling removed a lit peg (`element`) or, failing that, the ball (-1). */
export interface StuckEvent {
  readonly type: 'stuck';
  readonly tick: number;
  readonly ball: number;
  readonly element: number;
}

/** The last orange peg lit: the level is won and Fever runs until the ball lands. */
export interface FeverEvent {
  readonly type: 'fever';
  readonly tick: number;
  readonly element: number;
  readonly x: number;
  readonly y: number;
}

/** A ball landed in a Fever bucket. Its points are added when the shot ends. */
export interface FeverBucketEvent {
  readonly type: 'feverBucket';
  readonly tick: number;
  readonly ball: number;
  /** 0 = leftmost. */
  readonly bucket: number;
  readonly points: number;
  /** Every peg was cleared: all buckets pay 100,000. */
  readonly fullClear: boolean;
}

/** The shot ended and its pegs were removed: sum x count, style points, new total. */
export interface ShotTallyEvent {
  readonly type: 'shotTally';
  readonly tick: number;
  readonly shot: number;
  readonly sum: number;
  readonly count: number;
  readonly shotScore: number;
  readonly styleScore: number;
  readonly score: number;
}

/** The purple peg moved between shots (`from` turned blue unless it was hit). */
export interface PurpleMovedEvent {
  readonly type: 'purpleMoved';
  readonly tick: number;
  readonly from: number;
  readonly to: number;
}

export interface UnusedBallsEvent {
  readonly type: 'unusedBalls';
  readonly tick: number;
  readonly balls: number;
  readonly points: number;
  readonly score: number;
}

export interface ClearBonusEvent {
  readonly type: 'clearBonus';
  readonly tick: number;
  readonly try: number;
  readonly points: number;
  readonly score: number;
}

/** The attempt is over and won; every bonus is in `score`. */
export interface LevelWonEvent {
  readonly type: 'levelWon';
  readonly tick: number;
  readonly score: number;
  /** Every peg was cleared ("all pegs cleared" mark). */
  readonly fullClear: boolean;
  readonly feverPoints: number;
  readonly shots: number;
}

/** Out of balls with orange pegs left. */
export interface LevelLostEvent {
  readonly type: 'levelLost';
  readonly tick: number;
  readonly score: number;
  readonly orangeLeft: number;
  readonly shots: number;
}

export type RulesEvent =
  | ShotStartEvent
  | PegScoredEvent
  | MeterStepEvent
  | GreenHitEvent
  | EffectEvent
  | PowerActionEvent
  | StyleShotEvent
  | FreeBallEvent
  | CoinFlipEvent
  | StuckEvent
  | FeverEvent
  | FeverBucketEvent
  | ShotTallyEvent
  | PurpleMovedEvent
  | UnusedBallsEvent
  | ClearBonusEvent
  | LevelWonEvent
  | LevelLostEvent;

export type RulesEventType = RulesEvent['type'];
