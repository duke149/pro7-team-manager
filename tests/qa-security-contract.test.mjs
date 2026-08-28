import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const qaOnlyScripts = new Set([
  "scripts/capture-analysis-full.mjs",
  "scripts/capture-audit-fixed.mjs",
  "scripts/capture-detail-pages.mjs",
  "scripts/capture-improvements.mjs",
  "scripts/capture-new-header.mjs",
  "scripts/capture-review.mjs",
  "scripts/capture-rewind-reference.mjs",
  "scripts/capture-rewind-results.mjs",
  "scripts/capture-squad-test.mjs",
  "scripts/capture-tactics-board.mjs",
  "scripts/capture-updates.mjs",
  "scripts/capture-viewport-mobile.mjs",
  "scripts/check-matches.mjs",
  "scripts/check-players.mjs",
  "scripts/cleanup-test-players.mjs",
  "scripts/complete-and-capture.mjs",
  "scripts/complete-fca2-match.mjs",
  "scripts/debug-browser-login.mjs",
  "scripts/demo-match-flow.mjs",
  "scripts/full-crawler-capture.mjs",
  "scripts/inspect-flow.mjs",
  "scripts/set-attendance.mjs",
  "scripts/test-auth.mjs",
]);

test("unit discovery is rooted at tests and excludes manual scripts", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["test:unit"], "node scripts/run-unit-tests.mjs");
  const runner = await readFile(new URL("../scripts/run-unit-tests.mjs", import.meta.url), "utf8");
  assert.match(runner, /requested\.length > 0 \? requested : discoverTests\(\)/u);
  assert.match(runner, /entry\.name\.endsWith\("\.test\.ts"\).*entry\.name\.endsWith\("\.test\.mjs"\)/su);
  assert.doesNotMatch(runner, /signInWithPassword|SUPABASE|https?:\/\//u);
});

test("QA branch does not retain credential-bearing automation", async () => {
  for (const file of qaOnlyScripts) {
    await assert.rejects(access(new URL(`../${file}`, import.meta.url)));
  }
});

test("QA handoff contains no reusable password", async () => {
  const handoff = await readFile(new URL("../QA_CHANGELOG.md", import.meta.url), "utf8");
  assert.doesNotMatch(handoff, /(?:password|mật khẩu)\s*[:/]?\s*`[^`]+`|tài khoản:[^\n]*\/\s*`[^`]+`/iu);
});
