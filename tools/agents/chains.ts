// Whole challenge runs put together from level runs, for `npm run agents:challenges`
// (challenges.ts): a challenge's numbers in Teggle and in the original, one chain of level runs,
// and the score at which two sets of chains pass equally often.

import { orangeCountOf, type ChallengeDef } from '../../src/rules/challenges';
import { DEFAULT_BALLS, ORIGINAL_ORANGE_COUNT } from '../../src/rules/tuning';

/** Carried stocks are measured from 1 to this many balls; a larger stock plays as this many. */
export const CARRY_MAX = 12;

/** A challenge's numbers in one game: orange per level, score to beat, start balls. */
export interface Numbers {
  readonly orange: number;
  readonly score: number | null;
  readonly balls: number | null;
  readonly fullClear: boolean;
}

const ORIGINAL_TOTALS = [750_000, 800_000, 850_000, 900_000, 1_000_000] as const;

/** The original's numbers for a challenge (its `trophy.cfg`; research 6). */
export function originalNumbers(c: ChallengeDef): Numbers {
  const plain: Numbers = {
    orange: ORIGINAL_ORANGE_COUNT,
    score: null,
    balls: null,
    fullClear: c.fullClear,
  };
  switch (c.group) {
    case 'orange-1':
      return { ...plain, orange: 35 };
    case 'orange-2':
      return { ...plain, orange: 45 };
    case 'orange-3':
      return { ...plain, orange: 55 };
    case 'cup-1':
      return { ...plain, score: 300_000 };
    case 'cup-2':
      return { ...plain, score: 350_000 };
    case 'cup-3':
      return { ...plain, score: 400_000 };
    case 'totals':
      return { ...plain, score: ORIGINAL_TOTALS[c.index - 1] ?? null };
    case 'insane':
      if (c.index === 1) return { ...plain, balls: 2 };
      if (c.index === 2) return { ...plain, balls: 1 };
      if (c.index === 3) return { ...plain, balls: 10 };
      if (c.index === 4) return { ...plain, score: 750_000 };
      return plain;
    default:
      return plain;
  }
}

/** Teggle's numbers: the challenge's own definition. */
export function teggleNumbers(c: ChallengeDef): Numbers {
  return { orange: orangeCountOf(c), score: c.score, balls: c.balls, fullClear: c.fullClear };
}

/** One level run as a chain needs it (a subset of the agents' RunResult). */
export interface LevelRun {
  readonly won: boolean;
  readonly fullClear: boolean;
  readonly score: number;
  readonly ballsLeft: number;
}

/** What a chain reached: every level won (cleared, with balls to go on) and its total score. */
export interface ChainOutcome {
  readonly complete: boolean;
  readonly total: number;
  /** A carried stock above CARRY_MAX was played as CARRY_MAX. */
  readonly clamped: boolean;
}

/**
 * One challenge run over `levels`: `runOf(slot, balls)` gives the level run this chain plays on
 * that level with that many balls. The first level starts with the challenge's balls; later ones
 * with the balls the last one left when the stock carries, else with 10.
 */
export function chainOutcome(
  levels: readonly string[],
  n: Numbers,
  carry: boolean,
  runOf: (slot: string, balls: number) => LevelRun | undefined,
): ChainOutcome {
  let balls = n.balls ?? DEFAULT_BALLS;
  let total = 0;
  let clamped = false;
  for (let i = 0; i < levels.length; i++) {
    const slot = levels[i] ?? '';
    let b = balls;
    if (i > 0 && b > CARRY_MAX) {
      b = CARRY_MAX;
      clamped = true;
    }
    const r = runOf(slot, b);
    if (r === undefined) throw new Error(`no run of ${slot} with ${b} balls was measured`);
    if (!r.won || (n.fullClear && !r.fullClear)) return { complete: false, total, clamped };
    total += r.score;
    if (i < levels.length - 1) {
      balls = carry ? r.ballsLeft : DEFAULT_BALLS;
      if (balls < 1) return { complete: false, total, clamped };
    }
  }
  return { complete: true, total, clamped };
}

/** The chain passed: complete, and above the score where there is one. */
export function passes(o: ChainOutcome, n: Numbers): boolean {
  return o.complete && (n.score === null || o.total > n.score);
}

/**
 * The score to beat at which `share` of the chains pass: halfway between the totals of the k-th
 * and (k+1)-th best complete chains, k = round(share x chains), rounded to 1,000. Null when no
 * chain would pass (k = 0), or when fewer than k chains are complete, so no score is low enough.
 */
export function equalPassScore(outcomes: readonly ChainOutcome[], share: number): number | null {
  const k = Math.round(share * outcomes.length);
  const totals = outcomes
    .filter((o) => o.complete)
    .map((o) => o.total)
    .sort((a, b) => b - a);
  if (k === 0 || totals.length < k) return null;
  const above = totals[k - 1] ?? 0;
  const below = totals[k] ?? 0;
  return Math.round((above + below) / 2 / 1000) * 1000;
}
