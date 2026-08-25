import assert from "node:assert/strict";
import test from "node:test";

import { validateNewPassword } from "../lib/account/password";

test("validateNewPassword rejects passwords shorter than twelve characters", () => {
  assert.deepEqual(
    validateNewPassword({
      password: "Aa1!short",
      email: "member@example.com",
      temporaryPassword: "Temporary-1!",
    }),
    { ok: false, code: "length" },
  );
});

test("validateNewPassword rejects passwords missing a required character class", () => {
  for (const password of [
    "lowercase1!xx",
    "UPPERCASE1!XX",
    "NoDigitsHere!",
    "NoSymbol12345",
  ]) {
    assert.deepEqual(
      validateNewPassword({
        password,
        email: "member@example.com",
        temporaryPassword: "Temporary-1!",
      }),
      { ok: false, code: "complexity" },
      password,
    );
  }
});

test("validateNewPassword rejects a password containing the normalized email local part", () => {
  assert.deepEqual(
    validateNewPassword({
      password: "Member.Name1!",
      email: "Member.Name@example.com",
      temporaryPassword: "Temporary-1!",
    }),
    { ok: false, code: "email" },
  );
});

test("validateNewPassword rejects reusing the temporary password", () => {
  assert.deepEqual(
    validateNewPassword({
      password: "Temporary-1!",
      email: "member@example.com",
      temporaryPassword: "Temporary-1!",
    }),
    { ok: false, code: "unchanged" },
  );
});

test("validateNewPassword reports unchanged before any other policy failure", () => {
  assert.deepEqual(
    validateNewPassword({
      password: "short",
      email: "member@example.com",
      temporaryPassword: "short",
    }),
    { ok: false, code: "unchanged" },
  );
});

test("validateNewPassword normalizes Unicode and uses deterministic case folding for email checks", () => {
  assert.deepEqual(
    validateNewPassword({
      password: "member-Aa1!xyz",
      email: "ＭＥＭＢＥＲ@example.com",
      temporaryPassword: "Temporary-1!",
    }),
    { ok: false, code: "email" },
  );
});

test("validateNewPassword accepts a sufficiently strong unrelated password", () => {
  assert.deepEqual(
    validateNewPassword({
      password: "Violet-Cedar9!",
      email: "member@example.com",
      temporaryPassword: "Temporary-1!",
    }),
    { ok: true },
  );
});
