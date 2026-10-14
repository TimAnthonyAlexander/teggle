// The score breakdown the end dialogs show, collected from an attempt's rules events. Its parts
// add up to the attempt's own score: shot points (sum x count of every shot), style points, the
// Fever bucket, unused balls and the campaign clear bonus.

import type { AttemptView } from '../../rules/attempt';
import type { RulesEvent } from '../../rules/events';

export interface ScoreBreakdown {
  readonly result: 'won' | 'lost' | null;
  readonly shots: number;
  readonly freeBalls: number;
  /** Share of the level's pegs and bricks cleared, whole percent rounded down. */
  readonly cleared: number;
  readonly shotPoints: number;
  readonly stylePoints: number;
  readonly feverPoints: number;
  readonly unusedBalls: number;
  readonly unusedPoints: number;
  readonly clearBonus: number;
  /** The campaign try the clear bonus was for, or null outside the campaign. */
  readonly clearTry: number | null;
  readonly fullClear: boolean;
  /** Sum of the parts; equals the attempt's score once it is over. */
  readonly total: number;
}

export class ScoreLedger {
  private shotPoints = 0;
  private stylePoints = 0;
  private feverPoints = 0;
  private freeBalls = 0;
  private unusedBalls = 0;
  private unusedPoints = 0;
  private clearBonus = 0;
  private clearTry: number | null = null;
  private fullClear = false;

  add(e: RulesEvent): void {
    switch (e.type) {
      case 'shotTally':
        this.shotPoints += e.shotScore;
        this.stylePoints += e.styleScore;
        break;
      case 'feverBucket':
        this.feverPoints += e.points;
        break;
      case 'freeBall':
        this.freeBalls++;
        break;
      case 'unusedBalls':
        this.unusedBalls = e.balls;
        this.unusedPoints = e.points;
        break;
      case 'clearBonus':
        this.clearBonus = e.points;
        this.clearTry = e.try;
        break;
      case 'levelWon':
        this.fullClear = e.fullClear;
        break;
      default:
        break;
    }
  }

  breakdown(attempt: AttemptView): ScoreBreakdown {
    const level = attempt.level;
    let gone = 0;
    for (const i of level.scoringBodies) if (attempt.world.bodies[i]?.active === false) gone++;
    const total = level.scoringBodies.length;
    return {
      result: attempt.result,
      shots: attempt.shotsTaken,
      freeBalls: this.freeBalls,
      cleared: total === 0 ? 0 : Math.floor((100 * gone) / total),
      shotPoints: this.shotPoints,
      stylePoints: this.stylePoints,
      feverPoints: this.feverPoints,
      unusedBalls: this.unusedBalls,
      unusedPoints: this.unusedPoints,
      clearBonus: this.clearBonus,
      clearTry: this.clearTry,
      fullClear: this.fullClear,
      total:
        this.shotPoints + this.stylePoints + this.feverPoints + this.unusedPoints + this.clearBonus,
    };
  }
}
