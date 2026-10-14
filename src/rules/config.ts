// What varies between attempts besides the level and the seed: orange count, balls, which peg
// colors appear, the master's power and the campaign try. Plain data, stored in replays.

import { z } from 'zod';
import {
  DEFAULT_BALLS,
  DEFAULT_ORANGE_COUNT,
  FIRST_GREEN_LEVEL,
  FIRST_PURPLE_LEVEL,
} from './tuning';

export const attemptConfigSchema = z.strictObject({
  /** Orange pegs to clear: 25, or 35, 45 or 55 in challenges (spec 3). */
  orangeCount: z.int().min(1).max(10000),
  /** Balls at the start. */
  balls: z.int().min(1).max(10000),
  /** Two green pegs (campaign level 3 on, Quick Play, challenges). */
  greens: z.boolean(),
  /** A purple peg on every shot (campaign level 4 on). */
  purple: z.boolean(),
  /** Use the level's designer-placed greens if it has any (first campaign play only). */
  seededGreens: z.boolean(),
  /** Id of the power the green pegs trigger, or null for none. */
  power: z.string().min(1).nullable(),
  /** 1-based campaign try for the clear bonus; null outside the campaign (no bonus). */
  campaignTry: z.int().min(1).nullable(),
  /** A shot that hits no peg flips a coin for its ball back (off in Duel). */
  coinFlip: z.boolean(),
});

export type AttemptConfig = z.output<typeof attemptConfigSchema>;

/** Quick Play defaults: 25 orange, 10 balls, greens and purple, random greens, no power. */
export const DEFAULT_CONFIG: AttemptConfig = {
  orangeCount: DEFAULT_ORANGE_COUNT,
  balls: DEFAULT_BALLS,
  greens: true,
  purple: true,
  seededGreens: false,
  power: null,
  campaignTry: null,
  coinFlip: true,
};

/** The defaults with some fields replaced. Throws on invalid values. */
export function attemptConfig(overrides: Partial<AttemptConfig> = {}): AttemptConfig {
  return attemptConfigSchema.parse({ ...DEFAULT_CONFIG, ...overrides });
}

export interface CampaignAttempt {
  /** Campaign level in play order, 1 to 55. */
  readonly level: number;
  /** 1 for the first try at this level, 2 after one failure, and so on. */
  readonly try: number;
  /** The level has never been cleared: designer-placed greens apply. */
  readonly firstPlay: boolean;
  /** The stage master's power. */
  readonly power: string | null;
}

/** Config of a campaign attempt: greens from level 3, purple from level 4 (spec 8). */
export function campaignConfig(c: CampaignAttempt): AttemptConfig {
  return attemptConfig({
    greens: c.level >= FIRST_GREEN_LEVEL,
    purple: c.level >= FIRST_PURPLE_LEVEL,
    seededGreens: c.firstPlay,
    power: c.power,
    campaignTry: c.try,
  });
}
