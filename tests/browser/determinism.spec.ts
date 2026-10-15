// Spec 13.4 acceptance in the target browsers (14.1): the physics, rules and power digests that
// Node and Bun agree on (`npm run test:engines`) come out bit for bit the same in Chromium,
// WebKit and Firefox, and attempts with every power recorded in Node replay in each browser to
// the identical events, score and tick.

import { expect, test, type Page } from '@playwright/test';
import {
  engineDigests,
  recordedAttempts,
  replayDigest,
  type EngineDigests,
  type RecordedAttempt,
} from '../fixtures/browser-checks';

interface Checks {
  engineDigests(): EngineDigests;
  replayDigest(r: RecordedAttempt): string;
}

declare global {
  interface Window {
    __teggleChecks?: Checks;
  }
}

async function openChecks(page: Page): Promise<void> {
  await page.goto('/tests/browser/checks.html');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
}

test('the engine digests match Node bit for bit', async ({ page }) => {
  const node = engineDigests();
  await openChecks(page);
  const browser = await page.evaluate(() => {
    const checks = window.__teggleChecks;
    if (checks === undefined) throw new Error('the checks page did not load');
    return checks.engineDigests();
  });
  expect(browser).toEqual(node);
});

test('attempts with every power recorded in Node replay identically', async ({ page }) => {
  const recorded = recordedAttempts();
  // The records cross as JSON, as a save file or a shared replay would.
  const records = JSON.parse(JSON.stringify(recorded)) as RecordedAttempt[];
  const node = Object.fromEntries(records.map((r) => [r.name, replayDigest(r)]));
  await openChecks(page);
  const browser = await page.evaluate((rs) => {
    const checks = window.__teggleChecks;
    if (checks === undefined) throw new Error('the checks page did not load');
    return Object.fromEntries(rs.map((r) => [r.name, checks.replayDigest(r)]));
  }, records);
  expect(browser).toEqual(node);
  expect(Object.keys(browser)).toHaveLength(10);
});
