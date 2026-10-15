// A pool of worker threads for the generator's reachability and stuck checks (src/gen/check.ts).
// Jobs go out one at a time as workers come free; results come back in job order, so the merged
// result is the same whatever ran where.

import { Worker } from 'node:worker_threads';
import type { CheckPlan, JobResult } from '../src/gen/check';
import type { Level } from '../src/level/schema';
import type { WorkerRequest } from './gen-worker';

export class CheckPool {
  private readonly workers: Worker[];
  private round = 0;

  constructor(size: number) {
    // Workers do not inherit tsx's loader; a small ES module bootstrap registers it first.
    const entry = new URL('./gen-worker.ts', import.meta.url).href;
    const tsx = import.meta.resolve('tsx/esm/api');
    const bootstrap = `import { register } from ${JSON.stringify(tsx)}; register(); await import(${JSON.stringify(entry)});`;
    const url = new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`);
    this.workers = Array.from({ length: size }, () => new Worker(url));
  }

  async run(level: Level, plan: CheckPlan): Promise<JobResult[]> {
    const round = ++this.round;
    const results: JobResult[] = new Array<JobResult>(plan.jobs.length);
    let next = 0;
    await Promise.all(
      this.workers.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            const send = (): void => {
              if (next >= plan.jobs.length) {
                w.off('message', onMessage);
                w.off('error', reject);
                resolve();
                return;
              }
              const msg: WorkerRequest = { type: 'job', round, job: next++ };
              w.postMessage(msg);
            };
            const onMessage = (r: JobResult): void => {
              results[r.job] = r;
              send();
            };
            w.on('message', onMessage);
            w.on('error', reject);
            const init: WorkerRequest = { type: 'round', round, level, plan };
            w.postMessage(init);
            send();
          }),
      ),
    );
    return results;
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}
