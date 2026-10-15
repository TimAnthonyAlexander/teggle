import { describe, expect, it } from 'vitest';
import { plinkoLevel } from '../../tests/fixtures/levels';
import { Rng } from '../core/rng';
import { Attempt } from '../rules/attempt';
import { attemptConfig } from '../rules/config';
import { BASE_POWERS } from '../rules/powers';
import { aimDirection } from '../sim/aim';
import { compileLevel } from '../sim/compile';
import { World } from '../sim/world';
import { Agent, agentLabel, agentSpec, type AgentSpec } from './agent';
import { flipperPolicy } from './flippers';
import { flaggedIds, playRun, playRuns, type RunSetup } from './run';
import { agentSeed, attemptSeed } from './seeds';
import { AIM_LIMIT, FLIPPER_ZONE_HEIGHT } from './tuning';

const level = compileLevel(plinkoLevel());
const SMALL = agentSpec('noisy', { noise: 0.02, angles: 6, searchTicks: 1200 });

function setup(agent: AgentSpec): RunSetup {
  return {
    level,
    levelKey: 'plinko',
    config: attemptConfig({ orangeCount: 10 }),
    anyMaster: false,
    agent,
    baseSeed: 3,
  };
}

function attempt(seed: number): Attempt {
  return new Attempt(
    level,
    { levelId: 'plinko', seed, config: attemptConfig({ orangeCount: 10 }) },
    { powers: BASE_POWERS, events: false },
  );
}

describe('agent specs', () => {
  it('fill in defaults and validate', () => {
    expect(agentSpec('greedy').noise).toBe(0);
    expect(agentSpec('noisy', { noise: 0.05 }).noise).toBe(0.05);
    expect(agentLabel(agentSpec('noisy', { noise: 0.05 }))).toBe('noisy 0.05');
    expect(agentLabel(agentSpec('random'))).toBe('random');
    expect(() => agentSpec('greedy', { angles: 0 })).toThrow();
    expect(() => agentSpec('noisy', { noise: -1 })).toThrow();
  });
});

describe('self-play runs', () => {
  it('give the same choices and results for the same seed', () => {
    expect(playRun(setup(SMALL), 2)).toEqual(playRun(setup(SMALL), 2));
  });

  it('do not depend on how the runs are split between workers', () => {
    const s = setup(SMALL);
    const whole = playRuns(s, 0, 5);
    const split = [...playRuns(s, 0, 2), ...playRuns(s, 2, 1), ...playRuns(s, 3, 2)];
    const single = [4, 3, 2, 1, 0].map((i) => playRun(s, i)).reverse();
    expect(split).toEqual(whole);
    expect(single).toEqual(whole);
    expect(new Set(whole.map((r) => r.seed)).size).toBe(5);
  });

  it('face the same colors whatever the agent', () => {
    const random = playRun(setup(agentSpec('random')), 4);
    const noisy = playRun(setup(SMALL), 4);
    expect(random.seed).toBe(noisy.seed);
    expect(random.seed).toBe(attemptSeed(3, 'plinko', 4));
  });

  it('play to the end and account for every orange peg', () => {
    const r = playRun(setup(SMALL), 1);
    expect(r.shots).toBe(r.orangePerShot.length);
    expect(r.orangeStart - r.orangePerShot.reduce((a, b) => a + b, 0)).toBe(r.orangeLeft);
    expect(r.won).toBe(r.orangeLeft === 0);
    expect(r.searchTicks).toBeGreaterThan(0);
    const flagged = new Set(flaggedIds(level));
    for (const id of r.litFlagged) expect(flagged.has(id)).toBe(true);
  });

  it('draw one of the ten masters per run when the player picks', () => {
    const s = { ...setup(agentSpec('random')), anyMaster: true };
    const powers = new Set(playRuns(s, 0, 12).map((r) => r.power));
    expect(powers.size).toBeGreaterThan(3);
    expect(powers.has(null)).toBe(false);
  });
});

describe('agent choices', () => {
  it('random aims stay in the cannon range', () => {
    const agent = new Agent(agentSpec('random'), Rng.fromSeed(1));
    const a = attempt(1);
    for (let i = 0; i < 500; i++) {
      const angle = agent.chooseAngle(a);
      expect(angle).toBeGreaterThanOrEqual(-AIM_LIMIT);
      expect(angle).toBeLessThan(AIM_LIMIT);
    }
  });

  it('noisy aims are clamped to the cannon range', () => {
    const agent = new Agent(
      agentSpec('noisy', { noise: 1, angles: 2, searchTicks: 50 }),
      Rng.fromSeed(2),
    );
    const a = attempt(2);
    for (let i = 0; i < 40; i++)
      expect(Math.abs(agent.chooseAngle(a))).toBeLessThanOrEqual(AIM_LIMIT);
  });

  it('greedy takes the candidate that lights the most orange pegs', () => {
    const spec = agentSpec('greedy', { angles: 9, searchTicks: 3000 });
    const a = attempt(5);
    const jitter = Rng.fromSeed(11).nextFloat();
    let best = 0;
    const lit = new Map<number, number>();
    for (let i = 0; i < 9; i++) {
      const angle = -AIM_LIMIT + (2 * AIM_LIMIT * (i + jitter)) / 9;
      const t = a.trialClone();
      t.launch(aimDirection(angle));
      for (let k = 0; k < 3000 && t.phase === 'shot'; k++) t.step();
      const orange = a.orangeLeft - t.orangeLeft;
      lit.set(angle, orange);
      best = Math.max(best, orange);
    }
    const chosen = new Agent(spec, Rng.fromSeed(11)).chooseAngle(a);
    expect(lit.get(chosen)).toBe(best);
    expect(best).toBeGreaterThan(0);
  });

  it('a reused agent chooses as a fresh one would', () => {
    const spec = agentSpec('greedy', { angles: 5, searchTicks: 800 });
    const reused = new Agent(spec, Rng.fromSeed(21));
    reused.chooseAngle(attempt(8));
    const rng = Rng.fromSeed(21);
    rng.nextFloat();
    const fresh = new Agent(spec, rng);
    expect(reused.chooseAngle(attempt(9))).toBe(fresh.chooseAngle(attempt(9)));
  });

  it('leave the attempt it searches untouched', () => {
    const a = attempt(6);
    const before = a.record();
    const tick = a.world.tick;
    new Agent(SMALL, Rng.fromSeed(agentSeed(6))).chooseAngle(a);
    expect(a.record()).toEqual(before);
    expect(a.world.tick).toBe(tick);
    expect(a.phase).toBe('aim');
  });
});

describe('flipper policy', () => {
  const bottom = level.height - FLIPPER_ZONE_HEIGHT / 2;

  function worldWithBall(x: number, vy: number, flippers = true): World {
    const w = new World(level);
    w.setFlippers(flippers);
    w.spawnBall({ x, y: bottom, vx: 0, vy });
    return w;
  }

  it('holds the button while a ball falls toward either flipper', () => {
    expect(flipperPolicy(worldWithBall(40, 2))).toBe(true);
    expect(flipperPolicy(worldWithBall(level.width - 40, 2))).toBe(true);
  });

  it('releases it for a rising ball, a ball in the middle, or no flippers', () => {
    expect(flipperPolicy(worldWithBall(40, -2))).toBe(false);
    expect(flipperPolicy(worldWithBall(level.width / 2, 2))).toBe(false);
    expect(flipperPolicy(worldWithBall(40, 2, false))).toBe(false);
    expect(flipperPolicy(new World(level))).toBe(false);
  });
});
