import { describe, expect, it } from 'vitest';
import type { RulesEvent } from '../../rules/events';
import { FACE_MS, MasterFace } from './face';

const shotStart: RulesEvent = { type: 'shotStart', tick: 0, shot: 0, ballsLeft: 9, orangeLeft: 25 };

function peg(color: 'blue' | 'orange'): RulesEvent {
  return {
    type: 'pegScored',
    tick: 1,
    element: 0,
    color,
    value: 10,
    ball: 0,
    cause: 'contact',
    x: 0,
    y: 0,
    shotSum: 10,
    shotCount: 1,
    shotScore: 10,
    orangeLeft: 24,
  };
}

const tally: RulesEvent = {
  type: 'shotTally',
  tick: 2,
  shot: 0,
  sum: 0,
  count: 0,
  shotScore: 0,
  styleScore: 0,
  score: 0,
};

describe('MasterFace', () => {
  it('rests neutral', () => {
    expect(new MasterFace().at(0)).toBe('neutral');
  });

  it('shows the power face on a green hit, then returns to neutral', () => {
    const f = new MasterFace();
    f.handle({ type: 'greenHit', tick: 0, element: 1, ball: 0, x: 0, y: 0, power: 'guide' }, 1000);
    expect(f.at(1000)).toBe('power');
    expect(f.at(1000 + FACE_MS.power - 1)).toBe('power');
    expect(f.at(1000 + FACE_MS.power)).toBe('neutral');
  });

  it('is happy after a good shot or a free ball, sad after a miss', () => {
    const f = new MasterFace();
    f.handle(shotStart, 0);
    for (let i = 0; i < 3; i++) f.handle(peg('orange'), 10);
    f.handle(tally, 100);
    expect(f.at(100)).toBe('happy');

    f.handle(shotStart, 5000);
    f.handle(peg('blue'), 5010);
    f.handle(tally, 5100);
    expect(f.at(5100)).toBe('sad');

    f.handle(shotStart, 9000);
    f.handle({ type: 'freeBall', tick: 3, reason: 'bucket', threshold: 0, ballsLeft: 5 }, 9050);
    f.handle(tally, 9100);
    expect(f.at(9100)).toBe('happy');
  });

  it('holds the result face until reset', () => {
    const f = new MasterFace();
    f.handle({ type: 'levelLost', tick: 9, score: 0, orangeLeft: 3, shots: 10 }, 0);
    expect(f.at(1e9)).toBe('sad');
    f.handle(shotStart, 10);
    f.handle(tally, 20);
    expect(f.at(1e9)).toBe('sad');
    f.reset();
    expect(f.at(0)).toBe('neutral');
  });
});
