// The play screen's host for a challenge level (spec 8): the challenge's rules for the run's
// next level (src/rules/challenges.ts, levelConfig), the goal card as the level starts, the score
// windows as the goal tracker, the target the run must beat, the run's progress after each level,
// and the challenge's own end dialog once the run passed or failed. A run won level by level goes
// on through the level complete dialog to the next level.

import type { AttemptView } from '../../rules/attempt';
import {
  afterLevel,
  carriesBalls,
  levelConfig,
  type ChallengeDef,
  type ChallengeRun,
} from '../../rules/challenges';
import { masterOfPower } from '../../rules/masters';
import {
  cardTitle,
  goalBand,
  goalSentence,
  runLine,
  type LevelNamer,
} from '../menus/challenge-copy';
import type { ChallengeEndView } from '../play/dialogs';
import { randomSeed, type BoardCounts, type PlayHost, type WindowLabels } from '../play/host';
import type { ScoreBreakdown } from '../play/summary';
import { challengeRecord, recordChallengeStart } from '../progress/save';
import type { ProgressStore } from '../progress/store';
import { formatNumber } from '../ui/text';
import { endRun, type ActiveRun } from './challenge-run';

/** The list page of a challenge's group. */
export function listHash(def: ChallengeDef): string {
  return `#/challenges?group=${def.group}`;
}

/** The list page of a challenge's group with its briefing card open. */
export function cardHash(def: ChallengeDef): string {
  return `${listHash(def)}&open=${def.id}`;
}

/** Route that plays the run's next level. */
export const NEXT_LEVEL_HASH = '#/challenges/run/next';

function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

/** Why the run failed, in one or two plain sentences. */
function failure(
  run: ChallengeRun,
  def: ChallengeDef,
  r: ScoreBreakdown,
  orangeLeft: number,
  name: LevelNamer,
): string {
  const n = run.levels.length;
  const left = plural(orangeLeft, 'orange peg', 'orange pegs');
  switch (run.reason) {
    case 'lost':
      return n > 1
        ? `The balls ran out on ${name(run.levels[run.index] ?? '')}, level ${run.index + 1} of ${n}, with ${left} left.`
        : `The balls ran out with ${left} left.`;
    case 'notCleared':
      return `You won with ${r.cleared}% of the board cleared. Every peg and brick has to go.`;
    case 'score': {
      const needed = `You needed more than ${formatNumber(def.score ?? 0)}.`;
      return n > 1
        ? `Your ${n} levels scored ${formatNumber(run.total)} combined. ${needed}`
        : `You scored ${formatNumber(run.total)}. ${needed}`;
    }
    case 'noBalls':
      return `You had no balls left for level ${run.index + 2} of ${n}.`;
    default:
      return 'The run is over.';
  }
}

/** The end dialog of a run that passed or failed. */
export function endView(
  active: ActiveRun,
  r: ScoreBreakdown,
  orangeLeft: number,
  name: LevelNamer,
  tries: number,
): ChallengeEndView {
  const { def, run } = active;
  const n = run.levels.length;
  const passed = run.status === 'passed';
  const rows: [string, string][] = [];
  if (def.score !== null) rows.push(['To beat:', formatNumber(def.score)]);
  if (n > 1) {
    rows.push(['Levels won:', `${run.won} of ${n}`]);
    rows.push(['Run total:', formatNumber(run.total)]);
  } else {
    rows.push(['Level score:', formatNumber(r.total)]);
  }
  if (def.fullClear) rows.push(['Board cleared:', `${r.cleared}%`]);
  if (carriesBalls(def) && passed) {
    rows.push(['Balls left:', String(run.results.at(-1)?.ballsLeft ?? 0)]);
  }
  if (n === 1) rows.push(['Shots:', String(r.shots)]);
  rows.push(['Tries:', String(tries)]);
  return {
    passed,
    title: cardTitle(def, name, active.pick),
    goal: goalSentence(def, name, active.pick),
    rows,
    verdict: passed
      ? tries === 1
        ? 'Passed on the first try. The medal is yours!'
        : 'Passed! The medal is yours.'
      : failure(run, def, r, orangeLeft, name),
    primary: passed
      ? { label: 'Challenges', hash: listHash(def) }
      : { label: 'Try Again', hash: active.startHash },
    secondary: passed
      ? { label: 'Play Again', hash: active.startHash }
      : { label: 'Challenges', hash: listHash(def) },
  };
}

