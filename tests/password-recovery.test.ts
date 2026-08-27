import assert from "node:assert/strict";
import test from "node:test";

import {
  passwordRecoveryRedirect,
  validateRecoveryEmail,
  validateResetPassword,
} from "../lib/account/password-recovery";

test("recovery email is normalized without exposing whether an account exists", () => {
  assert.deepEqual(validateRecoveryEmail("  TUAN.DAT@EXAMPLE.COM "), { ok: true, email: "tuan.dat@example.com" });
  assert.equal(validateRecoveryEmail("not-an-email").ok, false);
  assert.equal(validateRecoveryEmail("a".repeat(250) + "@example.com").ok, false);
});

test("reset password requires a strong exact confirmation", () => {
  assert.equal(validateResetPassword("short", "short").ok, false);
  assert.equal(validateResetPassword("Strong-demo-2026!", "different").ok, false);
  assert.deepEqual(validateResetPassword("Strong-demo-2026!", "Strong-demo-2026!"), { ok: true, password: "Strong-demo-2026!" });
});

test("password recovery callback is fixed to the local origin", () => {
  assert.equal(passwordRecoveryRedirect("http://localhost:3000"), "http://localhost:3000/auth/callback?next=%2Faccount%2Freset-password");
  assert.throws(() => passwordRecoveryRedirect("https://example.com/path"));
  assert.throws(() => passwordRecoveryRedirect("javascript:alert(1)"));
});
