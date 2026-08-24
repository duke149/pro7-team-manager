import assert from "node:assert/strict";
import test from "node:test";

type AuthModule = typeof import("../lib/supabase/return-path");

async function loadAuthModule(): Promise<AuthModule> {
  const authModule = await import("../lib/supabase/return-path").catch(() => null);
  assert.ok(authModule, "the Supabase return-path helper must be available");
  return authModule;
}

test("preserves local return paths with search params and fragments", async () => {
  const { safeRelativeReturnPath } = await loadAuthModule();

  for (const value of [
    "/",
    "/squad",
    "/matches?tab=upcoming#week-2",
    "/%C4%91oi-hinh?filter=s%E1%BA%B5n-s%C3%A0ng",
  ]) {
    assert.equal(safeRelativeReturnPath(value), value);
  }
});

test("rejects absolute, protocol-relative, non-path, and malformed return values", async () => {
  const { safeRelativeReturnPath } = await loadAuthModule();

  for (const value of [
    "https://attacker.example/steal",
    "http://attacker.example/steal",
    "//attacker.example/steal",
    "/\\attacker.example/steal",
    "dashboard",
    "",
    "/%E0%A4%A",
    "/\u0000dashboard",
  ]) {
    assert.equal(safeRelativeReturnPath(value), "/", value);
  }
});

test("rejects Supabase and Sites reserved auth routes, including normalized variants", async () => {
  const { safeRelativeReturnPath } = await loadAuthModule();

  for (const value of [
    "/login",
    "/login/",
    "/login?next=%2Fdashboard",
    "/auth/callback",
    "/auth/callback/again",
    "/auth%2Fcallback",
    "/auth//callback",
    "/auth//callback/again",
    "/auth/%2Fcallback",
    "/auth/%2Fcallback/again",
    "/%2F/evil.example",
    "/signin-with-chatgpt",
    "/signin-with-chatgpt/again",
    "/signout-with-chatgpt",
    "/callback",
    "/dashboard/../login",
  ]) {
    assert.equal(safeRelativeReturnPath(value), "/", value);
  }
});

test("uses only a validated local fallback", async () => {
  const { safeRelativeReturnPath } = await loadAuthModule();

  assert.equal(
    safeRelativeReturnPath("https://attacker.example", "/matches?round=8"),
    "/matches?round=8",
  );
  assert.equal(
    safeRelativeReturnPath("https://attacker.example", "//attacker.example"),
    "/",
  );
});
