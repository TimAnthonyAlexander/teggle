// Worker thread for the generator's checks: runs check jobs (src/gen/check.ts) for the main
// thread. A message carries the level and plan once per round, then job indices one at a time.

import { parentPort } from 'node:worker_threads';
import { runCheckJob, type CheckPlan } from '../src/gen/check';
import type { Level } from '../src/level/schema';
import { compileLevel, type CompiledLevel } from '../src/sim/compile';

export type WorkerRequest =
  | {
      readonly type: 'round';
      readonly round: number;
      readonly level: Level;
      readonly plan: CheckPlan;
    }
  | { readonly type: 'job'; readonly round: number; readonly job: number };

let round = -1;
let compiled: CompiledLevel | null = null;
let plan: CheckPlan | null = null;

parentPort?.on('message', (msg: WorkerRequest) => {
  if (msg.type === 'round') {
    round = msg.round;
    compiled = compileLevel(msg.level);
    plan = msg.plan;
    return;
  }
  if (msg.round !== round || compiled === null || plan === null) {
    throw new Error(`worker got job ${msg.job} for round ${msg.round} while on round ${round}`);
  }
  parentPort?.postMessage(runCheckJob(compiled, plan, msg.job));
});
