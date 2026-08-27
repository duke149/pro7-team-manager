import assert from "node:assert/strict";
import test from "node:test";

import { mutateAdminSettings } from "../lib/settings/actions";

const TEAM = "00000000-0000-4000-8000-000000000001";

function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/teams/pro7-fc/settings", {
    method: "PATCH",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function dependencies(result: { data: unknown; error: null | { code?: string } }) {
  const permissions: string[] = [];
  const writes: unknown[] = [];
  const query = {
    update(value: unknown) { writes.push({ action: "update", value }); return this; },
    delete() { writes.push({ action: "delete" }); return this; },
    eq(field: string, value: string) { writes.push({ action: "eq", field, value }); return this; },
    select(value: string) { writes.push({ action: "select", value }); return this; },
    maybeSingle() { return Promise.resolve(result); },
  };
  return {
    permissions,
    writes,
    value: {
      requireTeamPermission: async (_slug: string, permission: string) => {
        permissions.push(permission);
        return { userId: "00000000-0000-4000-8000-000000000009", team: { id: TEAM, name: "PRO7 FC", slug: "pro7-fc" }, membership: { roleName: "Owner" }, permissions: [permission] };
      },
      supabase: { from: () => query },
    },
  };
}

test("team and notification settings use exact permissions and RLS-scoped writes", async () => {
  const team = dependencies({ data: { id: TEAM, name: "PRO7 FC", slug: "pro7-fc" }, error: null });
  const teamResponse = await mutateAdminSettings(request({ action: "team", name: "PRO7 FC", slug: "pro7-fc" }), "pro7-fc", team.value as never);
  assert.equal(teamResponse.status, 200);
  assert.deepEqual(team.permissions, ["team.update"]);
  assert.deepEqual(team.writes.slice(0, 2), [{ action: "update", value: { name: "PRO7 FC", slug: "pro7-fc" } }, { action: "eq", field: "id", value: TEAM }]);

  const notifications = dependencies({ data: { team_id: TEAM }, error: null });
  const response = await mutateAdminSettings(request({ action: "notifications", matchInvitations: true, matchReminders: false, reminderHoursBefore: 24 }), "pro7-fc", notifications.value as never);
  assert.equal(response.status, 200);
  assert.deepEqual(notifications.permissions, ["settings.update"]);
  assert.deepEqual(notifications.writes[0], { action: "update", value: { settings: { notifications: { matchInvitations: true, matchReminders: false, reminderHoursBefore: 24 } } } });
});

test("danger zone requires both canonical confirmations before any delete", async () => {
  const wrong = dependencies({ data: { id: TEAM }, error: null });
  const rejected = await mutateAdminSettings(request({ action: "delete", confirmation: "PRO7 FC", slugConfirmation: "wrong" }), "pro7-fc", wrong.value as never);
  assert.equal(rejected.status, 422);
  assert.deepEqual(wrong.permissions, ["team.delete"]);
  assert.deepEqual(wrong.writes, []);

  const exact = dependencies({ data: { id: TEAM }, error: null });
  const accepted = await mutateAdminSettings(request({ action: "delete", confirmation: "PRO7 FC", slugConfirmation: "pro7-fc" }), "pro7-fc", exact.value as never);
  assert.equal(accepted.status, 200);
  assert.deepEqual(exact.writes[0], { action: "delete" });
});

test("settings mutation rejects cross-origin and malformed requests before authorization", async () => {
  const denied = dependencies({ data: null, error: null });
  assert.equal((await mutateAdminSettings(request({ action: "team", name: "PRO7 FC", slug: "pro7-fc" }, "https://evil.example"), "pro7-fc", denied.value as never)).status, 403);
  assert.deepEqual(denied.permissions, []);
  assert.deepEqual(denied.writes, []);
});
