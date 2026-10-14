import { describe, expect, it } from 'vitest';
import { aimDirection } from '../sim/aim';
import { compileLevel } from '../sim/compile';
import { plinkoLevel } from '../../tests/fixtures/levels';
import { DOWN, TEST_POWERS } from '../../tests/fixtures/rules';
import { attemptConfig } from './config';
import { replayAttempt } from './record';
import { playAttempt, playShot, type ShotChoice } from './runner';

const level = compileLevel(plinkoLevel());
const init = { levelId: 'plinko', seed: 4, config: attemptConfig() };

describe('headless runner', () => {
  it('plays a list of shots without collecting events, and the record replays it', () => {
    const shots: ShotChoice[] = Array.from({ length: 30 }, (_, k) => ({
      direction: aimDirection(-1.5 + 0.1 * k),
      wait: (k * 37) % 50,
    }));
    const a = playAttempt(level, init, shots);
    expect(a.phase).toBe('over');
    expect(a.events).toEqual([]);
    expect(a.shotsTaken).toBeLessThanOrEqual(30);
    const record = a.record();
    expect(record.shots.map((s) => s.direction)).toEqual(
      shots.slice(0, a.shotsTaken).map((s) => s.direction),
    );
    const replayed = replayAttempt(level, record);
    expect(replayed.score).toBe(a.score);
    expect(replayed.result).toBe(a.result);
  });

  it('asks a callback for each shot and stops when it returns null', () => {
    const seen: number[] = [];
    const a = playAttempt(level, init, (attempt) => {
      seen.push(attempt.ballsLeft);
      return attempt.shotsTaken < 3 ? { direction: DOWN } : null;
    });
    expect(a.shotsTaken).toBe(3);
    expect(a.phase).toBe('aim');
    expect(seen[0]).toBe(10);
    expect(seen).toHaveLength(4);
  });

  it('collects events on request and drives the flipper button per tick', () => {
    const config = attemptConfig({ power: 'testFlippers' });
    const a = playAttempt(
      level,
      { ...init, config },
      (attempt) => ({
        direction: aimDirection(0.37 * attempt.shotsTaken - 1.2),
        flipper: (x) => (x.world.balls[0]?.y ?? 0) > level.height - 95,
      }),
      { powers: TEST_POWERS, events: true },
    );
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.record().shots.some((s) => s.inputs.length > 0)).toBe(true);
    expect(replayAttempt(level, a.record(), { powers: TEST_POWERS }).score).toBe(a.score);
  });

  it('plays a single shot on an attempt it is given', () => {
    const a = playAttempt(level, init, []);
    playShot(a, { direction: DOWN, wait: 12 });
    expect(a.record().shots).toEqual([{ tick: 12, direction: DOWN, inputs: [] }]);
    expect(a.phase).toBe('aim');
  });
});
