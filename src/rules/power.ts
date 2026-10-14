// The power interface (spec 7). A green peg lighting calls the master's Power.onGreen with a
// context that reaches the world's control API, the rules state and the attempt's Rng. Powers
// that last (Guide, Pyramid, Flippers, Lucky Spin's Triple Score and bigger ball, Fireball, Zen
// Ball) grant effects: plain data counted in shots, starting now or with the next shot. The
// attempt calls the effect hooks of the power that granted each effect while it is active.
//
// Powers keep no state of their own: everything lives in the attempt (effects, the Rng, the
// world), so attempts clone and replay exactly. Contract for powers:
// - Draw every random choice from ctx.rng.
// - Light pegs with ctx.world.lightPegs; never remove a peg that is not lit.
// - begin and end may toggle world parts (setPyramid, setFlippers, setBucketCover,
//   setBucketTravel) but must not light pegs or add balls: they can run between shots.

import type { Rng } from '../core/rng';
import type { Vec2 } from '../level/geometry';
import type { PegLitCause, SimEvent } from '../sim/events';
import type { World } from '../sim/world';
import type { AttemptView } from './attempt';
import type { PegColor } from './scoring';
import type { PowerStyleShotId } from './style';
import { AIM_GUIDE_TICKS } from './tuning';

/** 'now' covers the current shot as its first; 'next' starts with the next shot (spec 7). */
export type EffectStart = 'now' | 'next';

export interface EffectView {
  /** Id of the power that granted it; its hooks run for this effect. */
  readonly power: string;
  /** The power's name for this effect, unique per power ('guide', 'tripleScore', ...). */
  readonly tag: string;
  /** Shots it still covers, the current or next one included. */
  readonly shotsLeft: number;
  /** Granted during this shot for the next one; turns active when this shot ends. */
  readonly pending: boolean;
}

/** Aim guide shape: TrajectoryPreview options. */
export interface AimGuide {
  /** Path length in simulation ticks. */
  readonly ticks: number;
  /** Follow the path through the first contact (Guide power). */
  readonly throughFirstBounce: boolean;
}

export const BASE_AIM_GUIDE: AimGuide = { ticks: AIM_GUIDE_TICKS, throughFirstBounce: false };

/** The shot about to leave the cannon. Effects may change it before the launch. */
export interface LaunchPlan {
  /** Launch direction (Zen Ball replaces it). The player's direction is what gets recorded. */
  direction: Vec2;
  /** Ball options for World.launch (Fireball, bigger ball, Spooky Ball). */
  readonly options: { radius?: number; passThroughScoring?: boolean; topReturns?: number };
}

export interface GreenHit {
  readonly tick: number;
  readonly element: number;
  /** Ball that lit it, or -1 when a power did. */
  readonly ball: number;
  readonly cause: PegLitCause;
  readonly x: number;
  readonly y: number;
}

export interface PowerContext {
  readonly power: Power;
  /** The world's control API: lightPegs, spawnBall, configureBall, setPyramid, ... */
  readonly world: World;
  readonly attempt: AttemptView;
  /** The attempt's random numbers; every random choice of a power comes from here. */
  readonly rng: Rng;
  /**
   * Starts one of this power's effects, or adds `shots` to it while it is still running or
   * pending (stacking by default; a power that wants another rule checks `effect(tag)` first).
   */
  grant(tag: string, shots: number, start: EffectStart): EffectView;
  /** Ends one of this power's effects now (its end hook runs). */
  revoke(tag: string): void;
  /** One of this power's effects, or null. */
  effect(tag: string): EffectView | null;
  /** Adds a ball to the stock (Lucky Spin's extra ball). */
  freeBall(): void;
  /** Awards a master-specific style shot; points are added at shot end, unmultiplied. */
  style(shot: PowerStyleShotId, points: number, x: number, y: number): void;
  /** Runs another power's onGreen for this green hit (Lucky Spin's random power). */
  trigger(power: string, green: GreenHit): void;
}

/**
 * A master's power. onGreen is required; the rest are hooks for the effects it grants. Each hook
 * gets the effect it runs for and only runs while that effect is active (not pending).
 */
export interface Power {
  /** Stable id, stored in attempt configs and replays. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** A green peg lit during a shot, by a ball or by a power. */
  onGreen(ctx: PowerContext, green: GreenHit): void;
  /** The effect became active: now, or when the shot that granted it for 'next' ended. */
  begin?(ctx: PowerContext, effect: EffectView): void;
  /** The effect ran out or was revoked. */
  end?(ctx: PowerContext, effect: EffectView): void;
  /** Before the ball leaves the cannon: change the direction or the ball options. */
  launch?(ctx: PowerContext, effect: EffectView, plan: LaunchPlan): void;
  /** The ball is in play. */
  shotStart?(ctx: PowerContext, effect: EffectView): void;
  /** Every simulation event during a shot, after the rules handled it. */
  event?(ctx: PowerContext, effect: EffectView, e: SimEvent): void;
  /** The shot's balls are gone and its pegs removed; before the tally and the countdown. */
  shotEnd?(ctx: PowerContext, effect: EffectView): void;
  /** Changes a peg's value as it lights (Triple Score). */
  pegValue?(effect: EffectView, value: number, color: PegColor): number;
  /** Changes the aim guide (Guide). */
  aimGuide?(effect: EffectView, guide: AimGuide): AimGuide;
}

export type PowerRegistry = ReadonlyMap<string, Power>;

/** No powers: green pegs light and score but trigger nothing. */
export const NO_POWERS: PowerRegistry = new Map();
