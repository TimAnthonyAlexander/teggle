// Seeds of self-play runs. A run is a pure function of its setup and its index: its attempt seed
// (the color assignment, the purple peg, the coin flips) comes from the base seed, the level's
// key and the run index, and the agent's own random numbers from the attempt seed. So a run
// gives the same result whichever worker plays it, and run i of every agent tier and every
// noise level faces the same colors (common random numbers, which steadies comparisons).

import { Digest } from '../core/digest';

function u32(d: Digest): number {
  return Number.parseInt(d.hex().slice(0, 8), 16) >>> 0;
}

/** Seed of the attempt of run `run` on the level with this key. */
export function attemptSeed(baseSeed: number, levelKey: string, run: number): number {
  return u32(new Digest().string('attempt').int(baseSeed).string(levelKey).int(run));
}

/** Seed of the agent's own random numbers (angle offsets, aim error, random aims) in a run. */
export function agentSeed(attempt: number): number {
  return u32(new Digest().string('agent').int(attempt));
}

/** Seed of the master drawn for a run where the player picks one (the Master levels). */
export function masterSeed(attempt: number): number {
  return u32(new Digest().string('master').int(attempt));
}
