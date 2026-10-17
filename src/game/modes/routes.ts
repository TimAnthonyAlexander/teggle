// Routes of Adventure and Quick Play (the challenges' are in challenges.ts). Every route reads
// the saved progress, so a reload lands where the player was.
//
// Adventure
//   #/adventure                 the current stage's intro card (or where the campaign stands)
//   #/adventure/play[?master=]  the current campaign level; a Master level needs a master
//   #/adventure/next            after a win: the stage complete moment, else the next level
//   #/adventure/pick            the master picker for a Master level (stage 11)
// Quick Play
//   #/quickplay[?stage=]        the level select, one page per stage
//   #/quickplay/<id>            the master picker for a cleared level (skipped with one master)
//   #/quickplay/<id>/play?master=  plays it

import { LEVELS_PER_STAGE, type CampaignManifest } from '../../level/campaign';
import { AttemptSetupError } from '../../rules/colors';
import { isPowerId, type PowerId } from '../../rules/powers';
import type { Route } from '../app/router';
import type { Screen } from '../app/screens';
import { StageIntroScreen } from '../menus/intro';
import { MasterPickerScreen } from '../menus/picker';
import { LevelSelectScreen } from '../menus/quickplay';
import { StageCompleteScreen } from '../menus/stage-complete';
import type { PlayHost } from '../play/host';
import { LevelLoadError, loadLevel } from '../play/load';
import { backdropFor } from '../play/route';
import {
  campaignFinished,
  campaignTotal,
  isCleared,
  isMasterUnlocked,
  levelRecord,
  recordPick,
  stageOfNumber,
  unlockedMasters,
  type Progress,
} from '../progress/save';
import { progressStore } from '../progress/store';
import { MessageScreen } from '../screens/message';
import { PlayScreen } from '../screens/play';
import { formatNumber } from '../ui/text';
import { campaignHost, quickPlayHost } from './hosts';
import {
  findByNumber,
  findLevel,
  findStage,
  loadManifest,
  manifestLevels,
  type ManifestLevel,
} from './manifest';

/** Runs `then` with the manifest, or shows why it could not be loaded. */
export async function withManifest(
  title: string,
  then: (m: CampaignManifest) => Screen | Promise<Screen>,
): Promise<Screen> {
  let manifest: CampaignManifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new MessageScreen(title, message, 'Main Menu', '#/');
  }
  return then(manifest);
}

