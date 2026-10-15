// Worker thread of the self-play pool (pool.ts): plays batches of runs. The levels arrive once;
// each job names a level, a run setup and a range of runs, and comes back with the run results
// in run order. Runs are pure functions of their setup and index, so the split does not matter.

import { parentPort } from 'node:worker_threads';
import type { AgentSpec } from '../../src/agents/agent';
import { playRuns, type RunResult } from '../../src/agents/run';
import type { Level } from '../../src/level/schema';
import type { AttemptConfig } from '../../src/rules/config';
import { compileLevel, type CompiledLevel } from '../../src/sim/compile';

export interface JobSetup {
  readonly levelKey: string;
  readonly config: AttemptConfig;
  readonly anyMaster: boolean;
  readonly agent: AgentSpec;
  readonly baseSeed: number;
}

export type WorkerRequest =
  | { readonly type: 'levels'; readonly levels: readonly Level[] }
  | {
      readonly type: 'job';
      readonly job: number;
      readonly level: number;
      readonly setup: JobSetup;
      readonly first: number;
      readonly count: number;
    };

export interface WorkerReply {
  readonly job: number;
  readonly results: readonly RunResult[];
  /** Wall time of the job, ms (for the speed report only). */
  readonly ms: number;
}

let levels: readonly Level[] = [];
const compiled = new Map<number, CompiledLevel>();

function levelAt(index: number): CompiledLevel {
  let c = compiled.get(index);
  if (c === undefined) {
    const level = levels[index];
    if (level === undefined) throw new Error(`worker has no level ${index}`);
    c = compileLevel(level);
    compiled.set(index, c);
  }
  return c;
}

parentPort?.on('message', (msg: WorkerRequest) => {
  if (msg.type === 'levels') {
    levels = msg.levels;
    compiled.clear();
    return;
  }
  const start = performance.now();
  const results = playRuns({ ...msg.setup, level: levelAt(msg.level) }, msg.first, msg.count);
  const reply: WorkerReply = { job: msg.job, results, ms: performance.now() - start };
  parentPort?.postMessage(reply);
});
