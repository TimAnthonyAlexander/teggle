// Audio event bus. The play screen fires these from rules events and from its own presentation
// (pops, the coin, the Fever show, UI clicks); the audio layer subscribes and plays sounds. No
// sound plays yet: until the audio wave plugs in, nothing listens. Events are plain objects with a
// `type`; the sound names in comments are the original's roles (visual guide 14), not files.

import type { PegColor } from '../../rules/scoring';
import type { FreeBallReason } from '../../rules/events';
import type { StyleShot } from '../../rules/style';

export type AudioEvent =
  /** The cannon fired (cannon shot). */
  | { readonly type: 'cannonFire' }
  /** A peg or brick lit. `index` is its 0-based place in the shot: the pitch rises with it. */
  | { readonly type: 'pegHit'; readonly index: number; readonly color: PegColor }
  /** A lit peg popped after the shot; `index` counts the pops of this shot from 0. */
  | { readonly type: 'pegPop'; readonly index: number; readonly color: PegColor }
  /** The fever meter reached a new multiplier. */
  | { readonly type: 'meterStep'; readonly multiplier: number }
  /** The ball landed in the free ball bucket. */
  | { readonly type: 'bucketCatch' }
  /** A free ball joined the stock (threshold balls carry the threshold, 1 to 3). */
  | { readonly type: 'freeBall'; readonly reason: FreeBallReason; readonly stage: number }
  /** A zero-hit shot: the coin starts to spin, then shows its face. */
  | { readonly type: 'coinSpin' }
  | { readonly type: 'coinResult'; readonly won: boolean }
  | { readonly type: 'styleShot'; readonly shot: StyleShot }
  /** The purple peg moved to another peg. */
  | { readonly type: 'purpleMove' }
  /** "3 BALLS LEFT", "2 BALLS LEFT", "LAST BALL!". */
  | { readonly type: 'lowBalls'; readonly balls: number }
  /** Slow motion began as the ball closes in on the last orange peg (timpani roll). */
  | { readonly type: 'slowMotion' }
  /** The last orange peg lit (cymbal, gong, music). */
  | { readonly type: 'feverStart'; readonly fullClear: boolean }
  /** One letter of the Fever title flew in or out (whoosh). */
  | { readonly type: 'feverLetter' }
  /** A ball landed in a Fever bucket (0 = leftmost). */
  | { readonly type: 'feverBucket'; readonly bucket: number; readonly points: number }
  | { readonly type: 'fireworks' }
  | { readonly type: 'rainbow' }
  /** A counting number moved on (score counter tick). */
  | { readonly type: 'countTick' }
  | { readonly type: 'levelWon'; readonly fullClear: boolean }
  | { readonly type: 'levelLost' }
  /** A dialog dropped in or left (dialog move). */
  | { readonly type: 'dialogMove' }
  | { readonly type: 'uiClick' }
  | { readonly type: 'uiHover' };

export type AudioEventType = AudioEvent['type'];
export type AudioListener = (event: AudioEvent) => void;

export class AudioBus {
  private readonly listeners: AudioListener[] = [];

  /** Subscribes; returns the function that unsubscribes. */
  on(listener: AudioListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  emit(event: AudioEvent): void {
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i]?.(event);
  }
}

/** The app's one bus. */
export const audioBus = new AudioBus();
