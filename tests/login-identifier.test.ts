import assert from "node:assert/strict";
import test from "node:test";

import { normalizeLoginIdentifier } from "../lib/account/login-identifier";

test("PRO7 usernames map to reserved internal emails without replacing visible input", () => {
  assert.deepEqual(normalizeLoginIdentifier("  DucLee  "), {
    ok: true,
    authEmail: "duclee@pro7.test",
    visibleIdentifier: "DucLee",
    kind: "username",
  });
  assert.deepEqual(normalizeLoginIdentifier("DATLT"), {
    ok: true,
    authEmail: "datlt@pro7.test",
    visibleIdentifier: "DATLT",
    kind: "username",
  });
});

test("ordinary email login remains normalized and does not enter the username namespace", () => {
  assert.deepEqual(normalizeLoginIdentifier("  PRO7.DEMO.20260825@GMAIL.COM  "), {
    ok: true,
    authEmail: "pro7.demo.20260825@gmail.com",
    visibleIdentifier: "PRO7.DEMO.20260825@GMAIL.COM",
    kind: "email",
  });
});

test("login identifiers reject blank, malformed, Unicode, punctuated, and out-of-bound usernames", () => {
  assert.deepEqual(normalizeLoginIdentifier("   "), { ok: false, code: "required" });
  for (const value of ["ab", "a".repeat(33), "đứclee", "duc lee", "duc.lee", "duc_lee", "@pro7.test", "a@b", "a@@b.com"]) {
    assert.deepEqual(normalizeLoginIdentifier(value), { ok: false, code: "format" }, value);
  }
});
