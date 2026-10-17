// The play screen's host for a challenge level (spec 8): the challenge's rules for the run's
// next level (src/rules/challenges.ts, levelConfig), the score windows, the run's progress after
// each level, and the challenge's own end dialog once the run passed or failed. A run won level
// by level goes on through the level complete dialog to the next level.

import type { AttemptView } from '../../rules/attempt';
import {
  afterLevel,
  carriesBalls,
  levelConfig,
  type ChallengeDef,
  type ChallengeRun,
} from '../../rules/challenges';
import { masterOfPower } from '../../rules/masters';
import { goalSentence, type LevelNamer } from '../menus/challenge-copy';
import type { ChallengeEndView } from '../play/dialogs';
import { randomSeed, type PlayHost } from '../play/host';
import type { ScoreBreakdown } from '../play/summary';
import { challengeRecord, recordChallengeStart } from '../progress/save';
import type { ProgressStore } from '../progress/store';
import { formatNumber } from '../ui/text';
import { endRun, type ActiveRun } from './challenge-run';

/** The list page of a challenge's group. */
export function listHash(def: ChallengeDef): string {
  return `#/challenges?group=${def.group}`;
}

/** Route that plays the run's next level. */
export const NEXT_LEVEL_HASH = '#/challenges/run/next';

function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

/** Why the run failed, in one sentence. */
function failure(
  run: ChallengeRun,
  def: ChallengeDef,
  r: ScoreBreakdown,
  orangeLeft: number,
  name: LevelNamer,
): string {
  const n = run.levels.length;
  const level = name(run.levels[run.index] ?? '');
  switch (run.reason) {
    case 'lost':
      return n > 1
        ? `Lost on level ${run.index + 1} of ${n}, ${level}, with ${plural(orangeLeft, 'orange peg', 'orange pegs')} left.`
        : `The balls ran out with ${plural(orangeLeft, 'orange peg', 'orange pegs')} left.`;
    case 'notCleared':
      return `Won with ${r.cleared}% of the board cleared, but every peg has to go.`;
    case 'score':
      return `The run finished on ${formatNumber(run.total)}, short of the ${formatNumber(def.score ?? 0)} to beat.`;
    case 'noBalls':
      return `No balls were left for level ${run.index + 2} of ${n}.`;
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
    name: def.name,
    goal: goalSentence(def, name),
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

/**
 * The host of the run's current level. The run moves on in attemptEnded, so the dialogs read
 * the run as it stands after the level.
 */
export function challengeHost(store: ProgressStore, active: ActiveRun, name: LevelNamer): PlayHost {
  const def = active.def;
  const power = active.power;
  const index = active.run.index;
  const levels = active.run.levels.length;
  const balls = active.run.balls;
  const totalBase = active.run.total;
  const multi = levels > 1;
  return {
    theme: masterOfPower(power).theme,
    power,
    left: multi
      ? { line1: 'Level', line2: `${index + 1} of ${levels}` }
      : { line1: 'Level', line2: 'Score' },
    right: multi
      ? { line1: 'Run', line2: 'Total' }
      : def.score !== null
        ? { line1: 'To', line2: 'Beat' }
        : { line1: 'Best', line2: 'Score' },
    plan: () => ({ seed: randomSeed(), config: levelConfig(def, balls, power) }),
    rightValue: (live) =>
      multi
        ? totalBase + live
        : def.score !== null
          ? def.score
          : Math.max(live, challengeRecord(store.progress, def.id).best ?? 0),
    totalAfter: (score) => (multi ? totalBase + score : null),
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
