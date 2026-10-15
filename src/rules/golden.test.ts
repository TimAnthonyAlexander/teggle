import { describe, expect, it } from 'vitest';
import { rulesDigest, rulesScenarioDigests } from '../../tests/fixtures/rules-golden';

// Golden digests of whole attempts (tests/fixtures/rules-golden.ts): every rules event, the
// final score and tick, and the replay of each. They pin the rules' bits on top of the
// simulation's. Update them only for a deliberate rules or physics change, and run
// `npm run test:engines` afterward. The same values come out of V8 (Node) and JavaScriptCore
// (Bun).
const GOLDEN: Record<string, string> = {
  plinko: '03b50ea0ebf1ee7f',
  bench: 'e45bba917065d01e',
  fever: '0a474cd624cc4d0b',
  slide: '1e897d352754729e',
  mixed: 'e15fdd6583ca6c38',
};

describe('golden attempts', () => {
  const digests = rulesScenarioDigests();

  it.each(Object.keys(GOLDEN))('scenario %s keeps its bits', (name) => {
    expect(digests[name]).toBe(GOLDEN[name]);
  });

  it('combines into the cross-engine digest', () => {
    expect(rulesDigest()).toBe('a53722bdebe77921');
  });
});
