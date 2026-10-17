// What the play screen needs from the mode it plays in (Adventure, Quick Play, or the bare test
// route #/play/...): the master and theme, each attempt's config, the score window labels, where
// the end dialog's buttons lead, and hooks that record progress. The play screen itself knows
// nothing about saves or menus.

import type { AttemptView } from '../../rules/attempt';
import { attemptConfig, type AttemptConfig } from '../../rules/config';
import type { PowerId } from '../../rules/powers';
import type { ChallengeEndView } from './dialogs';
import type { ScoreBreakdown } from './summary';

export interface AttemptPlan {
  readonly config: AttemptConfig;
  readonly seed: number;
}

/** The two label lines of a score window (visual guide 7.3). */
export interface WindowLabels {
  readonly line1: string;
  readonly line2: string;
}

export interface PlayHost {
  /** Frame theme (visual guide 13). */
  readonly theme: number;
  /** The master's power the green pegs trigger, or null for none; picks the launcher portrait. */
  readonly power: PowerId | null;
  readonly left: WindowLabels;
  readonly right: WindowLabels;
  /** Plans the attempt that starts now; `screenTry` is 1 for the first attempt on the screen. */
  plan(screenTry: number): AttemptPlan;
  /** The right window's value, from the live level score and the screen's best score. */
  rightValue(live: number, screenBest: number): number;
  /** The level complete dialog's total score row for this level score, or null for no row. */
  totalAfter(levelScore: number): number | null;
  /** The attempt's first shot left the cannon. */
  attemptStarted(attempt: AttemptView): void;
  /** The attempt is over (won or lost); called once per attempt. */
  attemptEnded(attempt: AttemptView, result: ScoreBreakdown): void;
  /** The level complete button: its label and route, or null to play the level again here. */
  readonly next: { readonly label: string; readonly hash: string | null };
  /** The pause dialog's way out. */
  readonly quit: { readonly label: string; readonly hash: string };
  /** A challenge run (src/game/modes/challenge-host.ts); absent in the other modes. */
  readonly challenge?: ChallengeHooks;
}

/** What a challenge changes in the play screen. */
export interface ChallengeHooks {
  /** The pause dialog's restart: it starts the whole run over, here. */
  readonly restart: { readonly label: string; readonly hash: string };
  /**
   * The challenge end dialog once the attempt is over, or null when the run goes on to its next
   * level (the level complete dialog then shows, its button leading to `next`).
   */
  end(attempt: AttemptView, result: ScoreBreakdown): ChallengeEndView | null;
}

export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] ?? 1;
}

/** Options of the bare test route #/play/<path> (see play/route.ts). */
export interface PlayOptions {
  /** Seed of the first attempt; retries use the next seeds. Random when omitted. */
  readonly seed: number | null;
  readonly theme: number;
  /** Count tries as campaign tries for the clear bonus (spec 5). */
  readonly campaign: boolean;
  /** Balls at the start instead of 10. */
  readonly balls: number | null;
  /** Orange pegs to clear instead of 25 (challenges use 35, 45 or 55; spec 3). */
  readonly orange: number | null;
  /** The master's power the green pegs trigger, or null for none. */
  readonly power: PowerId | null;
}

/** The test route's host: no progress, quits to the main menu, plays again on the spot. */
export function testHost(options: PlayOptions): PlayHost {
  return {
    theme: options.theme,
    power: options.power,
    left: { line1: 'Level', line2: 'Score' },
    right: { line1: 'Session', line2: 'Best' },
    plan: (screenTry) => ({
      seed: options.seed === null ? randomSeed() : (options.seed + screenTry - 1) >>> 0,
      config: attemptConfig({
        ...(options.balls === null ? {} : { balls: options.balls }),
        ...(options.orange === null ? {} : { orangeCount: options.orange }),
        campaignTry: options.campaign ? screenTry : null,
        power: options.power,
      }),
    }),
    rightValue: (live, best) => Math.max(live, best),
    totalAfter: () => null,
    attemptStarted: () => undefined,
    attemptEnded: () => undefined,
    next: { label: 'Play Again', hash: null },
    quit: { label: 'Quit', hash: '#/' },
  };
}
