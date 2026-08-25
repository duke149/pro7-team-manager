import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTeamSlug, validateTeamSlug } from "../lib/teams/slug";

test("normalizeTeamSlug removes Vietnamese diacritics and lowercases words", () => {
  assert.equal(normalizeTeamSlug("  Đội Bóng Số 7  "), "doi-bong-so-7");
});

test("normalizeTeamSlug folds repeated separators and trims punctuation", () => {
  assert.equal(normalizeTeamSlug("---FC---DUKE---"), "fc-duke");
  assert.equal(normalizeTeamSlug("  FC___Duke!!!  "), "fc-duke");
});

test("validateTeamSlug rejects empty, reserved, and overlong slugs", () => {
  assert.deepEqual(validateTeamSlug("---"), { ok: false, code: "empty" });
  assert.deepEqual(validateTeamSlug("setup"), { ok: false, code: "reserved" });
  assert.deepEqual(validateTeamSlug("account"), { ok: false, code: "reserved" });
  assert.deepEqual(validateTeamSlug("api"), { ok: false, code: "reserved" });
  assert.deepEqual(validateTeamSlug("login"), { ok: false, code: "reserved" });
  assert.deepEqual(validateTeamSlug("auth"), { ok: false, code: "reserved" });
  assert.deepEqual(validateTeamSlug("a".repeat(49)), { ok: false, code: "length" });
});

test("validateTeamSlug returns the normalized valid slug within 48 characters", () => {
  assert.deepEqual(validateTeamSlug("  ĐỘI-BÓNG  "), {
    ok: true,
    slug: "doi-bong",
  });
  assert.deepEqual(validateTeamSlug("a".repeat(48)), {
    ok: true,
    slug: "a".repeat(48),
  });
});
