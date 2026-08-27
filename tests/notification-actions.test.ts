import assert from "node:assert/strict";
import test from "node:test";

import { markNotificationRead, type NotificationActionDependencies } from "../lib/notifications/actions";

const ID = "00000000-0000-4000-8000-000000000004";
const USER = "00000000-0000-4000-8000-000000000002";

function request(origin = "https://pro7.example") { return new Request("https://pro7.example/api/notifications/" + ID, { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: "{}" }); }

test("mark-read rejects cross-origin and binds update to the verified caller", async () => {
  let calls = 0;
  const dependencies: NotificationActionDependencies = { getCurrentUser: async () => ({ id: USER }), updateReadAt: async (id, userId) => { calls += 1; assert.equal(id, ID); assert.equal(userId, USER); return { ok: true, readAt: "2026-08-26T12:00:00.000Z" }; } };
  assert.equal((await markNotificationRead(request("https://evil.example"), ID, dependencies)).status, 403);
  assert.equal(calls, 0);
  const response = await markNotificationRead(request(), ID, dependencies);
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test("mark-read fails closed for malformed IDs, missing callers, or invisible rows", async () => {
  const base: NotificationActionDependencies = { getCurrentUser: async () => ({ id: USER }), updateReadAt: async () => ({ ok: false }) };
  assert.equal((await markNotificationRead(request(), "bad", base)).status, 404);
  assert.equal((await markNotificationRead(request(), ID, { ...base, getCurrentUser: async () => null })).status, 401);
  assert.equal((await markNotificationRead(request(), ID, base)).status, 404);
});
