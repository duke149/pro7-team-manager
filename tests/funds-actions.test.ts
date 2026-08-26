import assert from "node:assert/strict";
import test from "node:test";

import { createFinanceEntry, mutateFinanceEntry, mutateMemberDue, type FundsActionDependencies } from "../lib/funds/actions";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const ENTRY_ID = "00000000-0000-4000-8000-000000000003";
const DUE_ID = "00000000-0000-4000-8000-000000000004";
const UPDATED_AT = "2026-10-01T00:00:00.000Z";
const ADMIN: TeamAccessContext = { team: { id: TEAM_ID, name: "PRO7 FC", slug: "pro7-fc" }, userId: USER_ID, membership: { roleId: "role-1", roleSlug: "admin", roleName: "Admin" }, permissions: ["finance.read", "finance.manage"] };

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://pro7.example${path}`, { method: "POST", headers: { origin: "https://pro7.example", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
function fixture(options: { context?: TeamAccessContext | null; rpcError?: { code?: string } | null; rpcData?: unknown } = {}) {
  const calls: Array<{ permission?: PermissionCode; name?: string; args?: unknown }> = [];
  const dependencies: FundsActionDependencies = {
    requireTeamPermission: async (_slug, permission) => { calls.push({ permission }); return "context" in options ? options.context ?? null : ADMIN; },
    supabase: { rpc: (async (name: string, args: unknown) => { calls.push({ name, args }); return { data: "rpcData" in options ? options.rpcData : ENTRY_ID, error: options.rpcError ?? null }; }) as never },
  };
  return { dependencies, calls };
}

test("fund mutations reject cross-origin, non-JSON, oversized, and client balance input before authority or RPC work", async () => {
  for (const unsafe of [
    request("/api/teams/pro7-fc/funds/entries", {}, { origin: "https://evil.example" }),
    request("/api/teams/pro7-fc/funds/entries", {}, { "content-type": "text/plain" }),
    request("/api/teams/pro7-fc/funds/entries", { direction: "income", amountVnd: 1, category: "Phí", occurredOn: "2026-10-01", description: "Thu", balance: 100 }),
  ]) {
    const state = fixture();
    const response = await createFinanceEntry(unsafe, { slug: "pro7-fc" }, state.dependencies);
    assert.ok([400, 403, 415].includes(response.status));
    assert.deepEqual(state.calls, []);
  }
});

test("Admin creates income or expense with the exact manage_finance_entry RPC contract", async () => {
  for (const direction of ["income", "expense"] as const) {
    const state = fixture({ rpcData: ENTRY_ID });
    const response = await createFinanceEntry(request("/api/teams/pro7-fc/funds/entries", { direction, amountVnd: 500_000, category: "member_due", occurredOn: "2026-10-24", description: "Phí tháng 10" }), { slug: "pro7-fc" }, state.dependencies);
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true, entryId: ENTRY_ID });
    assert.deepEqual(state.calls, [
      { permission: "finance.manage" },
      { name: "manage_finance_entry", args: { p_action: "create", p_team_id: TEAM_ID, p_entry_id: null, p_direction: direction, p_amount_vnd: 500_000, p_category: "member_due", p_occurred_on: "2026-10-24", p_description: "Phí tháng 10", p_void_reason: null, p_expected_updated_at: null } },
    ]);
  }
});

test("Member is denied before finance mutation and void preserves the authoritative stale token", async () => {
  const denied = fixture({ context: null });
  const deniedResponse = await mutateFinanceEntry(request("/api/teams/pro7-fc/funds/entries", { action: "void", entryId: ENTRY_ID, reason: "Nhập trùng", expectedUpdatedAt: UPDATED_AT }), { slug: "pro7-fc" }, denied.dependencies);
  assert.equal(deniedResponse.status, 403);
  assert.deepEqual(denied.calls, [{ permission: "finance.manage" }]);

  const state = fixture({ rpcData: ENTRY_ID });
  assert.equal((await mutateFinanceEntry(request("/api/teams/pro7-fc/funds/entries", { action: "void", entryId: ENTRY_ID, reason: "Nhập trùng", expectedUpdatedAt: UPDATED_AT }), { slug: "pro7-fc" }, state.dependencies)).status, 200);
  assert.deepEqual(state.calls.at(-1), { name: "manage_finance_entry", args: { p_action: "void", p_team_id: TEAM_ID, p_entry_id: ENTRY_ID, p_direction: null, p_amount_vnd: null, p_category: null, p_occurred_on: null, p_description: null, p_void_reason: "Nhập trùng", p_expected_updated_at: UPDATED_AT } });
});

test("dues paid and payment-void correction map to exact atomic RPC lifecycle actions", async () => {
  for (const [payload, action, note] of [
    [{ action: "pay", dueId: DUE_ID, note: "Đã nhận", expectedUpdatedAt: UPDATED_AT }, "pay", "Đã nhận"],
    [{ action: "voidPayment", dueId: DUE_ID, reason: "Giao dịch nhầm", expectedUpdatedAt: UPDATED_AT }, "void_payment", "Giao dịch nhầm"],
  ] as const) {
    const state = fixture({ rpcData: DUE_ID });
    const response = await mutateMemberDue(request("/api/teams/pro7-fc/funds/dues", payload), { slug: "pro7-fc" }, state.dependencies);
    assert.equal(response.status, 200);
    assert.deepEqual(state.calls, [
      { permission: "finance.manage" },
      { name: "manage_member_due", args: { p_action: action, p_team_id: TEAM_ID, p_due_id: DUE_ID, p_user_id: null, p_period_start: null, p_amount_vnd: null, p_due_date: null, p_note: note, p_expected_updated_at: UPDATED_AT } },
    ]);
  }
});

test("fund actions map stale, lifecycle, constraint, permission, not-found, and server RPC errors", async () => {
  for (const [code, status, publicCode] of [["40001", 409, "stale"], ["23505", 409, "conflict"], ["55000", 409, "lifecycle"], ["23514", 422, "validation"], ["23503", 422, "validation"], ["22023", 422, "validation"], ["42501", 403, "forbidden"], ["P0002", 404, "not_found"], ["XX000", 500, "server"]] as const) {
    const state = fixture({ rpcError: { code } });
    const response = await mutateMemberDue(request("/api/teams/pro7-fc/funds/dues", { action: "pay", dueId: DUE_ID, note: null, expectedUpdatedAt: UPDATED_AT }), { slug: "pro7-fc" }, state.dependencies);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, publicCode);
  }
});
