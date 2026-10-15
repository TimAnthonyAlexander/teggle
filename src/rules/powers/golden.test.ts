import { describe, expect, it } from 'vitest';
import { powerScenarioDigests, powersDigest } from '../../../tests/fixtures/powers-golden';

// Golden digests of whole attempts with each master power (tests/fixtures/powers-golden.ts):
// every rules event, the final score and tick, and the replay of each. Update them only for a
// deliberate change to the powers, the rules or the physics, and run `npm run test:engines`
// afterward: V8 (Node) and JavaScriptCore (Bun) give the same values.
const GOLDEN: Record<string, string> = {
  guide: '40732203c07fa65b',
  multiball: '633485827eb4758f',
  pyramid: '4be7e40427dfcd23',
  spaceBlast: '8d065e73ea8ce0de',
  flippers: 'b570722bfc82181a',
  spookyBall: '77b044974e69e14b',
  flowerPower: '9894253ab7a89a1c',
  luckySpin: '3b251946de0d7e68',
  luckySpin2: '137034e49eafdb7e',
  fireball: '7a53591c5f4d5506',
  zenBall: 'f13c50f54506b826',
};

describe('golden power attempts', () => {
  const scenarios = powerScenarioDigests();

  it.each(Object.keys(GOLDEN))('scenario %s keeps its bits and uses its power', (name) => {
    const s = scenarios[name];
    expect(s?.digest).toBe(GOLDEN[name]);
    expect(s?.greens).toBeGreaterThanOrEqual(2);
  });

  it('covers the power actions and Lucky Spin outcomes', () => {
    const actions = new Set(Object.values(scenarios).flatMap((s) => s.actions));
    expect([...actions].sort()).toEqual([
      'coverBurned',
      'flowerPower',
      'luckySpin:bigBall',
      'luckySpin:extraBall',
      'luckySpin:fireball',
      'luckySpin:tripleScore',
      'multiball',
      'spaceBlast',
      'spookyBall',
      'zenShot:better',
    ]);
  });

  it('combines into the cross-engine digest', () => {
    expect(powersDigest()).toBe('98ca9890f51b50e2');
  });
});
