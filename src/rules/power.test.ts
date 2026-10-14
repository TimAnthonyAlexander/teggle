import { describe, expect, it } from 'vitest';
import type { LevelElementInput } from '../level/schema';
import {
  DOWN,
  dropLevel,
  FIRST,
  grazeChain,
  inShot,
  newAttempt,
  ofType,
  RAMP_START,
  ROD,
  shoot,
  SPARE,
  styles,
} from '../../tests/fixtures/rules';
import type { Attempt } from './attempt';
import { AttemptSetupError } from './colors';
import { attemptConfig } from './config';
import type { RulesEvent } from './events';
import { BASE_AIM_GUIDE, type Power, type PowerContext, type PowerRegistry } from './power';

// The ramp: orange peg 1, then green peg 10, then blue peg 11, all in one shot. Peg 902 is the
// second (seeded) green, out of reach; peg 900 an orange out of reach.
const OTHER_GREEN: LevelElementInput = { ...SPARE, id: 902, canBeOrange: false };
const chain = grazeChain([ROD, FIRST, SPARE, OTHER_GREEN], [105, 175], () => false);
const LEVEL = dropLevel(RAMP_START, chain, { seededGreens: [10, 902] });
const CONFIG = (power: string) =>
  attemptConfig({ orangeCount: 2, purple: false, seededGreens: true, power });

function attemptWith(powers: Power[], master = powers[0]?.id ?? 'none'): Attempt {
  const registry: PowerRegistry = new Map(powers.map((p) => [p.id, p]));
  return newAttempt(LEVEL, CONFIG(master), 1, { powers: registry });
}

function power(
  id: string,
  onGreen: Power['onGreen'],
  hooks: Omit<Power, 'id' | 'name' | 'onGreen'> = {},
): Power {
  return { id, name: id, onGreen, ...hooks };
}

function effectChanges(events: readonly RulesEvent[]): string[] {
  return ofType(events, 'effect').map((e) => `${e.tag}:${e.change}:${e.shotsLeft}`);
}

