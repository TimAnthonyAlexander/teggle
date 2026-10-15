import { describe, expect, it } from 'vitest';
import { powerScenarioDigests, powersDigest } from '../../../tests/fixtures/powers-golden';

// Golden digests of whole attempts with each master power (tests/fixtures/powers-golden.ts):
// every rules event, the final score and tick, and the replay of each. Update them only for a
// deliberate change to the powers, the rules or the physics, and run `npm run test:engines`
// afterward: V8 (Node) and JavaScriptCore (Bun) give the same values.
const GOLDEN: Record<string, string> = {
  guide: 'f6b4ca1ddff6cc66',
  multiball: 'b900d1524a7b3dc9',
  pyramid: '11dbdb1a3c616389',
  spaceBlast: 'ab7881499e40e90a',
  flippers: '34ad77a0ce5d1232',
  spookyBall: '9ba6521ce26a8f0b',
  flowerPower: '7318df20d5d437e6',
  luckySpin: '0fc9b9efe0cbf77e',
  luckySpin2: '58b2f5d94b8e698e',
  fireball: 'f0689a881e536666',
  zenBall: '9100b59c28f9f171',
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
    expect(powersDigest()).toBe('532fe33c91764a6f');
  });
});
