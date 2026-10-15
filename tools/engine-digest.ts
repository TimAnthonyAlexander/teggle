// Prints the digests over the golden physics scenarios (tests/fixtures/golden.ts), the golden
// rules attempts (tests/fixtures/rules-golden.ts), the golden power attempts
// (tests/fixtures/powers-golden.ts), the golden self-play runs (tests/fixtures/agents-golden.ts)
// and the golden shots on followPath movements (tests/fixtures/movers-golden.ts). Every JS engine
// must print the same line; `npm run test:engines` compares Node (V8) and Bun (JavaScriptCore).

import { agentsDigest } from '../tests/fixtures/agents-golden';
import { engineDigest } from '../tests/fixtures/golden';
import { moversDigest } from '../tests/fixtures/movers-golden';
import { powersDigest } from '../tests/fixtures/powers-golden';
import { rulesDigest } from '../tests/fixtures/rules-golden';

console.log(
  `sim ${engineDigest()} rules ${rulesDigest()} powers ${powersDigest()} agents ${agentsDigest()} movers ${moversDigest()}`,
);
