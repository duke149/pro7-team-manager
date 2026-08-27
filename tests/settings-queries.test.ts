import assert from "node:assert/strict";
import test from "node:test";

import { loadAdminSettings } from "../lib/settings/queries";

const TEAM = "00000000-0000-4000-8000-000000000001";
const ROLE = "00000000-0000-4000-8000-000000000002";
const USER = "00000000-0000-4000-8000-000000000003";

type Result = { data: unknown; error: null | { code?: string } };
class Query implements PromiseLike<Result> {
  constructor(private readonly result: Result) {}
  select() { return this; }
  eq() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve(this.result); }
  then<TResult1 = Result, TResult2 = never>(resolve?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    return Promise.resolve(this.result).then(resolve, reject);
  }
}

function client(overrides: Partial<Record<"settings" | "roles" | "permissions" | "memberships" | "audit", Result>> = {}) {
  const rows: Record<string, Result> = {
    settings: { data: { team_id: TEAM, settings: { notifications: { matchInvitations: true, matchReminders: false, reminderHoursBefore: 12 } } }, error: null },
    roles: { data: [{ id: ROLE, name: "Member", slug: "member", is_system: true }], error: null },
    permissions: { data: [{ role_id: ROLE, permission_code: "team.read" }], error: null },
    memberships: { data: [{ user_id: USER, status: "active" }], error: null },
    audit: { data: [{ event_id: 7, occurred_at: "2026-08-26T12:00:00.000Z", actor_user_id: USER, actor_display_name: "Admin", table_name: "teams", action: "UPDATE", row_key: { id: TEAM } }], error: null },
    ...overrides,
  };
  return {
    from(table: string) {
      const key = table === "team_settings" ? "settings" : table === "role_permissions" ? "permissions" : table;
      return new Query(rows[key]);
    },
    rpc(name: string, args: unknown) {
      assert.equal(name, "get_team_audit_events");
      assert.deepEqual(args, { p_team_id: TEAM, p_limit: 50 });
      return Promise.resolve(rows.audit);
    },
  };
}

test("Admin Settings parses bounded notification, role, member, and redacted audit data", async () => {
  const result = await loadAdminSettings(TEAM, client() as never);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data.notificationSettings, { matchInvitations: true, matchReminders: false, reminderHoursBefore: 12 });
  assert.equal(result.data.activeMembers, 1);
  assert.equal(result.data.inactiveMembers, 0);
  assert.deepEqual(result.data.roles[0]?.permissions, ["team.read"]);
  assert.deepEqual(result.data.auditEvents[0]?.rowKey, { id: TEAM });
  assert.equal("oldData" in result.data.auditEvents[0]!, false);
});

test("Admin Settings fails closed on malformed, duplicate, overflow, or upstream data", async () => {
  const cases = [
    client({ audit: { data: [{ event_id: 1, occurred_at: "bad" }], error: null } }),
    client({ memberships: { data: [{ user_id: USER, status: "active" }, { user_id: USER, status: "active" }], error: null } }),
    client({ roles: { data: Array.from({ length: 101 }, () => ({ id: ROLE, name: "Role", slug: "role", is_system: false })), error: null } }),
    client({ settings: { data: null, error: { code: "server" } } }),
  ];
  for (const supplied of cases) assert.deepEqual(await loadAdminSettings(TEAM, supplied as never), { ok: false, error: "server" });
});