describe('powers', () => {
  it('calls the master power when a green peg lights, with the world, the rules and the Rng', () => {
    const seen: string[] = [];
    const p = power('probe', (ctx, green) => {
      seen.push(
        `${green.element} ball ${green.ball} ${green.cause} shot ${ctx.attempt.shotCount} ` +
          `in shot ${ctx.world.inShot} rng ${ctx.rng.nextInt(1000)}`,
      );
    });
    const a = attemptWith([p]);
    const events = shoot(a, DOWN);
    expect(ofType(events, 'pegScored').map((e) => e.color)).toEqual(['orange', 'green', 'blue']);
    expect(ofType(events, 'greenHit')).toEqual([
      expect.objectContaining({ element: 10, ball: 0, power: 'probe' }),
    ]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^10 ball 0 contact shot 2 in shot true rng \d+$/);
    // The same seed gives the same draws.
    const again: string[] = [];
    shoot(attemptWith([power('probe', (ctx) => again.push(String(ctx.rng.nextInt(1000))))]), DOWN);
    expect(seen[0]?.endsWith(` ${again[0] ?? ''}`)).toBe(true);
  });

  it('runs an effect granted "now" from this shot, for its number of shots', () => {
    const log: string[] = [];
    const triple = power(
      'triple',
      (ctx) => {
        ctx.grant('tripleScore', 2, 'now');
      },
      {
        begin: () => log.push('begin'),
        end: () => log.push('end'),
        shotEnd: () => log.push('shotEnd'),
        pegValue: (_fx, value) => value * 3,
      },
    );
    const a = attemptWith([triple]);
    const first = shoot(a, DOWN);
    // The green itself scores before the power runs; the blue peg after it is tripled.
    expect(ofType(first, 'pegScored').map((e) => e.value)).toEqual([1000, 100, 300]);
    expect(effectChanges(first)).toEqual(['tripleScore:granted:2']);
    expect(a.effects).toEqual([
      { power: 'triple', tag: 'tripleScore', shotsLeft: 1, pending: false },
    ]);
    expect(log).toEqual(['begin', 'shotEnd']);
    const second = shoot(a, DOWN);
    expect(effectChanges(second)).toEqual(['tripleScore:ended:0']);
    expect(log).toEqual(['begin', 'shotEnd', 'shotEnd', 'end']);
    expect(a.effects).toEqual([]);
  });

  it('starts an effect granted "next" when the shot ends, changing the aim guide and the launch', () => {
    const radii: number[] = [];
    const guide = power(
      'guide',
      (ctx) => {
        ctx.grant('guide', 2, 'next');
      },
      {
        aimGuide: () => ({ ticks: 80, throughFirstBounce: true }),
        launch: (_ctx, _fx, plan) => {
          plan.options.radius = 10;
        },
        shotStart: (ctx) => {
          radii.push(ctx.world.balls[0]?.radius ?? 0);
        },
      },
    );
    const a = attemptWith([guide]);
    a.launch(DOWN);
    while (inShot(a)) {
      a.step();
      if (a.effects.length > 0 && inShot(a)) {
        expect(a.effects[0]?.pending).toBe(true);
        expect(a.aimGuide()).toEqual(BASE_AIM_GUIDE);
      }
    }
    expect(effectChanges(a.takeEvents())).toEqual(['guide:granted:2', 'guide:started:2']);
    expect(a.aimGuide()).toEqual({ ticks: 80, throughFirstBounce: true });
    expect(radii).toEqual([]);
    shoot(a, DOWN);
    expect(radii).toEqual([10]);
    const last = shoot(a, DOWN);
    expect(radii).toEqual([10, 10]);
    expect(effectChanges(last)).toEqual(['guide:ended:0']);
    expect(a.aimGuide()).toEqual(BASE_AIM_GUIDE);
    // The recorded direction stays the player's; only the ball changed.
    expect(a.record().shots.map((s) => s.direction)).toEqual([DOWN, DOWN, DOWN]);
  });

  it('adds shots to an effect that is still running', () => {
    const p = power('stack', (ctx) => {
      ctx.grant('fx', 3, 'now');
      ctx.grant('fx', 3, 'now');
    });
    const a = attemptWith([p]);
    expect(effectChanges(shoot(a, DOWN))).toEqual(['fx:granted:3', 'fx:extended:6']);
    expect(a.effects[0]?.shotsLeft).toBe(5);
  });

  it('lights pegs, adds balls and awards style points through its context', () => {
    // 120 blue pegs low on the left, out of the ball's way.
    const extra: LevelElementInput[] = Array.from({ length: 120 }, (_, k) => ({
      kind: 'peg',
      id: 200 + k,
      x: 30 + (k % 20) * 18,
      y: 420 + Math.floor(k / 20) * 20,
      radius: 5,
      canBeOrange: false,
    }));
    const level = dropLevel(RAMP_START, [...chain, ...extra], { seededGreens: [10, 902] });
    const blast = power('blast', (ctx, green) => {
      ctx.world.lightPegs(ctx.attempt.pegIds('blue').filter((id) => id >= 200));
      ctx.freeBall();
      ctx.style('power:blast:trick', 10000, green.x, green.y);
    });
    const a = newAttempt(level, CONFIG('blast'), 1, { powers: new Map([['blast', blast]]) });
    const events = shoot(a, DOWN);
    const scored = ofType(events, 'pegScored');
    expect(scored.filter((e) => e.cause === 'power')).toHaveLength(120);
    expect(scored.filter((e) => e.cause === 'power').every((e) => e.ball === -1)).toBe(true);
    // Each threshold ball comes right after the peg that took the shot score past it.
    const thresholds = ofType(events, 'freeBall').filter((e) => e.reason === 'threshold');
    expect(thresholds.map((e) => e.threshold)).toEqual([25000, 75000, 125000]);
    for (const t of thresholds) {
      const before = events.slice(0, events.indexOf(t));
      const last = ofType(before, 'pegScored').at(-1);
      const previous = ofType(before, 'pegScored').at(-2);
      expect(last?.shotScore ?? 0).toBeGreaterThanOrEqual(t.threshold);
      expect(previous?.shotScore ?? 0).toBeLessThan(t.threshold);
    }
    expect(ofType(events, 'freeBall').filter((e) => e.reason === 'power')).toHaveLength(1);
    // Peg 1 to green peg 10 is also a Long Shot.
    expect(styles(events)).toEqual(['longShot', 'power:blast:trick']);
    expect(ofType(events, 'shotTally')[0]?.styleScore).toBe(25000 + 10000);
    expect(a.ballsLeft).toBe(9 + 3 + 1);
  });

  it('can run another power (Lucky Spin picking a random power)', () => {
    const other = power('other', (ctx) => {
      ctx.grant('fx', 1, 'next');
    });
    const spin = power('spin', (ctx, green) => {
      ctx.trigger('other', green);
    });
    const a = attemptWith([spin, other], 'spin');
    expect(effectChanges(shoot(a, DOWN))).toEqual(['fx:granted:1', 'fx:started:1']);
    expect(a.effects).toEqual([{ power: 'other', tag: 'fx', shotsLeft: 1, pending: false }]);
  });

  it('refuses an unknown power and a power that removes an unlit orange peg', () => {
    expect(() => newAttempt(LEVEL, CONFIG('missing'))).toThrow(AttemptSetupError);
    const remover = power('remover', (ctx: PowerContext) => {
      ctx.world.removePeg(900, 'power');
    });
    expect(() => shoot(attemptWith([remover]), DOWN)).toThrow(/without lighting/);
  });
});
