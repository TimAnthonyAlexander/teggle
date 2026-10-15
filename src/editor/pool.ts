// Workers for the editor: one that fits recipes to their count while the user edits (only the
// newest request matters), and a pool that runs the check jobs, as many at once as the machine
// has cores to spare. Results come back in job order, so the merged check is the same as the
// build's whatever ran where.

import type { CheckPlan, JobResult } from '../gen/check';
import type { FitResult } from '../gen/fit';
import type { JobRunner } from '../gen/fix';
import type { RecipeInput } from '../gen/recipe';
import type { Level } from '../level/schema';
import type { WorkerReply, WorkerRequest } from './worker';

function spawn(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

function post(w: Worker, msg: WorkerRequest): void {
  w.postMessage(msg);
}

/** Fits recipes on a worker; a newer request makes older pending ones resolve to null. */
export class Fitter {
  private worker: Worker | null = null;
  private next = 1;
  private pending: {
    id: number;
    resolve: (r: FitResult | null) => void;
    reject: (e: Error) => void;
  } | null = null;

  fit(recipe: RecipeInput, seed: number): Promise<FitResult | null> {
    this.worker ??= this.start();
    this.pending?.resolve(null);
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject };
      if (this.worker !== null) post(this.worker, { type: 'fit', id, recipe, seed });
    });
  }

  private start(): Worker {
    const w = spawn();
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      const msg = e.data;
      const p = this.pending;
      if (p === null || msg.type === 'job' || msg.id !== p.id) return;
      this.pending = null;
      if (msg.type === 'fit') p.resolve(msg.result);
      else p.reject(new Error(msg.message));
    };
    w.onerror = (e) => {
      this.pending?.reject(new Error(e.message));
      this.pending = null;
    };
    return w;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending?.resolve(null);
    this.pending = null;
  }
}

export interface CheckProgress {
  readonly round: number;
  readonly done: number;
  readonly total: number;
}

/** Runs check jobs on a pool of workers; `runner` is what checkAndFix takes. */
export class CheckPool {
  private readonly workers: Worker[];
  private round = 0;
  private stopped = false;
  private readonly aborts = new Set<(e: Error) => void>();

  constructor(
    size: number,
    private readonly onProgress: (p: CheckProgress) => void,
  ) {
    this.workers = Array.from({ length: Math.max(1, size) }, spawn);
  }

  /** Workers to use: the cores the browser reports, one left for the page, at most 8. */
  static defaultSize(): number {
    return Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1));
  }

  readonly runner: JobRunner = (level, plan) => this.run(level, plan);

  private async run(level: Level, plan: CheckPlan): Promise<JobResult[]> {
    const round = ++this.round;
    const results = new Array<JobResult>(plan.jobs.length);
    let next = 0;
    let done = 0;
    this.onProgress({ round, done, total: plan.jobs.length });
    await Promise.all(
      this.workers.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            this.aborts.add(reject);
            const send = (): void => {
              if (this.stopped) {
                reject(new Error('The check was stopped.'));
                return;
              }
              if (next >= plan.jobs.length) {
                this.aborts.delete(reject);
                resolve();
                return;
              }
              post(w, { type: 'job', round, job: next++ });
            };
            w.onmessage = (e: MessageEvent<WorkerReply>) => {
              if (e.data.type !== 'job') return;
              results[e.data.result.job] = e.data.result;
              done++;
              this.onProgress({ round, done, total: plan.jobs.length });
              send();
            };
            w.onerror = (e) => {
              reject(new Error(e.message));
            };
            post(w, { type: 'round', round, level, plan });
            send();
          }),
      ),
    );
    return results;
  }

  dispose(): void {
    this.stopped = true;
    for (const w of this.workers) w.terminate();
    for (const abort of this.aborts) abort(new Error('The check was stopped.'));
    this.aborts.clear();
  }
}
