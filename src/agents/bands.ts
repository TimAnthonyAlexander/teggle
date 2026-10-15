// Reference difficulty bands per campaign stage (spec 13.5 acceptance: a generated level's
// noisy-agent clear rate falls in the band chosen for its stage). The numbers in bands.json are
// derived from the original's campaign by `npm run agents:bands` (tools/agents/bands.ts): the
// noisy agent at the reference aim error, many runs per level, and per stage the range its five
// levels' clear rates span. No level geometry is stored, only these rates.

import data from './bands.json';
import { referenceBandsSchema, type ReferenceBands, type StageBand } from './bands-format';

export const REFERENCE_BANDS: ReferenceBands = referenceBandsSchema.parse(data);

/** The band of campaign stage 1 to 11. */
export function stageBand(stage: number): StageBand {
  const band = REFERENCE_BANDS.stages.find((s) => s.stage === stage);
  if (band === undefined) throw new RangeError(`no band for stage ${stage}`);
  return band;
}

/** A clear rate of the reference agent lies within its stage's band. */
export function inStageBand(stage: number, clearRate: number): boolean {
  const band = stageBand(stage);
  return clearRate >= band.low && clearRate <= band.high;
}
