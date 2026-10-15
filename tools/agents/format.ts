// Plain-text tables for the self-play tools.

import type { LevelMetrics } from '../../src/agents/metrics';

export function pct(x: number, digits = 0): string {
  return Number.isFinite(x) ? `${(100 * x).toFixed(digits)}%` : '-';
}

export function fixed(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined || !Number.isFinite(x) ? '-' : x.toFixed(digits);
}

export function thousands(x: number): string {
  return Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '-';
}

/** Left-aligns the first `left` columns, right-aligns the rest; two spaces between columns. */
export function table(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  left = 2,
): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: readonly string[]): string =>
    cells
      .map((c, i) => (i < left ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0)))
      .join('  ')
      .trimEnd();
  const rule = widths.map((w) => '-'.repeat(w)).join('  ');
  return [line(header), rule, ...rows.map(line)].join('\n');
}

export const METRIC_HEADER = [
  'Level',
  'Agent',
  'Runs',
  'Clear',
  '95% CI',
  'Balls',
  'Free',
  'B/T/C/P',
  'Left',
  'Dead',
  'Cover',
  'Stuck',
  'Score',
  'Full',
  'Center',
] as const;

/** One table row: a level and an agent. */
export function metricRow(level: string, agent: string, m: LevelMetrics): string[] {
  const f = m.freeBalls;
  return [
    level,
    agent,
    String(m.runs),
    pct(m.clearRate),
    `${pct(m.clearCi.low)}-${pct(m.clearCi.high)}`,
    m.ballsUsed === null ? '-' : fixed(m.ballsUsed.median, 0),
    fixed(f.total, 2),
    [f.bucket, f.threshold, f.coinFlip, f.power].map((x) => fixed(x, 1)).join('/'),
    fixed(m.orangeLeftOnFailure?.mean),
    pct(m.deadShotShare),
    pct(m.coverage.share),
    fixed(m.stuckPerRun, 2),
    thousands(m.score.median),
    pct(m.fullClearRate),
    m.wins > 0 ? pct(m.feverCenterShare) : '-',
  ];
}

export const METRIC_LEGEND = [
  'Clear: share of runs that cleared every orange peg, with its 95% Wilson interval.',
  'Balls: median balls used in cleared runs. Free: free balls per run, by kind B/T/C/P',
  '(bucket, score threshold, coin flip, power). Left: orange pegs left when a run failed.',
  'Dead: shots that lit no orange peg. Cover: can-be-orange pegs lit at least once over all',
  'runs. Stuck: stuck-ball removals per run. Score: median final score. Full: full clears.',
  'Center: cleared runs whose Fever ball found the center bucket.',
].join('\n');
