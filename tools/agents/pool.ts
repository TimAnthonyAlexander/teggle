// A pool of worker threads for self-play (worker.ts), and the batch runner the report, the bands
// and the calibration share. A batch is a list of tasks (a level, a run setup, a number of runs);
// it is cut into jobs of a few runs that go out as workers come free, and the results are put
// back in run order, so they are the same whatever ran where and however the jobs were cut.

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { RunResult } from '../../src/agents/run';
import type { Level } from '../../src/level/schema';
import type { JobSetup, WorkerReply, WorkerRequest } from './worker';

export interface Task {
  /** Index into the batch's levels. */
  readonly level: number;
  readonly setup: JobSetup;
  readonly runs: number;
}

export interface BatchStats {
  readonly runs: number;
  /** Simulated ticks of real and trial shots. */
  readonly ticks: number;
  readonly wallMs: number;
  /** Summed job time in the workers. */
  readonly workMs: number;
}

/** Runs per job: small enough to balance the load, large enough to keep messages rare. */
const JOB_RUNS = 4;

export function defaultWorkers(): number {
  return availableParallelism();
}

export class AgentPool {
  private readonly workers: Worker[];

  constructor(readonly size: number) {
    // Workers do not inherit tsx's loader; a small ES module bootstrap registers it first.
    const entry = new URL('./worker.ts', import.meta.url).href;
    const tsx = import.meta.resolve('tsx/esm/api');
    const bootstrap = `import { register } from ${JSON.stringify(tsx)}; register(); await import(${JSON.stringify(entry)});`;
    const url = new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`);
    this.workers = Array.from({ length: size }, () => new Worker(url));
  }

  /**
   * Plays every task's runs; returns each task's results in run order. `progress` hears the
   * runs done so far after every job.
   */
  async run(
    levels: readonly Level[],
    tasks: readonly Task[],
    progress?: (done: number, total: number) => void,
  ): Promise<{ results: RunResult[][]; stats: BatchStats }> {
    const jobs: { task: number; first: number; count: number }[] = [];
    tasks.forEach((t, task) => {
      for (let first = 0; first < t.runs; first += JOB_RUNS) {
        jobs.push({ task, first, count: Math.min(JOB_RUNS, t.runs - first) });
      }
    });
    const total = tasks.reduce((sum, t) => sum + t.runs, 0);
    const results: RunResult[][] = tasks.map((t) => new Array<RunResult>(t.runs));
    const start = performance.now();
    let workMs = 0;
    let done = 0;
    let next = 0;
    const init: WorkerRequest = { type: 'levels', levels };
    await Promise.all(
      this.workers.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            const send = (): void => {
              const job = jobs[next];
              if (job === undefined) {
                w.off('message', onMessage);
                w.off('error', reject);
                resolve();
                return;
              }
              const task = tasks[job.task];
              if (task === undefined) throw new Error(`job ${next} has no task`);
              const msg: WorkerRequest = {
                type: 'job',
                job: next++,
                level: task.level,
                setup: task.setup,
                first: job.first,
                count: job.count,
              };
              w.postMessage(msg);
            };
            const onMessage = (reply: WorkerReply): void => {
              const job = jobs[reply.job];
              const into = job === undefined ? undefined : results[job.task];
              if (job === undefined || into === undefined) {
                reject(new Error(`worker answered unknown job ${reply.job}`));
                return;
              }
              reply.results.forEach((r, k) => (into[job.first + k] = r));
              workMs += reply.ms;
              done += reply.results.length;
              progress?.(done, total);
              send();
            };
            w.on('message', onMessage);
            w.on('error', reject);
            w.postMessage(init);
            send();
          }),
      ),
    );
    let ticks = 0;
    for (const list of results) for (const r of list) ticks += r.ticks + r.searchTicks;
    return {
      results,
      stats: { runs: total, ticks, wallMs: performance.now() - start, workMs },
    };
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

/** A progress line on stderr, rewritten in place on a terminal. */
export function progressLine(label: string): (done: number, total: number) => void {
  let last = 0;
  return (done, total) => {
    const now = performance.now();
    if (done < total && now - last < 500) return;
    last = now;
    const line = `${label}: ${done}/${total} runs`;
    if (process.stderr.isTTY) process.stderr.write(`\r${line}${done === total ? '\n' : ''}`);
    else if (done === total) process.stderr.write(`${line}\n`);
  };
}
