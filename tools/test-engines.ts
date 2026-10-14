// Runs tools/engine-digest.ts under Node (V8, through tsx) and Bun (JavaScriptCore) and fails
// unless both print the same digest (spec 13.4).

import { execFileSync } from 'node:child_process';

const script = 'tools/engine-digest.ts';
const runs: [string, string, string[]][] = [
  ['node (V8)', process.execPath, ['--import', 'tsx', script]],
  ['bun (JavaScriptCore)', 'bun', [script]],
];

const results = runs.map(([name, command, args]) => {
  try {
    return { name, digest: execFileSync(command, args, { encoding: 'utf8' }).trim() };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`${name}: failed to run (${reason})`);
    process.exit(1);
  }
});

for (const r of results) console.log(`${r.name.padEnd(22)} ${r.digest}`);
const first = results[0]?.digest;
if (first === undefined || first === '' || results.some((r) => r.digest !== first)) {
  console.error('Engines disagree: the simulation is not deterministic across engines.');
  process.exit(1);
}
console.log('All engines agree.');
