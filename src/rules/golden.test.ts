import { describe, expect, it } from 'vitest';
import { rulesDigest, rulesScenarioDigests } from '../../tests/fixtures/rules-golden';

// Golden digests of whole attempts (tests/fixtures/rules-golden.ts): every rules event, the
// final score and tick, and the replay of each. They pin the rules' bits on top of the
// simulation's. Update them only for a deliberate rules or physics change, and run
// `npm run test:engines` afterward. The same values come out of V8 (Node) and JavaScriptCore
// (Bun).
const GOLDEN: Record<string, string> = {
  plinko: '9765e7a5687a0564',
  bench: '9e93018a4023ed8a',
  fever: '7c396d90a3999282',
  slide: 'b393303a2486cf6e',
  mixed: 'ae4d79f9efc00aef',
};

describe('golden attempts', () => {
  const digests = rulesScenarioDigests();

  it.each(Object.keys(GOLDEN))('scenario %s keeps its bits', (name) => {
    expect(digests[name]).toBe(GOLDEN[name]);
  });

  it('combines into the cross-engine digest', () => {
    expect(rulesDigest()).toBe('17a9ae4a032bf7cf');
  });
});
