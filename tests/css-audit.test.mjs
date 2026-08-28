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

test("the responsive audit rejects shell rules outside the approved ranges", async () => {
  const { auditResponsiveShell } = await loadAudit();
  assert.equal(typeof auditResponsiveShell, "function");
  assert.deepEqual(auditResponsiveShell("@media(max-width:900px){.sidebar{display:none}}"), ["max-width:900px"]);
  assert.deepEqual(auditResponsiveShell("@media(max-width:1023px){.sidebar{display:none}}@media(max-width:767px){.mobile-nav{display:grid}}"), []);
});

test("the production shell uses only the approved responsive ranges", async () => {
  const { auditResponsiveShell } = await loadAudit();
  assert.equal(typeof auditResponsiveShell, "function");
  const css = (await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/responsive.css", import.meta.url), "utf8"),
  ])).join("\n");
  assert.deepEqual(auditResponsiveShell(css), []);
});

test("legacy shell cleanup preserves component rules and non-shell selectors", async () => {
  const { stripLegacyShellRules } = await loadAudit();
  assert.equal(typeof stripLegacyShellRules, "function");
  const input = [
    ".base{color:red}",
    "@media(max-width:760px){.sidebar{display:none}.view-stack{gap:14px}.app-main,.feature-panel{margin:0}}",
    "@media(max-width:900px){.page-content{padding:12px}.match-detail-grid{grid-template-columns:1fr}}",
    "@media(max-width:767px){.mobile-nav{display:grid}}",
  ].join("");
  assert.equal(
    stripLegacyShellRules(input),
    [
      ".base{color:red}",
      "@media(max-width:760px){.view-stack{gap:14px}.feature-panel{margin:0}}",
      "@media(max-width:900px){.match-detail-grid{grid-template-columns:1fr}}",
      "@media(max-width:767px){.mobile-nav{display:grid}}",
    ].join(""),
  );
});
