import { describe, expect, it } from 'vitest';
import type { AudioEvent, PowerId, PowerMoment } from './bus';
import { freeBallSound, routeEvent, stingerFor } from './routing';
import { SOUNDS } from './sounds';

const POWERS: PowerId[] = [
  'guide',
  'multiball',
  'pyramid',
  'spaceBlast',
  'flippers',
  'spookyBall',
  'flowerPower',
  'luckySpin',
  'fireball',
  'zenBall',
];

const MOMENTS: PowerMoment[] = [
  'multiballSpawn',
  'bucketChange',
  'spaceBlast',
  'flowerPower',
  'flipperUp',
  'flipperDown',
  'spookyReturn',
  'spinStart',
  'spinTick',
  'spinResult',
  'fireballLaunch',
  'fireballBurn',
  'zenShot',
  'powerEnd',
];

/** One of every event on the bus. */
const EVERY_EVENT: AudioEvent[] = [
  { type: 'cannonFire' },
  ...POWERS.map((power): AudioEvent => ({ type: 'powerGranted', power })),
  ...MOMENTS.map((moment): AudioEvent => ({ type: 'powerMoment', power: 'luckySpin', moment })),
  { type: 'pegHit', index: 3, color: 'orange' },
  { type: 'pegPop', index: 2, color: 'blue' },
  { type: 'meterStep', multiplier: 3 },
  { type: 'bucketCatch' },
  { type: 'freeBall', reason: 'threshold', stage: 2 },
  { type: 'coinSpin' },
  { type: 'coinResult', won: true },
  { type: 'styleShot', shot: 'longShot' },
  { type: 'purpleMove' },
  { type: 'lowBalls', balls: 1 },
  { type: 'slowMotion' },
  { type: 'feverStart', fullClear: false },
  { type: 'feverLetter' },
  { type: 'feverBucket', bucket: 2, points: 100_000 },
  { type: 'fireworks' },
  { type: 'rainbow' },
  { type: 'countTick' },
  { type: 'levelWon', fullClear: true },
  { type: 'levelLost' },
  { type: 'dialogMove' },
  { type: 'uiClick' },
  { type: 'uiHover' },
];

describe('routeEvent', () => {
  it('gives every event at least one existing sound', () => {
    for (const e of EVERY_EVENT) {
      const r = routeEvent(e, 0);
      expect(r.cues.length, e.type).toBeGreaterThan(0);
      for (const c of r.cues) expect(SOUNDS[c.id], c.id).toBeDefined();
    }
  });

  it('gives every power and every power moment its own sound', () => {
    const powers = new Set(
      POWERS.map((power) => routeEvent({ type: 'powerGranted', power }, 0).cues[1]?.id),
    );
    expect(powers.size).toBe(POWERS.length);
    const moments = new Set(
      MOMENTS.map(
        (moment) => routeEvent({ type: 'powerMoment', power: 'guide', moment }, 0).cues[0]?.id,
      ),
    );
    expect(moments.size).toBe(MOMENTS.length);
  });

  it('passes the hit index and color through', () => {
    expect(routeEvent({ type: 'pegHit', index: 7, color: 'purple' }, 0).cues).toEqual([
      { id: 'hit.purple', n: 7, delay: 0 },
    ]);
  });

  it('starts the music on the Fever hit and ends the roll there', () => {
    const r = routeEvent({ type: 'feverStart', fullClear: true }, 0);
    expect(r.music).toBe('start');
    expect(r.endRoll).toBe(true);
    expect(r.cues.map((c) => c.id)).toEqual(['cymbal', 'gong', 'feverBoom']);
    expect(r.cues[2]?.n).toBe(1);
  });

  it('fades the music at the next shot and nowhere else', () => {
    for (const e of EVERY_EVENT) {
      const r = routeEvent(e, 0);
      if (e.type === 'cannonFire') expect(r.music).toBe('stop');
      else if (e.type !== 'feverStart') expect(r.music).toBeNull();
    }
  });

  it('numbers the title letters so they alternate sides', () => {
    expect(routeEvent({ type: 'feverLetter' }, 4).cues[0]?.n).toBe(4);
  });
});

describe('stingerFor', () => {
  it('scales with the style points', () => {
    expect(stingerFor('bucketBounce')).toBe('style.small');
    expect(stingerFor('longShot')).toBe('style.medium');
    expect(stingerFor('superLongShot')).toBe('style.big');
    expect(stingerFor('bigBucketStreak')).toBe('style.huge');
    expect(stingerFor('power:flippers:Flipper Trick')).toBe('style.medium');
  });
});

describe('freeBallSound', () => {
  it('has a jingle per threshold and one each for the bucket and the coin', () => {
    expect(freeBallSound('threshold', 1)).toBe('free.t1');
    expect(freeBallSound('threshold', 2)).toBe('free.t2');
    expect(freeBallSound('threshold', 3)).toBe('free.t3');
    expect(freeBallSound('bucket', 1)).toBe('free.bucket');
    expect(freeBallSound('power', 1)).toBe('free.bucket');
    expect(freeBallSound('coinFlip', 1)).toBe('free.coin');
  });
});
