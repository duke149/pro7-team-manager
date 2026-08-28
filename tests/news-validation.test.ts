import assert from "node:assert/strict";
import test from "node:test";

import { parseManagedTeamNewsResponse } from "../lib/news/model";
import { validateNewsMutation } from "../lib/news/validation";

const ID = "00000000-0000-4000-8000-000000000201";
const TOKEN = "2026-10-01T08:00:00.000Z";

test("News validation accepts only exact bounded lifecycle intents", () => {
  assert.deepEqual(validateNewsMutation({ action: "create", title: "  Lịch tập tuần này  ", body: "  Toàn đội tập trung đúng giờ.  " }), { ok: true, value: { action: "create", title: "Lịch tập tuần này", body: "Toàn đội tập trung đúng giờ." } });
  assert.deepEqual(validateNewsMutation({ action: "update", id: ID, title: "Lịch tập cập nhật", body: "Tập trung lúc 19 giờ.", expectedUpdatedAt: TOKEN }), { ok: true, value: { action: "update", id: ID, title: "Lịch tập cập nhật", body: "Tập trung lúc 19 giờ.", expectedUpdatedAt: TOKEN } });
  assert.deepEqual(validateNewsMutation({ action: "publish", id: ID, expectedUpdatedAt: TOKEN }), { ok: true, value: { action: "publish", id: ID, expectedUpdatedAt: TOKEN } });
  assert.deepEqual(validateNewsMutation({ action: "archive", id: ID, expectedUpdatedAt: TOKEN }), { ok: true, value: { action: "archive", id: ID, expectedUpdatedAt: TOKEN } });
});

test("News validation rejects unknown keys, malformed identity/token, and unsafe text", () => {
  for (const value of [
    { action: "create", title: "Tin", body: "Nội dung", status: "published" },
    { action: "create", title: " ", body: "Nội dung" },
    { action: "create", title: "x".repeat(161), body: "Nội dung" },
    { action: "create", title: "Tin", body: "x".repeat(5001) },
    { action: "update", id: "bad", title: "Tin", body: "Nội dung", expectedUpdatedAt: TOKEN },
    { action: "publish", id: ID, expectedUpdatedAt: "bad" },
    { action: "archive", id: ID, expectedUpdatedAt: TOKEN, title: "extra" },
  ]) assert.equal(validateNewsMutation(value).ok, false);
});

test("News client response accepts only exact authoritative camel-case rows", () => {
  assert.deepEqual(parseManagedTeamNewsResponse({ ok: true, post: { id: ID, title: "Tin đội", body: "Nội dung thật", status: "published", publishedAt: TOKEN, updatedAt: TOKEN } }), {
    id: ID, title: "Tin đội", body: "Nội dung thật", status: "published", publishedAt: TOKEN, updatedAt: TOKEN,
  });
  for (const value of [
    { ok: true, post: { id: "bad", title: "Tin đội", body: "Nội dung thật", status: "draft", publishedAt: null, updatedAt: TOKEN } },
    { ok: true, post: { id: ID, title: " Tin đội ", body: "Nội dung thật", status: "draft", publishedAt: null, updatedAt: TOKEN } },
    { ok: true, post: { id: ID, title: "Tin đội", body: "Nội dung thật", status: "draft", publishedAt: TOKEN, updatedAt: TOKEN } },
    { ok: true, post: { id: ID, title: "Tin đội", body: "Nội dung thật", status: "published", publishedAt: null, updatedAt: TOKEN } },
    { ok: true, post: { id: ID, title: "Tin đội", body: "Nội dung thật", status: "archived", publishedAt: null, updatedAt: "2026-02-31T08:00:00.000Z" } },
    { ok: true, post: { id: ID, title: "Tin đội", body: "Nội dung thật", status: "archived", publishedAt: null, updatedAt: TOKEN, extra: true } },
  ]) assert.equal(parseManagedTeamNewsResponse(value), null);
});
