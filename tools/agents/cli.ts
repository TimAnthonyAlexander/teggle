// Command-line helpers the self-play tools share.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { agentLabel } from '../../src/agents/agent';
import type { Measured } from './measure';

/** Where the tools write their JSON (gitignored with the rest of reference/). */
export const METRICS_DIR = 'reference/teggle-metrics';

export class UsageError extends Error {
  override readonly name = 'UsageError';
}

export function intOption(
  value: string | undefined,
  name: string,
  min: number,
): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    throw new UsageError(`--${name} needs an integer of at least ${min}`);
  }
  return n;
}

export function listOption(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export function noiseList(value: string | undefined, fallback: readonly number[]): number[] {
  const list = listOption(value).map(Number);
  if (list.some((x) => !Number.isFinite(x) || x < 0 || x > 1)) {
    throw new UsageError('--noise needs numbers from 0 to 1 (radians)');
  }
  return list.length > 0 ? list : fallback.slice();
}

/** Local time as a file-name stamp: 20261015-041203. */
export function stamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `${day}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Local date, YYYY-MM-DD. */
export function isoDay(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

/** The JSON record of one measured (level, agent) pair, without the per-run lists. */
export function measuredJson(m: Measured): Record<string, unknown> {
  return {
    level: m.target.key,
    source: m.target.source,
    stage: m.target.stage,
    number: m.target.number,
    agent: m.agent,
    agentLabel: agentLabel(m.agent),
    config: m.config,
    anyMaster: m.anyMaster,
    metrics: m.metrics,
  };
}

/** Runs a tool's main function, printing a failure as one line and exiting with status 1. */
export function runMain(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exit(1);
  });
}