/** "14 / 26". */
function outOf(value: number, of: number): string {
  return `${formatNumber(value)} / ${formatNumber(of)}`;
}

/**
 * The score windows of a challenge level: the left one holds the level score ("Level 2 of 3" in
 * a run), the right one tracks the goal for the whole level: the orange left of the count, the
 * pegs and bricks left, the score to beat, or the run's total (over the target, if any).
 */
function windows(
  def: ChallengeDef,
  run: ChallengeRun,
  store: ProgressStore,
): {
  left: WindowLabels;
  right: WindowLabels;
  value: (live: number, board: BoardCounts) => number | string;
} {
  const n = run.levels.length;
  const index = run.index;
  const base = run.total;
  if (n > 1) {
    const score = def.score;
    return {
      left: { line1: 'Level', line2: `${index + 1} of ${n}` },
      right: { line1: 'Run', line2: 'Total' },
      value: (live) => (score === null ? base + live : outOf(base + live, score)),
    };
  }
  const left: WindowLabels = { line1: 'Level', line2: 'Score' };
  if (def.score !== null) {
    const score = def.score;
    return { left, right: { line1: 'To', line2: 'Beat' }, value: () => score };
  }
  if (def.fullClear) {
    return { left, right: { line1: 'Pegs', line2: 'Left' }, value: (_, b) => b.pegsLeft };
  }
  if (def.orange !== null || def.balls !== null) {
    return {
      left,
      right: { line1: 'Orange', line2: 'Left' },
      value: (_, b) => outOf(b.orangeLeft, b.orangeCount),
    };
  }
  return {
    left,
    right: { line1: 'Best', line2: 'Score' },
    value: (live) => Math.max(live, challengeRecord(store.progress, def.id).best ?? 0),
  };
}

/**
 * The host of the run's current level. The run moves on in attemptEnded, so the dialogs read
 * the run as it stands after the level.
 */
export function challengeHost(store: ProgressStore, active: ActiveRun, name: LevelNamer): PlayHost {
  const def = active.def;
  const power = active.power;
  const run = active.run;
  const index = run.index;
  const levels = run.levels.length;
  const balls = run.balls;
  const totalBase = run.total;
  const w = windows(def, run, store);
  return {
    theme: masterOfPower(power).theme,
    power,
    left: w.left,
    right: w.right,
    plan: () => ({ seed: randomSeed(), config: levelConfig(def, balls, power) }),
    rightValue: (live, _best, board) => w.value(live, board),
    totalAfter: (score) => (levels > 1 ? totalBase + score : null),
    attemptStarted: () => {
      if (active.counted || index !== 0) return;
      active.counted = true;
      store.update((p) => recordChallengeStart(p, def.id));
    },
    attemptEnded: (attempt: AttemptView, result: ScoreBreakdown) => {
      if (active.run.index !== index || active.run.status !== 'playing') return;
      active.run = afterLevel(def, active.run, {
        won: attempt.result === 'won',
        score: attempt.score,
        fullClear: result.fullClear,
        ballsLeft: attempt.ballsLeft,
      });
      if (active.run.status !== 'playing') endRun(store, active);
    },
    next: { label: 'Next Level', hash: NEXT_LEVEL_HASH },
    quit: { label: 'Challenges', hash: listHash(def) },
    challenge: {
      restart: { label: 'Restart Challenge', hash: active.startHash },
      laterLevel: index > 0,
      briefing: {
        band: goalBand(def),
        goal: goalSentence(def, name, active.pick),
        run: runLine(run.levels, index, name),
      },
      target:
        def.score === null
          ? null
          : { score: def.score, base: totalBase, lastLevel: index === levels - 1 },
      end: (attempt, result) =>
        active.run.status === 'playing'
          ? null
          : endView(
              active,
              result,
              attempt.orangeLeft,
              name,
              challengeRecord(store.progress, def.id).tries,
            ),
    },
  };
}
