import { describe, expect, it } from 'vitest';
import { fixedColors, newAttempt, pegGrid } from '../../../tests/fixtures/rules';
import type { Attempt } from '../../rules/attempt';
import { aimDirection } from '../../sim/aim';
import { AudioBus, type AudioEvent } from '../audio/bus';
import { GONE, Presenter } from './presenter';
import { popGapTicks, TALLY_HOLD_TICKS, TALLY_LEAD_TICKS } from './timing';

interface Logged {
  readonly tick: number;
  readonly event: AudioEvent;
}

/** Runs an attempt through the presenter the way the play screen does, one tick at a time. */
function harness(attempt: Attempt) {
  const audio = new AudioBus();
  const log: Logged[] = [];
  let tick = 0;
  audio.on((event) => log.push({ tick, event }));
  const pres = new Presenter(attempt.level, audio, 75, 40);
  pres.reset(attempt);
  const step = (): void => {
    tick++;
    attempt.step();
    pres.handleSim(attempt.world.events);
    pres.handleRules(attempt.takeEvents(), attempt);
    pres.tick(attempt);
  };
  const shoot = (angle: number): { end: number; hits: number } => {
    attempt.launch(aimDirection(angle));
    pres.handleRules(attempt.takeEvents(), attempt);
    while (attempt.phase === 'shot') step();
    return { end: tick, hits: attempt.shotCount };
  };
  const settle = (limit = 2000): void => {
    for (let i = 0; i < limit && !pres.ready && pres.endRequest === null; i++) step();
  };
  return { pres, log, step, shoot, settle, now: () => tick };
}

describe('presenter', () => {
  it('pops the lit pegs one at a time after the shot, at the original cadence', () => {
    const attempt = newAttempt(pegGrid(72), fixedColors(25, { balls: 10 }), 3);
    const h = harness(attempt);
    const { end, hits } = h.shoot(0.12);
    expect(hits).toBeGreaterThan(2);
    // The simulation removed every lit peg at once; the show still has them.
    const lit = h.pres.state.reduce((n, s) => n + (s === 1 ? 1 : 0), 0);
    expect(lit).toBe(hits);
    expect(h.pres.ready).toBe(false);
    h.settle();
    const pops = h.log.filter((l) => l.event.type === 'pegPop').map((l) => l.tick);
    expect(pops).toHaveLength(hits);
    expect(pops[0]).toBe(end + TALLY_LEAD_TICKS);
    for (let i = 1; i < pops.length; i++) {
      expect((pops[i] ?? 0) - (pops[i - 1] ?? 0)).toBe(popGapTicks(hits - i));
    }
    expect(h.pres.tally.popped).toBe(hits);
    expect(h.pres.tally.count).toBe(hits);
    expect(h.pres.state.filter((s) => s === GONE)).toHaveLength(hits);
    // Ready once the tally has held.
    expect(h.now()).toBe((pops[pops.length - 1] ?? 0) + TALLY_HOLD_TICKS);
    expect(h.pres.ready).toBe(true);
  });

  it('raises the hit index through a shot for the rising pitch', () => {
    const attempt = newAttempt(pegGrid(72), fixedColors(25), 5);
    const h = harness(attempt);
    h.shoot(-0.2);
    const hits = h.log.filter((l) => l.event.type === 'pegHit').map((l) => l.event);
    expect(hits.length).toBeGreaterThan(1);
    hits.forEach((e, i) => {
      expect(e.type === 'pegHit' && e.index).toBe(i);
    });
  });

  it('shows the score and balls of the rules once the tally is done', () => {
    const attempt = newAttempt(pegGrid(72), fixedColors(25), 9);
    const h = harness(attempt);
    for (const a of [0.1, -0.3, 0.5]) {
      h.shoot(a);
      expect(h.pres.shownScore).toBeLessThanOrEqual(attempt.score);
      h.settle();
      for (let i = 0; i < 60; i++) h.step();
      expect(h.pres.shownScore).toBe(attempt.score);
      expect(h.pres.shownBalls).toBe(attempt.ballsLeft);
    }
  });

  it('asks for the level failed dialog only after the last pops', () => {
    const attempt = newAttempt(pegGrid(72), fixedColors(25, { balls: 2 }), 11);
    const h = harness(attempt);
    expect(h.pres.warningBalls).toBe(2);
    let hits = 0;
    // Read through a call: the checker would keep the narrowing across shoot().
    const aiming = (): boolean => attempt.phase === 'aim';
    for (let shot = 0; aiming() && shot < 20; shot++) {
      expect(h.pres.ready).toBe(true);
      hits = h.shoot(shot % 2 === 0 ? 0.3 : -0.1).hits;
      if (aiming()) h.settle();
    }
    expect(attempt.result).toBe('lost');
    expect(h.pres.endRequest).toBeNull();
    h.settle();
    expect(h.pres.endRequest).toBe('lost');
    expect(h.pres.tally.popped).toBe(hits);
    expect(h.log.some((l) => l.event.type === 'levelLost')).toBe(true);
  });

  it('warns once at 3, 2 and 1 balls', () => {
    const attempt = newAttempt(pegGrid(72), fixedColors(25, { balls: 4 }), 2);
    const h = harness(attempt);
    expect(h.pres.warningBalls).toBe(0);
    for (const a of [0.2, -0.2, 0.4]) {
      h.shoot(a);
      h.settle();
    }
    // Free balls may delay a step; every warning names the stock at that moment.
    const warned = h.log.flatMap((l) => (l.event.type === 'lowBalls' ? [l.event.balls] : []));
    expect(warned.length).toBeGreaterThan(0);
    for (const b of warned) expect(b).toBeLessThanOrEqual(3);
    expect(new Set(warned).size).toBe(warned.length);
  });
});
