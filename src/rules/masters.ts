// The ten masters of the base campaign (spec 7 and 8): one per stage 1 to 10, named by animal and
// power only (spec 1). Stage 11, the Master levels, lets the player pick any of them. The theme
// is the frame color set of visual guide 13, which the game's THEMES list in the same order.

import type { PowerId } from './powers/ids';

export interface Master {
  /** Campaign stage, 1 to 10. */
  readonly stage: number;
  readonly animal: string;
  readonly power: PowerId;
  /** Index into the frame themes (visual guide 13). */
  readonly theme: number;
}

export const MASTERS: readonly Master[] = [
  { stage: 1, animal: 'Unicorn', power: 'guide', theme: 0 },
  { stage: 2, animal: 'Gopher', power: 'multiball', theme: 1 },
  { stage: 3, animal: 'Cat', power: 'pyramid', theme: 2 },
  { stage: 4, animal: 'Alien', power: 'spaceBlast', theme: 3 },
  { stage: 5, animal: 'Lobster', power: 'flippers', theme: 4 },
  { stage: 6, animal: 'Pumpkin', power: 'spookyBall', theme: 5 },
  { stage: 7, animal: 'Sunflower', power: 'flowerPower', theme: 6 },
  { stage: 8, animal: 'Rabbit', power: 'luckySpin', theme: 7 },
  { stage: 9, animal: 'Wyvern', power: 'fireball', theme: 8 },
  { stage: 10, animal: 'Owl', power: 'zenBall', theme: 9 },
];

/** The master of a campaign stage (1 to 10), or null. */
export function masterOfStage(stage: number): Master | null {
  return MASTERS.find((m) => m.stage === stage) ?? null;
}

/** The master whose power this is. */
export function masterOfPower(power: PowerId): Master {
  const m = MASTERS.find((x) => x.power === power);
  if (m === undefined) throw new Error(`no master has the power "${power}"`);
  return m;
}
