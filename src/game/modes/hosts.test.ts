import { describe, expect, it } from 'vitest';
import type { CampaignLevel, CampaignStage } from '../../level/campaign';
import type { OriginalEntry } from '../../level/original';
import type { AttemptView } from '../../rules/attempt';
import type { ScoreBreakdown } from '../play/summary';
import { emptyProgress, levelRecord, originalRecord, recordWin } from '../progress/save';
import { ProgressStore } from '../progress/store';
import { campaignHost, originalHost, quickPlayHost } from './hosts';
import type { ManifestLevel } from './manifest';

function entry(id: string, number: number): ManifestLevel {
  const level: CampaignLevel = {
    id,
    number,
    name: `Level ${id}`,
    file: `campaign/${id}.json`,
    lines: `campaign/${id}.lines.json`,
    background: `bg-${id}`,
  };
  const stage: CampaignStage = { stage: 1, world: 'Test', master: 'guide', levels: [level] };
  return { stage, level, index: number };
}

const breakdown = { fullClear: true } as ScoreBreakdown;

function won(score: number): AttemptView {
  return { result: 'won', score } as AttemptView;
}

describe('campaignHost', () => {
  it('plans tries from the save and counts a try at the first shot', () => {
    const store = new ProgressStore(null);
    store.update(() => ({ ...emptyProgress(), campaign: { next: 3, try: 1, pick: null } }));
    const host = campaignHost(store, entry('1-3', 3), 'guide');
    const first = host.plan(1).config;
    expect(first).toMatchObject({
      campaignTry: 1,
      seededGreens: true,
      greens: true,
      purple: false,
    });
    expect(first.power).toBe('guide');
    // Restarting before a shot keeps the try.
    expect(host.plan(2).config.campaignTry).toBe(1);
    host.attemptStarted(won(0));
    expect(host.plan(2).config.campaignTry).toBe(2);
    expect(levelRecord(store.progress, '1-3').tries).toBe(1);
  });

  it('records a campaign win, moves on and shows the total', () => {
    const store = new ProgressStore(null);
    store.update((p) =>
      recordWin(p, {
        levelId: '1-1',
        campaignNumber: 1,
        score: 1000,
        fullClear: false,
        master: 'guide',
        date: '2026-10-15',
      }),
    );
    const host = campaignHost(store, entry('1-2', 2), 'guide');
    expect(host.left).toEqual({ line1: 'Stage', line2: '1-2' });
    expect(host.rightValue(500, 0)).toBe(1500);
    host.attemptEnded(won(4000), breakdown);
    expect(store.progress.campaign).toMatchObject({ next: 3, try: 1 });
    expect(levelRecord(store.progress, '1-2')).toMatchObject({
      wins: 1,
      campaignScore: 4000,
      fullClear: true,
    });
    expect(host.totalAfter(4000)).toBe(5000);
    // Designer greens end once the level is cleared.
    expect(host.plan(1).config.seededGreens).toBe(false);
  });

  it('ignores a lost attempt beyond its try', () => {
    const store = new ProgressStore(null);
    const host = campaignHost(store, entry('1-1', 1), 'guide');
    host.attemptStarted(won(0));
    host.attemptEnded({ result: 'lost', score: 900 } as AttemptView, breakdown);
    expect(store.progress.campaign).toMatchObject({ next: 1, try: 2 });
    expect(levelRecord(store.progress, '1-1').wins).toBe(0);
  });
});

describe('quickPlayHost', () => {
  it('plays with random greens and no clear bonus, and keeps the campaign where it is', () => {
    const store = new ProgressStore(null);
    store.update(() => ({ ...emptyProgress(), campaign: { next: 4, try: 1, pick: null } }));
    const host = quickPlayHost(store, entry('1-1', 1), 'multiball');
    expect(host.plan(1).config).toMatchObject({
      campaignTry: null,
      seededGreens: false,
      greens: true,
      purple: true,
      power: 'multiball',
    });
    host.attemptStarted(won(0));
    host.attemptEnded(won(7000), breakdown);
    expect(store.progress.campaign).toEqual({ next: 4, try: 1, pick: null });
    expect(levelRecord(store.progress, '1-1')).toMatchObject({ tries: 1, wins: 1, best: 7000 });
    expect(levelRecord(store.progress, '1-1').top[0]?.master).toBe('multiball');
    expect(host.rightValue(100, 0)).toBe(7000);
    expect(host.next.hash).toBe('#/quickplay?stage=1');
  });
});

describe('originalHost', () => {
  const original: OriginalEntry = {
    id: '6-1',
    number: 26,
    stage: 6,
    name: 'Waves',
    file: 'levels/6-1.json',
    background: 'waves',
  };

  it("plays with the original's 25 orange drawn uniformly and records apart", () => {
    const store = new ProgressStore(null);
    const host = originalHost(store, original, 'fireball');
    expect(host.plan(1).config).toMatchObject({
      orangeCount: 25,
      orangeDraw: 'uniform',
      balls: 10,
      greens: true,
      purple: true,
      campaignTry: null,
      power: 'fireball',
    });
    host.attemptStarted(won(0));
    host.attemptEnded({ result: 'lost', score: 900 } as AttemptView, breakdown);
    host.attemptStarted(won(0));
    host.attemptEnded(won(150_000), breakdown);
    expect(originalRecord(store.progress, '6-1')).toMatchObject({
      tries: 2,
      wins: 1,
      best: 150_000,
      fullClear: true,
    });
    expect(store.progress.levels).toEqual({});
    expect(store.progress.campaign).toEqual(emptyProgress().campaign);
    expect(host.rightValue(100, 0)).toBe(150_000);
    expect(host.next.hash).toBe('#/quickplay/original?stage=6');
    expect(host.quit.hash).toBe('#/quickplay/original?stage=6');
  });
});
