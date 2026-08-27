import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("login exposes an accessible password toggle and forgot-password route", async () => {
  const source = await readFile(new URL("../app/login/login-form.tsx", import.meta.url), "utf8");
  assert.match(source, /showPassword/u);
  assert.match(source, /aria-pressed=\{showPassword\}/u);
  assert.match(source, /href="\/account\/forgot-password"/u);
});

test("forgot and reset pages use the Supabase recovery APIs with neutral feedback", async () => {
  const [forgot, reset] = await Promise.all([
    readFile(new URL("../app/account/forgot-password/forgot-password-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/reset-password/reset-password-form.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(forgot, /resetPasswordForEmail/u);
  assert.match(forgot, /Nếu email tồn tại/u);
  assert.match(reset, /updateUser/u);
  assert.match(reset, /validateResetPassword/u);
});

test("temporary-password success establishes a fresh session with the new password", async () => {
  const source = await readFile(new URL("../app/account/change-password/change-password-form.tsx", import.meta.url), "utf8");
  assert.match(source, /signInWithPassword\(\{\s*email:\s*user\.email,\s*password:\s*newPassword/u);
  assert.doesNotMatch(source, /refreshSession\(/u);
});
