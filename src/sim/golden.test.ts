import { describe, expect, it } from 'vitest';
import { engineDigest, scenarioDigests } from '../../tests/fixtures/golden';

// Golden digests of complete shots (tests/fixtures/golden.ts): every event and every ball state
// of every tick. They pin the simulation's bits. A change here means replays and generated
// levels' reachability results change too, so update the values only for a deliberate physics
// change, and run `npm run test:engines` afterward. The same values come out of V8 (Node) and
// JavaScriptCore (Bun).
const GOLDEN: Record<string, string> = {
  plinko: '4fcb08759f9c0327',
  mixed: '9a25c16a5e19d6cc',
  bench: '3eae3e5d1e95272b',
  multiball: '3d1dc680db1df5ae',
  powers: '9de2f71599c66dac',
};

describe('golden shots', () => {
  const digests = scenarioDigests();

  it.each(Object.keys(GOLDEN))('scenario %s keeps its bits', (name) => {
    expect(digests[name]).toBe(GOLDEN[name]);
  });

  it('combines into the cross-engine digest', () => {
    expect(engineDigest()).toBe('017fef8878343753');
  });
});
