// Prints one digest over the golden physics scenarios (tests/fixtures/golden.ts). Every JS
// engine must print the same value; `npm run test:engines` compares Node (V8) and Bun
// (JavaScriptCore).

import { engineDigest } from '../tests/fixtures/golden';

console.log(engineDigest());
