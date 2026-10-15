// Format of the reference bands file (bands.json), kept apart from the data so the tool that
// writes the file (tools/agents/bands.ts) can validate it without reading the old one.

import { z } from 'zod';
import { agentSpecSchema } from './agent';

export const BANDS_FILE_FORMAT = 1;

const rate = z.number().min(0).max(1);

export const referenceBandsSchema = z.strictObject({
  format: z.literal(BANDS_FILE_FORMAT),
  /** Date of the measurement, YYYY-MM-DD. */
  measured: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** What was played. */
  source: z.string().min(1),
  agent: agentSpecSchema,
  /** Runs per level, and the base seed of the runs. */
  runs: z.int().min(1),
  seed: z.int().min(0),
  stages: z
    .array(
      z.strictObject({
        stage: z.int().min(1).max(11),
        /** The band: the lowest and highest clear rate of the stage's levels. */
        low: rate,
        high: rate,
        mean: rate,
        levels: z.array(
          z.strictObject({
            /** "<stage>-<level>" in the original's campaign. */
            id: z.string().regex(/^\d{1,2}-[1-5]$/),
            clearRate: rate,
            /** 95% Wilson interval of the clear rate. */
            low: rate,
            high: rate,
          }),
        ),
      }),
    )
    .length(11),
});

export type ReferenceBands = z.output<typeof referenceBandsSchema>;
export type StageBand = ReferenceBands['stages'][number];
