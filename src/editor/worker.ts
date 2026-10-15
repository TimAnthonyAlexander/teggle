// The editor's web worker: count fitting (src/gen/fit.ts) and the reachability and stuck check
// jobs (src/gen/check.ts), off the page's thread. A check round sends the level and plan once,
// then job indices one at a time, like the build's worker threads (tools/gen-worker.ts).

import { runCheckJob, type CheckPlan, type JobResult } from '../gen/check';
import { fitCount, type FitResult } from '../gen/fit';
import type { RecipeInput } from '../gen/recipe';
import type { Level } from '../level/schema';
import { compileLevel, type CompiledLevel } from '../sim/compile';

export type WorkerRequest =
  | {
      readonly type: 'fit';
      readonly id: number;
      readonly recipe: RecipeInput;
      readonly seed: number;
    }
  | {
      readonly type: 'round';
      readonly round: number;
      readonly level: Level;
      readonly plan: CheckPlan;
    }
  | { readonly type: 'job'; readonly round: number; readonly job: number };

export type WorkerReply =
  | { readonly type: 'fit'; readonly id: number; readonly result: FitResult }
  | { readonly type: 'fitError'; readonly id: number; readonly message: string }
  | { readonly type: 'job'; readonly result: JobResult };

interface Scope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerReply): void;
}

const scope = globalThis as unknown as Scope;
let round = -1;
let compiled: CompiledLevel | null = null;
let plan: CheckPlan | null = null;

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'fit') {
    try {
      scope.postMessage({ type: 'fit', id: msg.id, result: fitCount(msg.recipe, msg.seed) });
    } catch (err) {
      scope.postMessage({
        type: 'fitError',
        id: msg.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }
  if (msg.type === 'round') {
    round = msg.round;
    compiled = compileLevel(msg.level);
    plan = msg.plan;
    return;
  }
  if (msg.round !== round || compiled === null || plan === null) {
    throw new Error(`worker got job ${msg.job} for round ${msg.round} while on round ${round}`);
  }
  scope.postMessage({ type: 'job', result: runCheckJob(compiled, plan, msg.job) });
};
