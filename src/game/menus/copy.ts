// Teggle's own words for the masters (spec 1: named by animal and power only; visual guide 15:
// no text from the original game): the stage intro card's tagline and speech for each master,
// one line describing each power, and the stage names. Every claim about a power matches
// spec 7 and the rules engine.

import type { PowerId } from '../../rules/powers';

export interface MasterCopy {
  /** The intro card's cyan heading (visual guide 10.5). */
  readonly tagline: string;
  /** What the master says on the intro card, typed out. */
  readonly speech: string;
  /** One line on the power, for the master picker. */
  readonly power: string;
}

export const MASTER_COPY: Readonly<Record<PowerId, MasterCopy>> = {
  guide: {
    tagline: 'See your shot before you take it',
    speech:
      "Hello, and welcome! I'm the Unicorn, your first master. Light up a green peg and my Guide draws your path all the way through the first bounce, for your next three shots. Line it up, nudge it a hair, and watch the pegs fall.",
    power: 'The aim guide shows the path through the first bounce for the next three shots.',
  },
  multiball: {
    tagline: 'Two balls are better than one',
    speech:
      "Hey there, I'm the Gopher. I dig up surprises! Hit a green peg and a second ball pops right out of it, bouncing along with the first. Two balls means twice the pegs, so aim for the greens.",
    power: 'A second ball bursts out of the green peg.',
  },
  pyramid: {
    tagline: 'A bigger bucket for five shots',
    speech:
      'Greetings. I am the Cat. When you light a green peg, your bucket becomes a broad pyramid with long, sloping sides, for this shot and the four after it. A ball that lands on a slope can roll right in, and every catch is a free ball.',
    power: 'The bucket becomes a wide pyramid for five shots, starting now.',
  },
  spaceBlast: {
    tagline: 'Blast the pegs around you',
    speech:
      "Greetings from far away! I'm the Alien. Touch a green peg and my Space Blast lights up every peg near it, all at once. The closer the green sits to the orange pegs, the bigger your haul.",
    power: 'Every peg near the green peg lights up at once.',
  },
  flippers: {
    tagline: 'Send the ball back up',
    speech:
      "Ahoy! I'm the Lobster. A green peg brings out two flippers in the bottom corners for three shots. Hold the mouse button or the space bar to swing them up, and knock the ball back into the pegs before it gets away.",
    power: 'Flippers in the bottom corners for three shots; hold the button to swing them.',
  },
  spookyBall: {
    tagline: 'One more trip from the top',
    speech:
      "Boo! I'm the Pumpkin. After you light a green peg, a ball that drops off the bottom comes right back in at the top for one more run. The bucket stays closed until it returns, so let it fall!",
    power: 'A ball that falls out the bottom comes back in at the top once.',
  },
  flowerPower: {
    tagline: 'The nearest orange pegs bloom',
    speech:
      "Good morning, sunshine! I'm the Sunflower. When a green peg lights, the orange pegs closest to it burst into bloom: a fifth of all the orange pegs still standing, lit in one go.",
    power: 'Lights the nearest fifth of the orange pegs still on the board.',
  },
  luckySpin: {
    tagline: 'Spin the wheel, take the prize',
    speech:
      "Step right up! I'm the Rabbit. Every green peg spins my wheel. You might get a bigger ball, triple points, an extra ball, or another master's power. Every prize is a good one!",
    power: 'A wheel picks a bigger ball, triple score, an extra ball or another power.',
  },
  fireball: {
    tagline: 'Burn straight through',
    speech:
      "So, you've come this far. I am the Wyvern. A green peg sets your next ball on fire, and it burns through every peg in its way without a bounce. A metal dome covers the bucket, so plan your fall.",
    power: 'Your next ball burns through pegs without bouncing; a dome covers the bucket.',
  },
  zenBall: {
    tagline: 'The best shot nearby, found for you',
    speech:
      'Welcome, student. I am the Owl. Light a green peg and your next shot becomes a Zen shot: I look at the angles close to yours and fire the best one I find. Aim near something good, and let calm do the rest.',
    power: 'Your next shot fires at the best angle found close to your aim.',
  },
};

/** Stage 11 (spec 8): the player picks any master before each level. */
export const MASTER_LEVELS_COPY = {
  title: 'Master Levels',
  tagline: 'Every master is yours to choose',
  speech:
    "You've met all ten masters, and now the last boards are yours. Before each level, pick the master whose power fits it best. Any of them can come along.",
} as const;

const NUMBER_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
];

/** "Stage One" ... "Stage Eleven". */
export function stageName(stage: number): string {
  return `Stage ${NUMBER_WORDS[stage] ?? String(stage)}`;
}
