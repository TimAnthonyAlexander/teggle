// Which sounds each audio bus event plays, and what it does to the Fever music: a pure table, so
// it can be tested without Web Audio. The sound board applies it.

import { styleShotPoints, type StyleShot } from '../../rules/style';
import type { FreeBallReason } from '../../rules/events';
import type { AudioEvent } from './bus';
import type { SoundId } from './sounds';

export interface Cue {
  readonly id: SoundId;
  /** The event's number for the sound (hit index, multiplier, points, letter count). */
  readonly n: number;
  /** Seconds after the event. */
  readonly delay: number;
}

export interface Route {
  readonly cues: readonly Cue[];
  /** Start the Fever music from the top, or fade it out. */
  readonly music: 'start' | 'stop' | null;
  /** The slow motion roll gives way (it lands on the hit). */
  readonly endRoll: boolean;
}

function cue(id: SoundId, n = 0, delay = 0): Cue {
  return { id, n, delay };
}

function only(...cues: Cue[]): Route {
  return { cues, music: null, endRoll: false };
}

/**
 * The style stinger for a shot, by its points (spec 5 and 14.2); a power shot the tables do not
 * list gets the 25,000 one.
 */
export function stingerFor(shot: StyleShot): SoundId {
  const points = styleShotPoints(shot) ?? 25_000;
  if (points >= 100_000) return 'style.huge';
  if (points >= 50_000) return 'style.big';
  if (points >= 25_000) return 'style.medium';
  return 'style.small';
}

/** The free ball jingle: one per threshold (25,000, 75,000, 125,000), the coin, the bucket. */
export function freeBallSound(reason: FreeBallReason, stage: number): SoundId {
  if (reason === 'threshold') return stage >= 3 ? 'free.t3' : stage === 2 ? 'free.t2' : 'free.t1';
  if (reason === 'coinFlip') return 'free.coin';
  return 'free.bucket';
}

/** What event `e` plays; `letter` counts the Fever title's letters so far (they alternate sides). */
export function routeEvent(e: AudioEvent, letter: number): Route {
  switch (e.type) {
    case 'cannonFire':
      // A new shot (or the first of a new attempt after a win) ends the Fever music.
      return { cues: [cue('cannon')], music: 'stop', endRoll: false };
    case 'pegHit':
      return only(cue(`hit.${e.color}`, e.index));
    case 'pegPop':
      return only(cue('pop', e.index));
    case 'powerGranted':
      return only(cue('powerUp'), cue(`power.${e.power}`, 0, 0.12));
    case 'powerMoment':
      return only(cue(`moment.${e.moment}`));
    case 'meterStep':
      return only(cue('meter', e.multiplier));
    case 'bucketCatch':
      return only(cue('bucket'));
    case 'freeBall':
      return only(cue(freeBallSound(e.reason, e.stage)));
    case 'coinSpin':
      return only(cue('coinSpin'));
    case 'coinResult':
      return only(cue(e.won ? 'coinWon' : 'coinLost'));
    case 'styleShot':
      return only(cue(stingerFor(e.shot)));
    case 'purpleMove':
      return only(cue('purple'));
    case 'lowBalls':
      return only(cue('low', e.balls));
    case 'slowMotion':
      return only(cue('roll'));
    case 'feverStart':
      return {
        cues: [cue('cymbal'), cue('gong'), cue('feverBoom', e.fullClear ? 1 : 0)],
        music: 'start',
        endRoll: true,
      };
    case 'feverLetter':
      return only(cue('letter', letter));
    case 'feverBucket':
      return only(cue('feverBucket', e.points));
    case 'fireworks':
      return only(cue('fireworks'));
    case 'rainbow':
      return only(cue('rainbow'));
    case 'countTick':
      return only(cue('tick'));
    case 'levelWon':
      return only(cue(e.fullClear ? 'applauseFull' : 'applause'));
    case 'levelLost':
      return only(cue('lost'));
    case 'dialogMove':
      return only(cue('dialog'));
    case 'uiClick':
      return only(cue('click'));
    case 'uiHover':
      return only(cue('hover'));
  }
}
