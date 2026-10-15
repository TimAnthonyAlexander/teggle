import { describe, expect, it } from 'vitest';
import { CampaignFormatError, parseCampaignManifest } from './campaign';

function level(stage: number, n: number, more: Record<string, unknown> = {}) {
  const id = `${stage}-${n}`;
  return {
    id,
    number: (stage - 1) * 5 + n,
    name: `Level ${id}`,
    file: `campaign/${id}.json`,
    lines: `campaign/${id}.lines.json`,
    background: `s${stage}-picture-${n}`,
    ...more,
  };
}

function manifest(stages: unknown[]) {
  return { formatVersion: 1, stages };
}

const stage1 = {
  stage: 1,
  world: 'Cloud Isles',
  master: 'guide',
  levels: [level(1, 1), level(1, 2)],
};

function rejects(json: unknown, message: RegExp): void {
  expect(() => parseCampaignManifest(json)).toThrow(CampaignFormatError);
  expect(() => parseCampaignManifest(json)).toThrow(message);
}

describe('parseCampaignManifest', () => {
  it('reads stages in order with their masters and levels', () => {
    const m = parseCampaignManifest(
      manifest([
        stage1,
        { stage: 2, world: 'Burrows', master: 'multiball', levels: [level(2, 1)] },
      ]),
    );
    expect(m.stages.map((s) => s.master)).toEqual(['guide', 'multiball']);
    expect(m.stages[1]?.levels[0]?.number).toBe(6);
  });

  it("checks each stage's master against the masters table", () => {
    rejects(manifest([{ ...stage1, master: 'fireball' }]), /stage 1 belongs to guide/);
    rejects(manifest([{ ...stage1, master: 'unicorn' }]), /master/);
  });

  it('checks stage order, level ids, numbers and file paths', () => {
    rejects(manifest([{ ...stage1, stage: 2, master: 'multiball' }]), /stage 2 is listed at/);
    rejects(manifest([{ ...stage1, levels: [level(1, 2)] }]), /level 1-2 should be 1-1/);
    rejects(
      manifest([{ ...stage1, levels: [level(1, 1, { number: 3 })] }]),
      /campaign level 1, not 3/,
    );
    rejects(
      manifest([{ ...stage1, levels: [level(1, 1, { file: 'campaign/1-2.json' })] }]),
      /files are campaign\/1-1\.json/,
    );
    rejects(
      manifest([{ ...stage1, levels: [level(1, 1, { file: '../secret.json' })] }]),
      /Invalid campaign manifest/,
    );
  });

  it('rejects a name or a background used twice', () => {
    rejects(
      manifest([{ ...stage1, levels: [level(1, 1), level(1, 2, { name: 'Level 1-1' })] }]),
      /name "Level 1-1" is used twice/,
    );
    rejects(
      manifest([{ ...stage1, levels: [level(1, 1), level(1, 2, { background: 's1-picture-1' })] }]),
      /background "s1-picture-1" is used twice/,
    );
  });

  it('rejects other format versions and unknown fields', () => {
    rejects({ ...manifest([stage1]), formatVersion: 2 }, /formatVersion/);
    rejects(manifest([{ ...stage1, extra: true }]), /extra/);
  });
});
