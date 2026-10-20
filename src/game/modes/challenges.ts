// Routes of the challenges (spec 8). Every route reads the saved progress; the run in play lives
// in memory (challenge-run.ts), so a reload lands on the list.
//
//   #/challenges[?group=<group id>][&open=<id>]  the challenge list on a group's page, with a
//                                             challenge's briefing card open
//                                             (DEV ONLY: &unlock=all counts every level as beaten)
//   #/challenges/<id>[?level=<slot>]           starts a challenge: the pick challenge's level
//                                             first, then the master picker (skipped with one)
//   #/challenges/<id>/level                   the level select of the challenge the player
//                                             picks a level for
//   #/challenges/<id>/play?master=[&level=]   a new run, from its first level
//   #/challenges/run/next                     the run's next level, after a win

import { Rng } from '../../core/rng';
import type { CampaignManifest } from '../../level/campaign';
import {
  challengeById,
  drawPool,
  isPick,
  namedSlots,
  resolveLevels,
  startRun,
  type ChallengeDef,
} from '../../rules/challenges';
import { masterOfStage } from '../../rules/masters';
import { isPowerId, type PowerId } from '../../rules/powers';
import type { Route } from '../app/router';
import type { Screen } from '../app/screens';
import { cardTitle } from '../menus/challenge-copy';
import { ChallengeListScreen } from '../menus/challenges';
import { stageName } from '../menus/copy';
import { MasterPickerScreen } from '../menus/picker';
import { campaignLevels, LevelSelectScreen, type LevelSelectMode } from '../menus/quickplay';
import { randomSeed } from '../play/host';
import { isMasterUnlocked, levelRecord, unlockedMasters, type Progress } from '../progress/save';
import { progressStore, type ProgressStore } from '../progress/store';
import { MessageScreen } from '../screens/message';
import { cardHash, challengeHost, listHash } from './challenge-host';
import {
  activeRun,
  applyDevUnlock,
  beatenSlots,
  builtSlots,
  challengeStatus,
  levelNamer,
  setActiveRun,
  stageOfSlot,
  type ActiveRun,
} from './challenge-run';
import { findLevel } from './manifest';
import { playLevel, withManifest } from './routes';

/** Where a new run of `def` with `power` (and the picked level) starts. */
function playHash(def: ChallengeDef, power: PowerId, pick: string | null): string {
  return `#/challenges/${def.id}/play?master=${power}${pick === null ? '' : `&level=${pick}`}`;
}

/**
 * The master a challenge offers first: the stage master of its (first or picked) level, else the
 * last Master level pick, else the newest master met.
 */
function defaultMaster(def: ChallengeDef, pick: string | null, p: Progress): PowerId {
  const unlocked = unlockedMasters(p);
  const slot = pick ?? namedSlots(def)[0];
  const own = slot === undefined ? null : (masterOfStage(stageOfSlot(slot))?.power ?? null);
  for (const power of [own, p.campaign.pick]) {
    if (power !== null && unlocked.includes(power)) return power;
  }
  return unlocked[unlocked.length - 1] ?? 'guide';
}

/** The level select for the challenge whose level the player picks: levels beaten so far. */
function pickLevel(m: CampaignManifest, def: ChallengeDef): Screen {
  const built = builtSlots(m);
  const mode: LevelSelectMode = {
    title: (stage) => `Choose a Level: ${stageName(stage)}`,
    choosable: (id, p) => beatenSlots(p, built).has(id),
    record: levelRecord,
    open: (id) => `#/challenges/${def.id}?level=${id}`,
    back: cardHash(def),
    hint: (coarse) =>
      coarse
        ? 'Tap a level you have beaten to see its best scores, and tap it again to take the challenge on it.'
        : 'Pick a level you have beaten to see its best scores. Click it to take the challenge on it.',
    random: false,
  };
  return new LevelSelectScreen(campaignLevels(m), m.stages[0]?.stage ?? 1, mode);
}

/** Plays the run's current level. */
function playRunLevel(
  m: CampaignManifest,
  store: ProgressStore,
  active: ActiveRun,
): Promise<Screen> | Screen {
  const slot = active.run.levels[active.run.index] ?? '';
  const entry = findLevel(m, slot);
  if (entry === null) {
    return new MessageScreen(
      'Challenge',
      `Level ${slot} is not in the game yet.`,
      'Challenges',
      listHash(active.def),
    );
  }
  return playLevel(entry, challengeHost(store, active, levelNamer(m)), listHash(active.def));
}

/** A new run: its levels drawn (random ones from the beaten levels it may draw), from the first. */
function beginRun(
  m: CampaignManifest,
  store: ProgressStore,
  def: ChallengeDef,
  power: PowerId,
  pick: string | null,
): Promise<Screen> | Screen {
  const built = builtSlots(m);
  const pool = drawPool(built, beatenSlots(store.progress, built));
  const levels = resolveLevels(def, pool, Rng.fromSeed(randomSeed()), pick);
  const active: ActiveRun = {
    def,
    power,
    pick,
    startHash: playHash(def, power, pick),
    run: startRun(def, levels),
    counted: false,
    recorded: false,
  };
  setActiveRun(store, active);
  return playRunLevel(m, store, active);
}

export function challengesRoute(route: Route): Promise<Screen> {
  applyDevUnlock(route);
  const [, id, sub] = route.segments;
  return withManifest('Challenges', (m) => {
    const store = progressStore();
    if (id === 'run') {
      const active = activeRun();
      if (active === null || active.run.status !== 'playing')
        return new ChallengeListScreen(m, null);
      return playRunLevel(m, store, active);
    }
    // Any other challenge route gives up a run still in play (its try already counted).
    setActiveRun(store, null);
    const p = store.progress;
    if (id === undefined) {
      return new ChallengeListScreen(
        m,
        route.params.get('group') ?? null,
        route.params.get('open') ?? null,
      );
    }
    const def = challengeById(id);
    if (def === null) return new ChallengeListScreen(m, null);
    const built = builtSlots(m);
    const beaten = beatenSlots(p, built);
    // A challenge that is hidden or locked shows its card on the list instead.
    if (!challengeStatus(built, beaten, def).playable) {
      return new ChallengeListScreen(m, def.group, def.id);
    }
    const asked = route.params.get('level');
    const pick = isPick(def) && asked !== undefined && beaten.has(asked) ? asked : null;
    if (isPick(def) && (pick === null || sub === 'level')) return pickLevel(m, def);
    const fallback = defaultMaster(def, pick, p);
    if (sub === 'play') {
      const master = route.params.get('master') ?? '';
      const power = isPowerId(master) && isMasterUnlocked(p, master) ? master : fallback;
      return beginRun(m, store, def, power, pick);
    }
    const unlocked = unlockedMasters(p);
    if (unlocked.length <= 1) return beginRun(m, store, def, fallback, pick);
    const name = levelNamer(m);
    return new MasterPickerScreen({
      context: `Challenge: ${cardTitle(def, name, pick)}`,
      unlocked,
      initial: fallback,
      play: (power) => playHash(def, power, pick),
      back: isPick(def) ? `#/challenges/${def.id}/level` : cardHash(def),
    });
  });
}