/** Loads a manifest level and plays it with `host`; a level that cannot be played says why. */
export async function playLevel(
  entry: ManifestLevel,
  host: PlayHost,
  back: string,
): Promise<Screen> {
  try {
    const loaded = await loadLevel(entry.level.file, import.meta.env.BASE_URL);
    const first = PlayScreen.firstAttempt(loaded, host);
    return new PlayScreen(loaded, await backdropFor(loaded.level.background), host, first);
  } catch (err) {
    if (err instanceof LevelLoadError || err instanceof AttemptSetupError) {
      return new MessageScreen('Level Not Playable', err.message, 'Back', back);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Adventure

/** Where the campaign stands when it has no level to play: finished, or ahead of the manifest. */
function campaignEnd(m: CampaignManifest, p: Progress): Screen {
  if (campaignFinished(p)) {
    return new MessageScreen(
      'Adventure Complete',
      `You cleared every stage of the Adventure with a total score of ${formatNumber(campaignTotal(p))}. Every level is in Quick Play, with any master you like.`,
      'Main Menu',
      '#/',
    );
  }
  const cleared = manifestLevels(m).filter(
    (l) => levelRecord(p, l.level.id).campaignScore !== null,
  );
  return new MessageScreen(
    'Adventure',
    `You have cleared all ${cleared.length} levels in the game so far. Stage ${stageOfNumber(p.campaign.next)}'s levels are not in the game yet. Quick Play replays the ones you have cleared.`,
    'Main Menu',
    '#/',
  );
}

function intro(m: CampaignManifest, p: Progress): Screen {
  const entry = findByNumber(m, p.campaign.next);
  if (campaignFinished(p) || entry === null) return campaignEnd(m, p);
  const stage = entry.stage.stage;
  const all = manifestLevels(m);
  return new StageIntroScreen({
    stage,
    world: entry.stage.world,
    levels: all.length,
    cleared: all.filter((l) => levelRecord(p, l.level.id).campaignScore !== null).length,
    progress: p,
    next: entry.stage.master === null ? '#/adventure/pick' : '#/adventure/play',
  });
}

function masterPick(entry: ManifestLevel, p: Progress): Screen {
  const unlocked = unlockedMasters(p);
  return new MasterPickerScreen({
    context: `Master level ${entry.level.id}: ${entry.level.name}`,
    unlocked,
    initial: p.campaign.pick ?? unlocked[unlocked.length - 1] ?? 'guide',
    play: (power) => `#/adventure/play?master=${power}`,
    onPick: (power) => {
      progressStore().update((q) => recordPick(q, power));
    },
    back: '#/',
  });
}

function playCurrent(m: CampaignManifest, asked: string | undefined): Screen | Promise<Screen> {
  const store = progressStore();
  const p = store.progress;
  const entry = findByNumber(m, p.campaign.next);
  if (campaignFinished(p) || entry === null) return campaignEnd(m, p);
  let power: PowerId | null = entry.stage.master;
  if (power === null) {
    // A Master level plays with the master picked for it.
    if (asked === undefined || !isPowerId(asked) || !isMasterUnlocked(p, asked)) {
      return masterPick(entry, p);
    }
    power = asked;
  }
  return playLevel(entry, campaignHost(store, entry, power), '#/');
}

export function adventureRoute(route: Route): Promise<Screen> {
  const sub = route.segments[1];
  return withManifest('Adventure', (m) => {
    const p = progressStore().progress;
    switch (sub) {
      case 'play':
        return playCurrent(m, route.params.get('master'));
      case 'pick': {
        const entry = findByNumber(m, p.campaign.next);
        return entry === null || campaignFinished(p) ? campaignEnd(m, p) : masterPick(entry, p);
      }
      case 'next': {
        // A win that finished a stage shows the stage's moment first.
        const n = p.campaign.next;
        if (n > 1 && (n - 1) % LEVELS_PER_STAGE === 0) {
          const stage = findStage(m, stageOfNumber(n - 1));
          if (stage !== null) {
            const nextBuilt = !campaignFinished(p) && findByNumber(m, n) !== null;
            return new StageCompleteScreen(stage, p, nextBuilt);
          }
        }
        return playCurrent(m, undefined);
      }
      default:
        return intro(m, p);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Quick Play

/** The level's own master, else the last Master level pick, else the newest master met. */
function defaultMaster(entry: ManifestLevel, p: Progress): PowerId {
  const unlocked = unlockedMasters(p);
  for (const power of [entry.stage.master, p.campaign.pick]) {
    if (power !== null && unlocked.includes(power)) return power;
  }
  return unlocked[unlocked.length - 1] ?? 'guide';
}

function defaultPage(m: CampaignManifest, p: Progress, asked: string | undefined): number {
  const n = Number(asked);
  if (Number.isInteger(n) && findStage(m, n) !== null) return n;
  const stage = stageOfNumber(Math.max(1, p.campaign.next - 1));
  const last = m.stages[m.stages.length - 1]?.stage ?? 1;
  return Math.min(stage, last);
}

export function quickPlayRoute(route: Route): Promise<Screen> {
  const [, id, sub] = route.segments;
  return withManifest('Quick Play', (m) => {
    const store = progressStore();
    const p = store.progress;
    if (id === undefined)
      return new LevelSelectScreen(m, defaultPage(m, p, route.params.get('stage')));
    const entry = findLevel(m, id);
    if (entry === null || !isCleared(p, id)) {
      return new LevelSelectScreen(m, entry?.stage.stage ?? defaultPage(m, p, undefined));
    }
    const back = `#/quickplay?stage=${entry.stage.stage}`;
    const fallback = defaultMaster(entry, p);
    if (sub === 'play') {
      const asked = route.params.get('master') ?? '';
      const power = isPowerId(asked) && isMasterUnlocked(p, asked) ? asked : fallback;
      return playLevel(entry, quickPlayHost(store, entry, power), back);
    }
    const unlocked = unlockedMasters(p);
    if (unlocked.length <= 1) return playLevel(entry, quickPlayHost(store, entry, fallback), back);
    return new MasterPickerScreen({
      context: `Quick Play: ${entry.level.id} ${entry.level.name}`,
      unlocked,
      initial: fallback,
      play: (power) => `#/quickplay/${id}/play?master=${power}`,
      back,
    });
  });
}
