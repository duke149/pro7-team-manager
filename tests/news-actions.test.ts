import assert from "node:assert/strict";
import test from "node:test";

import { mutateTeamNews } from "../lib/news/actions";

const TEAM = "00000000-0000-4000-8000-000000000001";
const ID = "00000000-0000-4000-8000-000000000201";
const TOKEN = "2026-10-01T08:00:00.000Z";
const NEXT = "2026-10-01T08:00:01.000Z";

function request(method: "POST" | "PATCH", body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/teams/pro7-fc/news", { method, headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}

function dependencies(result: { data: unknown; error: null | { code?: string } }, allow = true) {
  const permissions: string[] = []; const calls: unknown[] = [];
  return {
    permissions, calls,
    value: {
      requireTeamPermission: async (_slug: string, permission: string) => { permissions.push(permission); return allow ? { userId: "actor", team: { id: TEAM, name: "PRO7", slug: "pro7-fc" }, membership: { roleName: "Admin" }, permissions: [permission] } : null; },
      supabase: { rpc(name: string, args: unknown) { calls.push({ name, args }); return Promise.resolve(result); } },
    },
  };
}

test("News create and update call one exact team-bound RPC and return authoritative rows", async () => {
  const createdRow = { id: ID, title: "Tin mới", body: "Nội dung thật", status: "draft", published_at: null, updated_at: TOKEN };
  const create = dependencies({ data: [createdRow], error: null });
  const createResponse = await mutateTeamNews(request("POST", { action: "create", title: "Tin mới", body: "Nội dung thật" }), "pro7-fc", create.value as never);
  assert.equal(createResponse.status, 201);
  assert.deepEqual(create.permissions, ["news.manage"]);
  assert.deepEqual(create.calls, [{ name: "manage_team_news", args: { p_team_id: TEAM, p_action: "create", p_news_id: null, p_title: "Tin mới", p_body: "Nội dung thật", p_expected_updated_at: null } }]);
  assert.deepEqual(await createResponse.json(), { ok: true, post: { id: ID, title: "Tin mới", body: "Nội dung thật", status: "draft", publishedAt: null, updatedAt: TOKEN } });

  const update = dependencies({ data: [{ ...createdRow, title: "Tin cập nhật", updated_at: NEXT }], error: null });
  const updateResponse = await mutateTeamNews(request("PATCH", { action: "update", id: ID, title: "Tin cập nhật", body: "Nội dung thật", expectedUpdatedAt: TOKEN }), "pro7-fc", update.value as never);
  assert.equal(updateResponse.status, 200);
  assert.deepEqual(update.calls[0], { name: "manage_team_news", args: { p_team_id: TEAM, p_action: "update", p_news_id: ID, p_title: "Tin cập nhật", p_body: "Nội dung thật", p_expected_updated_at: TOKEN } });
});

test("News lifecycle, stale, permission, and malformed success fail closed", async () => {
  const publish = dependencies({ data: [{ id: ID, title: "Tin", body: "Nội dung", status: "published", published_at: NEXT, updated_at: NEXT }], error: null });
  assert.equal((await mutateTeamNews(request("PATCH", { action: "publish", id: ID, expectedUpdatedAt: TOKEN }), "pro7-fc", publish.value as never)).status, 200);
  assert.deepEqual(publish.calls[0], { name: "manage_team_news", args: { p_team_id: TEAM, p_action: "publish", p_news_id: ID, p_title: null, p_body: null, p_expected_updated_at: TOKEN } });
  for (const [code, status] of [["40001", 409], ["55000", 409], ["P0002", 404], ["42501", 403], ["22023", 422], ["XX000", 500]] as const) {
    const fixture = dependencies({ data: null, error: { code } });
    assert.equal((await mutateTeamNews(request("PATCH", { action: "archive", id: ID, expectedUpdatedAt: TOKEN }), "pro7-fc", fixture.value as never)).status, status);
  }
  const malformed = dependencies({ data: [{ id: "bad" }], error: null });
  assert.equal((await mutateTeamNews(request("PATCH", { action: "archive", id: ID, expectedUpdatedAt: TOKEN }), "pro7-fc", malformed.value as never)).status, 500);
});

test("News API rejects method mismatch and unsafe requests before permission or RPC", async () => {
  for (const value of [
    request("PATCH", { action: "create", title: "Tin", body: "Nội dung" }),
    request("POST", { action: "publish", id: ID, expectedUpdatedAt: TOKEN }),
    request("POST", { action: "create", title: "Tin", body: "Nội dung" }, "https://evil.example"),
  ]) {
    const fixture = dependencies({ data: null, error: null });
    assert.ok((await mutateTeamNews(value, "pro7-fc", fixture.value as never)).status >= 400);
    assert.deepEqual(fixture.permissions, []);
    assert.deepEqual(fixture.calls, []);
  }
});
