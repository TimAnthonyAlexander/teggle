import { describe, expect, it } from 'vitest';
import type { AttemptView } from '../../rules/attempt';
import { challengeById, startRun, type ChallengeDef } from '../../rules/challenges';
import type { ScoreBreakdown } from '../play/summary';
import { challengeRecord } from '../progress/save';
import { ProgressStore } from '../progress/store';
import { challengeHost, listHash, NEXT_LEVEL_HASH } from './challenge-host';
import { activeRun, setActiveRun, type ActiveRun } from './challenge-run';

function def(id: string): ChallengeDef {
  const c = challengeById(id);
  if (c === null) throw new Error(`no challenge ${id}`);
  return c;
}

function run(id: string, levels: string[]): ActiveRun {
  const d = def(id);
  return {
    def: d,
    power: 'guide',
    pick: null,
    startHash: `#/challenges/${id}/play?master=guide`,
    run: startRun(d, levels),
    counted: false,
    recorded: false,
  };
}

const name = (slot: string): string => `${slot} Test`;
const breakdown = (cleared = 80): ScoreBreakdown =>
  ({ cleared, fullClear: cleared === 100 }) as ScoreBreakdown;

function attempt(
  result: 'won' | 'lost',
  score: number,
  ballsLeft = 0,
  orangeLeft = 0,
): AttemptView {
  return { result, score, ballsLeft, orangeLeft } as AttemptView;
}

describe('challengeHost', () => {
  it('plays a cup with its rules, counts the try at the first shot and fails short of the mark', () => {
    const store = new ProgressStore(null);
    const a = run('cup-1.1', ['1-5']);
    const host = challengeHost(store, a, name);
    expect(host.plan(1).config).toMatchObject({ orangeCount: 20, balls: 10, campaignTry: null });
    expect(host.right).toEqual({ line1: 'To', line2: 'Beat' });
    expect(host.rightValue(1234, 0)).toBe(300_000);
    host.attemptStarted(attempt('won', 0));
    host.attemptStarted(attempt('won', 0));
    expect(challengeRecord(store.progress, 'cup-1.1').tries).toBe(1);
    const end = attempt('won', 287_000);
    host.attemptEnded(end, breakdown());
    const view = host.challenge?.end(end, breakdown());
    expect(view?.passed).toBe(false);
    expect(view?.verdict).toContain('short of the 300,000');
    expect(view?.primary).toEqual({ label: 'Try Again', hash: a.startHash });
    expect(view?.secondary.hash).toBe(listHash(a.def));
    expect(challengeRecord(store.progress, 'cup-1.1')).toMatchObject({
      tries: 1,
      passes: 0,
      best: 287_000,
    });
  });

  it('goes on level by level and passes a run of random levels', () => {
    const store = new ProgressStore(null);
    const a = run('runs.2', ['1-2', '1-3', '1-5']);
    for (let i = 0; i < 3; i++) {
      const host = challengeHost(store, a, name);
      expect(host.left).toEqual({ line1: 'Level', line2: `${i + 1} of 3` });
      host.attemptStarted(attempt('won', 0));
      const end = attempt('won', 100_000 * (i + 1));
      host.attemptEnded(end, breakdown());
      if (i < 2) {
        expect(host.challenge?.end(end, breakdown())).toBeNull();
        expect(host.next.hash).toBe(NEXT_LEVEL_HASH);
        expect(host.totalAfter(1)).toBe(a.run.total - 100_000 * (i + 1) + 1);
      } else {
        const view = host.challenge?.end(end, breakdown());
        expect(view?.passed).toBe(true);
        expect(view?.rows).toContainEqual(['Run total:', '600,000']);
      }
    }
    expect(challengeRecord(store.progress, 'runs.2')).toMatchObject({
      tries: 1,
      passes: 1,
      bestLevels: 3,
      best: 600_000,
    });
  });

  it('carries the balls left to the next level of a carried stock', () => {
    const store = new ProgressStore(null);
    const a = run('insane.3', ['1-1', '1-2', '1-4']);
    const first = challengeHost(store, a, name);
    expect(first.plan(1).config.balls).toBe(10);
    first.attemptStarted(attempt('won', 0));
    first.attemptEnded(attempt('won', 90_000, 4), breakdown());
    expect(challengeHost(store, a, name).plan(1).config.balls).toBe(4);
  });

  it('records a run that is given up with the levels it won', () => {
    const store = new ProgressStore(null);
    const a = run('runs.1', ['1-2', '1-3']);
    setActiveRun(store, a);
    const host = challengeHost(store, a, name);
    host.attemptStarted(attempt('won', 0));
    host.attemptEnded(attempt('won', 120_000), breakdown());
    setActiveRun(store, null);
    expect(activeRun()).toBeNull();
    expect(challengeRecord(store.progress, 'runs.1')).toMatchObject({
      tries: 1,
      passes: 0,
      bestLevels: 1,
      best: null,
    });
  });

  it('says why a full clear failed', () => {
    const store = new ProgressStore(null);
    const a = run('clear-1.2', ['1-2']);
    const host = challengeHost(store, a, name);
    host.attemptStarted(attempt('won', 0));
    const end = attempt('won', 150_000);
    host.attemptEnded(end, breakdown(93));
    expect(host.challenge?.end(end, breakdown(93))?.verdict).toBe(
      'Won with 93% of the board cleared, but every peg has to go.',
    );
  });
});
