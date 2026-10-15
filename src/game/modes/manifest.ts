// The campaign manifest for the menus (public/levels/campaign/manifest.json, written by
// `npm run campaign:build` and validated by src/level/campaign.ts). Loaded once per session; the
// menus show whatever stages and levels it holds, so new stages appear without code changes.

import {
  CampaignFormatError,
  LEVELS_PER_STAGE,
  parseCampaignManifest,
  type CampaignLevel,
  type CampaignManifest,
  type CampaignStage,
} from '../../level/campaign';

export class CampaignLoadError extends Error {
  override readonly name = 'CampaignLoadError';
}

export interface ManifestLevel {
  readonly stage: CampaignStage;
  readonly level: CampaignLevel;
  /** 1-based place within its stage. */
  readonly index: number;
}

async function fetchManifest(base: string): Promise<CampaignManifest> {
  let res: Response;
  try {
    res = await fetch(`${base}levels/campaign/manifest.json`, { cache: 'no-cache' });
  } catch {
    throw new CampaignLoadError('Could not reach the campaign manifest.');
  }
  if (!res.ok)
    throw new CampaignLoadError(`The campaign manifest was not found (HTTP ${res.status}).`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new CampaignLoadError('The campaign manifest is not valid JSON.');
  }
  try {
    return parseCampaignManifest(json);
  } catch (err) {
    if (err instanceof CampaignFormatError) throw new CampaignLoadError(err.message);
    throw err;
  }
}

let cached: Promise<CampaignManifest> | null = null;

/** The manifest, fetched and validated on first use. A failed load is retried next time. */
export function loadManifest(base: string = import.meta.env.BASE_URL): Promise<CampaignManifest> {
  cached ??= fetchManifest(base).catch((err: unknown) => {
    cached = null;
    throw err instanceof Error ? err : new CampaignLoadError(String(err));
  });
  return cached;
}

/** Every level in campaign order. */
export function manifestLevels(m: CampaignManifest): ManifestLevel[] {
  const out: ManifestLevel[] = [];
  for (const stage of m.stages) {
    stage.levels.forEach((level, i) => out.push({ stage, level, index: i + 1 }));
  }
  return out;
}

export function findLevel(m: CampaignManifest, id: string): ManifestLevel | null {
  return manifestLevels(m).find((l) => l.level.id === id) ?? null;
}

export function findByNumber(m: CampaignManifest, n: number): ManifestLevel | null {
  return manifestLevels(m).find((l) => l.level.number === n) ?? null;
}

export function findStage(m: CampaignManifest, stage: number): CampaignStage | null {
  return m.stages.find((s) => s.stage === stage) ?? null;
}

/** A stage is complete in the manifest when it lists all of its five levels. */
export function stageIsFull(stage: CampaignStage): boolean {
  return stage.levels.length === LEVELS_PER_STAGE;
}
