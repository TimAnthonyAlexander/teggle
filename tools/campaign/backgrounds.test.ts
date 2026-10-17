// The shipped campaign backgrounds against their sources: every picture in public/backgrounds/
// belongs to a level whose source records where it came from, has the shipped size and stays
// within the budget, and docs/assets.md records it exactly as the sources and files say
// (spec 14.2, "Decided in the backgrounds").

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_BYTES, PICTURE_H, PICTURE_W, webpSize } from './look';
import { backgroundsManifest, type ShippedFile } from './manifest';
import { BACKGROUNDS_DIR, loadCampaign, ROOT, type CampaignSource } from './source';

let campaign: CampaignSource;
let names: string[];
const files = new Map<string, ShippedFile>();
const sizes = new Map<string, [number, number] | null>();

beforeAll(async () => {
  campaign = await loadCampaign();
  names = (await readdir(BACKGROUNDS_DIR)).filter((n) => !n.startsWith('.')).sort();
  for (const name of names) {
    const bytes = await readFile(path.join(BACKGROUNDS_DIR, name));
    const id = name.replace(/\.webp$/, '');
    files.set(id, {
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    sizes.set(id, webpSize(bytes));
  }
});

describe('the campaign backgrounds', () => {
  it('are WebP files, each the picture of a level that records its source', () => {
    expect(names.filter((n) => !/^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/.test(n))).toEqual([]);
    const recorded = new Set(
      campaign.levels
        .filter((l) => l.level.background.picture !== undefined)
        .map((l) => l.level.background.id),
    );
    expect([...files.keys()].filter((id) => !recorded.has(id))).toEqual([]);
    expect([...recorded].filter((id) => !files.has(id))).toEqual([]);
  });

  it('give every level a picture', () => {
    expect(
      campaign.levels
        .filter((l) => l.level.background.picture === undefined)
        .map((l) => l.level.id),
    ).toEqual([]);
  });

  it('cover the playfield opening at the shipped size, within the budget', () => {
    for (const [id, f] of files) {
      expect(sizes.get(id), id).toEqual([PICTURE_W, PICTURE_H]);
      expect(f.bytes, id).toBeLessThanOrEqual(MAX_BYTES);
    }
  });

  it('are recorded in docs/assets.md as the sources and files say', async () => {
    const doc = await readFile(path.join(ROOT, 'docs', 'assets.md'), 'utf8');
    expect(doc).toContain(backgroundsManifest(campaign.stages, campaign.levels, files));
  });
});
