// Golden self-play runs: whole attempts played by the agents (src/agents/), each digested from
// its run result (every choice shows in the shots, orange per shot, score and ticks). They cover
// the greedy search on trial copies, the aim error drawn with the deterministic log and cos, and
// the flipper policy. Node and Bun must agree on the combined digest (tools/engine-digest.ts),
// and it changes only on purpose (src/agents/golden.test.ts).

import { agentSpec, type AgentSpec } from '../../src/agents/agent';
import { playRun, type RunResult } from '../../src/agents/run';
import { Digest } from '../../src/core/digest';
import type { Level } from '../../src/level/schema';
import { attemptConfig } from '../../src/rules/config';
import type { PowerId } from '../../src/rules/powers';
import { compileLevel } from '../../src/sim/compile';
import { mixedLevel, plinkoLevel } from './levels';

interface AgentScenario {
  readonly name: string;
  readonly level: () => Level;
  readonly agent: AgentSpec;
  readonly power: PowerId;
  readonly orange: number;
}

/** Small searches keep the digest cheap; the code path is the full one. */
const SCENARIOS: readonly AgentScenario[] = [
  {
    name: 'noisyFlippers',
    level: plinkoLevel,
    agent: agentSpec('noisy', { noise: 0.03, angles: 6, searchTicks: 1500 }),
    power: 'flippers',
    orange: 12,
  },
  {
    name: 'greedySpaceBlast',
    level: mixedLevel,
    agent: agentSpec('greedy', { angles: 5, searchTicks: 1500 }),
    power: 'spaceBlast',
    orange: 10,
  },
  {
    name: 'randomMultiball',
    level: plinkoLevel,
    agent: agentSpec('random'),
    power: 'multiball',
    orange: 25,
  },
];

export function runDigest(r: RunResult): string {
  return new Digest().string(JSON.stringify(r)).hex();
}

export function agentScenarioRuns(): Record<string, RunResult> {
  const out: Record<string, RunResult> = {};
  for (const s of SCENARIOS) {
    out[s.name] = playRun(
      {
        level: compileLevel(s.level()),
        levelKey: s.name,
        config: attemptConfig({ power: s.power, orangeCount: s.orange }),
        anyMaster: false,
        agent: s.agent,
        baseSeed: 7,
      },
      0,
    );
  }
  return out;
}

/** One digest over every golden run. */
export function agentsDigest(): string {
  const d = new Digest();
  for (const [name, run] of Object.entries(agentScenarioRuns())) {
    d.string(name).string(runDigest(run));
  }
  return d.hex();
}
