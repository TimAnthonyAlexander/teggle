// Ids of the ten base-game powers (spec 7), as stored in attempt configs and replays. The audio
// bus names the same ids (src/game/audio/bus.ts).

export const POWER_IDS = [
  'guide',
  'multiball',
  'pyramid',
  'spaceBlast',
  'flippers',
  'spookyBall',
  'flowerPower',
  'luckySpin',
  'fireball',
  'zenBall',
] as const;

export type PowerId = (typeof POWER_IDS)[number];

export function isPowerId(id: string): id is PowerId {
  return (POWER_IDS as readonly string[]).includes(id);
}
