// DEV ONLY: the page script of tests/browser/checks.html, which the cross-browser determinism
// test loads (tests/browser/determinism.spec.ts). It exposes the same digest code that
// tools/engine-digest.ts runs in Node and Bun, and the replay of attempts recorded in Node, so
// each browser engine's bits can be compared with Node's. Never part of the game's build.

import { engineDigests, replayDigest } from '../fixtures/browser-checks';

Object.assign(window, { __teggleChecks: { engineDigests, replayDigest } });
document.documentElement.dataset.ready = '1';
