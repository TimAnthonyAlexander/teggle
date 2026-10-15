// The master's expression in the launcher window (visual guide 7.4; spec 11 lists the master
// reacting to shots and powers). Rules events set it, show time (which stops while paused) runs
// it out, and it falls back to neutral after a moment. The portrait loader falls back to the
// neutral picture for an expression that has no art yet.

import type { RulesEvent } from '../../rules/events';
import type { Expression } from '../art/masters';

/** How long a reaction shows before the face returns to neutral, ms of show time. */
export const FACE_MS: Readonly<Record<Exclude<Expression, 'neutral'>, number>> = {
  happy: 2200,
  power: 1800,
  sad: 1800,
};

/** A shot that lights this many orange pegs counts as a good shot. */
export const GOOD_SHOT_ORANGE = 3;

export class MasterFace {
  private expression: Expression = 'neutral';
  /** Show time the current reaction ends; Infinity holds it (level won or lost). */
  private untilMs = 0;
  private orangeThisShot = 0;
  private reactedThisShot = false;

  reset(): void {
    this.expression = 'neutral';
    this.untilMs = 0;
    this.orangeThisShot = 0;
    this.reactedThisShot = false;
  }

  /** The expression to show at show time `nowMs`. */
  at(nowMs: number): Expression {
    return nowMs < this.untilMs ? this.expression : 'neutral';
  }

  private set(expression: Expression, nowMs: number, ms: number): void {
    // A held face (the level's result) stays until the next attempt.
    if (this.untilMs === Infinity) return;
    this.expression = expression;
    this.untilMs = nowMs + ms;
  }

  handle(e: RulesEvent, nowMs: number): void {
    switch (e.type) {
      case 'shotStart':
        this.orangeThisShot = 0;
        this.reactedThisShot = false;
        break;
      case 'pegScored':
        if (e.color === 'orange') this.orangeThisShot++;
        break;
      case 'greenHit':
        if (e.power !== null) this.set('power', nowMs, FACE_MS.power);
        break;
      case 'freeBall':
      case 'styleShot':
        this.reactedThisShot = true;
        this.set('happy', nowMs, FACE_MS.happy);
        break;
      case 'shotTally':
        if (this.orangeThisShot >= GOOD_SHOT_ORANGE) {
          this.set('happy', nowMs, FACE_MS.happy);
        } else if (this.orangeThisShot === 0 && !this.reactedThisShot) {
          // A miss: nothing that counts toward the level.
          this.set('sad', nowMs, FACE_MS.sad);
        }
        break;
      case 'fever':
        this.set('happy', nowMs, FACE_MS.happy);
        break;
      case 'levelWon':
        this.set('happy', nowMs, Infinity);
        break;
      case 'levelLost':
        this.set('sad', nowMs, Infinity);
        break;
      default:
        break;
    }
  }
}
