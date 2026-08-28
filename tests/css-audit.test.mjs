import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadAudit() {
  try {
    return await import("../scripts/audit-pro7-css.mjs");
  } catch (error) {
    assert.fail(`CSS audit module is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

test("the CSS audit rejects off-brand declaration values", async () => {
  const { auditCss } = await loadAudit();
  assert.deepEqual(auditCss(".bad{color:#00e676;background:#0068ff;border-color:rgba(0,180,216,.15);outline-color:#f59e0b}"), [
    { property: "color", value: "#00e676" },
    { property: "background", value: "#0068ff" },
    { property: "border-color", value: "rgba(0,180,216,.15)" },
    { property: "outline-color", value: "#f59e0b" },
  ]);
  assert.deepEqual(auditCss(".ok{color:#d71935;background:#171719}"), []);
});

test("the production styles contain no forbidden accent declaration", async () => {
  const { auditCss } = await loadAudit();
  const css = (await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/responsive.css", import.meta.url), "utf8"),
    readFile(new URL("../app/typography.css", import.meta.url), "utf8"),
  ])).join("\n");
  assert.deepEqual(auditCss(css), []);
});
