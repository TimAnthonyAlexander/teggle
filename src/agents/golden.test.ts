import { describe, expect, it } from 'vitest';
import { agentScenarioRuns, agentsDigest, runDigest } from '../../tests/fixtures/agents-golden';

// Golden self-play runs (tests/fixtures/agents-golden.ts). Update them only for a deliberate
// change to the agents, the rules or the physics, and run `npm run test:engines` afterward: V8
// (Node) and JavaScriptCore (Bun) give the same values.
const GOLDEN: Record<string, string> = {
  noisyFlippers: '62ec192609cb5f6c',
  greedySpaceBlast: '9358a08d6cf694f6',
  randomMultiball: '53d8e4e27ab17b98',
};

describe('golden self-play runs', () => {
  const runs = agentScenarioRuns();

  it.each(Object.keys(GOLDEN))('run %s keeps its bits and triggers its power', (name) => {
    const run = runs[name];
    expect(run === undefined ? undefined : runDigest(run)).toBe(GOLDEN[name]);
    expect(run?.greens).toBeGreaterThanOrEqual(1);
  });

  it('combines into the cross-engine digest', () => {
    expect(agentsDigest()).toBe('9ea5ba7a2424c907');
  });
});
