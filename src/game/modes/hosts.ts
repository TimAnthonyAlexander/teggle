// The play screen's hosts for Adventure and Quick Play: attempt configs from the rules
// (campaignConfig for the campaign, the Quick Play defaults otherwise, the original's own orange
// rule for its levels), the score windows the HUD shows, and the progress each attempt writes.

import type { OriginalEntry } from '../../level/original';
import type { AttemptView } from '../../rules/attempt';
import { attemptConfig, campaignConfig } from '../../rules/config';
import { masterOfPower } from '../../rules/masters';
import type { PowerId } from '../../rules/powers';
import { ORIGINAL_ORANGE_COUNT } from '../../rules/tuning';
import { randomSeed, type PlayHost } from '../play/host';
import type { ScoreBreakdown } from '../play/summary';
import type { ProgressStore } from '../progress/store';
import {
  campaignTotal,
  isCleared,
  levelRecord,
  localDate,
  originalRecord,
  recordAttemptStart,
  recordOriginalStart,
  recordOriginalWin,
  recordWin,
} from '../progress/save';
import type { ManifestLevel } from './manifest';

function recordEnd(
  store: ProgressStore,
  entry: ManifestLevel,
  campaignNumber: number | null,
  power: PowerId,
  attempt: AttemptView,
  result: ScoreBreakdown,
): void {
  if (attempt.result !== 'won') return;
  store.update((p) =>
    recordWin(p, {
      levelId: entry.level.id,
      campaignNumber,
      score: attempt.score,
      fullClear: result.fullClear,
      master: power,
      date: localDate(new Date()),
    }),
  );
}

/**
 * Adventure: the campaign level the save says is next, its stage master's power (or the one
 * picked for a Master level), the save's try number, designer greens until the level is first
 * cleared, and the campaign's total score in the right window.
 */
export function campaignHost(store: ProgressStore, entry: ManifestLevel, power: PowerId): PlayHost {
  const number = entry.level.number;
  const id = entry.level.id;
  const totalBase = campaignTotal(store.progress);
  return {
    theme: masterOfPower(power).theme,
    power,
    left: { line1: 'Stage', line2: id },
    right: { line1: 'Total', line2: 'Score' },
    plan: (screenTry) => {
      const p = store.progress;
      const current = p.campaign.next === number;
      return {
        seed: randomSeed(),
        config: campaignConfig({
          level: number,
          try: current ? p.campaign.try : screenTry,
          firstPlay: !isCleared(p, id),
          power,
        }),
      };
    },
    rightValue: (live) => totalBase + live,
    totalAfter: (score) => totalBase + score,
    attemptStarted: () => {
      store.update((p) => recordAttemptStart(p, { levelId: id, campaignNumber: number }));
    },
    attemptEnded: (attempt, result) => {
      recordEnd(store, entry, number, power, attempt, result);
    },
    next: { label: 'Continue', hash: '#/adventure/next' },
    quit: { label: 'Main Menu', hash: '#/' },
  };
}

/**
 * Quick Play (spec 8): any cleared level with the chosen master, green pegs always random, no
 * clear bonus; the right window shows the level's best score.
 */
export function quickPlayHost(
  store: ProgressStore,
  entry: ManifestLevel,
  power: PowerId,
): PlayHost {
  const id = entry.level.id;
  const back = `#/quickplay?stage=${entry.stage.stage}`;
  return {
    theme: masterOfPower(power).theme,
    power,
    left: { line1: 'Level', line2: 'Score' },
    right: { line1: 'Best', line2: 'Score' },
    plan: () => ({ seed: randomSeed(), config: attemptConfig({ power }) }),
    rightValue: (live, best) => Math.max(live, best, levelRecord(store.progress, id).best),
    totalAfter: () => null,
    attemptStarted: () => {
      store.update((p) => recordAttemptStart(p, { levelId: id, campaignNumber: null }));
    },
    attemptEnded: (attempt, result) => {
      recordEnd(store, entry, null, power, attempt, result);
    },
    next: { label: 'Continue', hash: back },
    quit: { label: 'Level Select', hash: back },
  };
}

/**
 * Quick Play's Original section: one of the original game's levels with the chosen master and
 * the original's own rule of 25 orange pegs drawn uniformly (spec 14.1), otherwise Quick Play's
 * defaults; its records are kept apart from Teggle's levels.
 */
export function originalHost(store: ProgressStore, entry: OriginalEntry, power: PowerId): PlayHost {
  const id = entry.id;
  const back = `#/quickplay/original?stage=${entry.stage}`;
  return {
    theme: masterOfPower(power).theme,
    power,
    left: { line1: 'Level', line2: 'Score' },
    right: { line1: 'Best', line2: 'Score' },
    plan: () => ({
      seed: randomSeed(),
      config: attemptConfig({
        power,
        orangeCount: ORIGINAL_ORANGE_COUNT,
        orangeDraw: 'uniform',
      }),
    }),
    rightValue: (live, best) => Math.max(live, best, originalRecord(store.progress, id).best),
    totalAfter: () => null,
    attemptStarted: () => {
      store.update((p) => recordOriginalStart(p, id));
    },
    attemptEnded: (attempt, result) => {
      if (attempt.result !== 'won') return;
      store.update((p) =>
        recordOriginalWin(p, {
          levelId: id,
          score: attempt.score,
          fullClear: result.fullClear,
          master: power,
          date: localDate(new Date()),
        }),
      );
    },
    next: { label: 'Continue', hash: back },
    quit: { label: 'Level Select', hash: back },
  };
}
