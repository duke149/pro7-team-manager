import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("match history uses a bounded content/action grid and collapses cleanly on mobile", async () => {
  const [css, responsive] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/responsive.css", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.match-history-card\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/u);
  assert.match(css, /\.match-history-actions\s*\{[^}]*align-self:\s*center/u);
  assert.match(css, /\.completed-match-admin\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u);
  assert.match(responsive, /\.match-history-card\{display:grid;grid-template-columns:1fr/u);
  assert.match(responsive, /\.match-history-actions\{display:grid;grid-template-columns:1fr 1fr;width:100%/u);
});
