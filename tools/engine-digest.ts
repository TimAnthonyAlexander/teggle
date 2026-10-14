// Prints the digests over the golden physics scenarios (tests/fixtures/golden.ts) and the golden
// rules attempts (tests/fixtures/rules-golden.ts). Every JS engine must print the same line;
// `npm run test:engines` compares Node (V8) and Bun (JavaScriptCore).

import { engineDigest } from '../tests/fixtures/golden';
import { rulesDigest } from '../tests/fixtures/rules-golden';

console.log(`sim ${engineDigest()} rules ${rulesDigest()}`);
