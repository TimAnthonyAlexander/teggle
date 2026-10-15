import { describe, expect, it } from 'vitest';
import { engineDigest, scenarioDigests } from '../../tests/fixtures/golden';
import { moversDigest } from '../../tests/fixtures/movers-golden';
import { moversLevel } from '../../tests/fixtures/levels';
import { aimDirection } from './aim';
import { compileLevel } from './compile';
import { World } from './world';

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

// Teggle's followPath movements (spec 14.2) have a digest of their own, so the ones above, pinned
// before followPath existed, stay as they were.
describe('golden shots on paths', () => {
  it('keep their bits', () => {
    expect(moversDigest()).toBe('f0d37de451a68627');
  });

  it('light pegs and bricks that travel along paths', () => {
    const world = new World(compileLevel(moversLevel()));
    const moving = new Set(
      world.level.bodies.filter((b) => b.movement?.type === 'followPath').map((b) => b.id),
    );
    const lit = new Set<number>();
    for (let s = 0; s < 40; s++) {
      world.launch(aimDirection(-1.5 + (3 * s) / 39));
      for (let t = 0; t < 3000 && world.ballsInPlay > 0; t++) {
        world.step();
        for (const e of world.events) if (e.type === 'pegLit') lit.add(e.element);
      }
      world.discardBalls();
      world.endShot();
    }
    expect([...lit].filter((id) => moving.has(id)).length).toBeGreaterThan(5);
  });
});
