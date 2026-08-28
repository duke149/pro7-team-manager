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

function rpcDependencies(result: { data: unknown; error: null | { code?: string } }) {
  const permissions: string[] = [];
  const calls: unknown[] = [];
  return {
    permissions,
    calls,
    value: {
      requireTeamPermission: async (_slug: string, permission: string) => {
        permissions.push(permission);
        return { userId: "00000000-0000-4000-8000-000000000009", team: { id: TEAM, name: "PRO7 FC", slug: "pro7-fc" }, membership: { roleName: "Owner" }, permissions: [permission] };
      },
      supabase: { rpc(name: string, args: unknown) { calls.push({ name, args }); return Promise.resolve(result); } },
    },
  };
}

test("team and notification settings use exact permissions and the atomic settings RPC", async () => {
  const team = dependencies({ data: { id: TEAM, name: "PRO7 FC", slug: "pro7-fc" }, error: null });
  const teamResponse = await mutateAdminSettings(request({ action: "team", name: "PRO7 FC", slug: "pro7-fc" }), "pro7-fc", team.value as never);
  assert.equal(teamResponse.status, 200);
  assert.deepEqual(team.permissions, ["team.update"]);
  assert.deepEqual(team.writes.slice(0, 2), [{ action: "update", value: { name: "PRO7 FC", slug: "pro7-fc" } }, { action: "eq", field: "id", value: TEAM }]);

  const notifications = rpcDependencies({ data: "2026-10-01T08:00:01.000Z", error: null });
  const response = await mutateAdminSettings(request({ action: "notifications", matchInvitations: true, matchReminders: false, reminderHoursBefore: 24, expectedUpdatedAt: "2026-10-01T08:00:00.000Z" }), "pro7-fc", notifications.value as never);
  assert.equal(response.status, 200);
  assert.deepEqual(notifications.permissions, ["settings.update"]);
  assert.deepEqual(notifications.calls, [{ name: "update_team_settings_section", args: { p_team_id: TEAM, p_section: "notifications", p_value: { matchInvitations: true, matchReminders: false, reminderHoursBefore: 24 }, p_expected_updated_at: "2026-10-01T08:00:00.000Z" } }]);
  assert.deepEqual(await response.json(), { ok: true, updatedAt: "2026-10-01T08:00:01.000Z" });
});

test("payment settings use the same RPC and stale writes return conflict", async () => {
  const payment = rpcDependencies({ data: "2026-10-01T08:00:01.000Z", error: null });
  const response = await mutateAdminSettings(request({ action: "payments", bankCode: "MB", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: "PRO7 QUY", expectedUpdatedAt: "2026-10-01T08:00:00.000Z" }), "pro7-fc", payment.value as never);
  assert.equal(response.status, 200);
  assert.deepEqual(payment.permissions, ["settings.update"]);
  assert.deepEqual(payment.calls[0], { name: "update_team_settings_section", args: { p_team_id: TEAM, p_section: "payments", p_value: { bankCode: "MB", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: "PRO7 QUY" }, p_expected_updated_at: "2026-10-01T08:00:00.000Z" } });

  const stale = rpcDependencies({ data: null, error: { code: "40001" } });
  const staleResponse = await mutateAdminSettings(request({ action: "payments", bankCode: "MB", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: null, expectedUpdatedAt: "2026-10-01T08:00:00.000Z" }), "pro7-fc", stale.value as never);
  assert.equal(staleResponse.status, 409);
  assert.equal((await staleResponse.json()).code, "stale");
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
