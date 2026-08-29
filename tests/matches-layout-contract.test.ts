import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadPro7CssFixture } from "./css-contract-helpers";

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

test("phone history metadata keeps date, venue, and home-away tag in aligned groups", async () => {
  const fixture = await loadPro7CssFixture({
    width: 369,
    body: '<main class="pro7-shell"><div class="match-history-meta"><span class="match-history-date">02:00 • 06/TH09</span><span class="meta-sep">•</span><span class="match-history-venue">Riverside Pitch</span><span class="meta-sep">•</span><span class="venue-tag">Sân nhà</span></div></main>',
  });
  try {
    const styles = (selector: string) => fixture.window.getComputedStyle(fixture.document.querySelector(selector)!);
    assert.equal(styles(".match-history-meta").display, "grid");
    assert.equal(styles(".meta-sep").display, "none");
    assert.equal(styles(".match-history-date").gridColumn, "1");
    assert.equal(styles(".match-history-venue").gridColumn, "2");
    assert.equal(styles(".venue-tag").gridColumn, "2");
  } finally {
    fixture.close();
  }
});
