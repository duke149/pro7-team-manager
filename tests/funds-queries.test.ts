import assert from "node:assert/strict";
import test from "node:test";

import { getFunds, type FundsQueryDependencies } from "../lib/funds/queries";

const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const USER_A = "00000000-0000-4000-8000-000000000002";
const USER_B = "00000000-0000-4000-8000-000000000003";
const ENTRY_A = "00000000-0000-4000-8000-000000000011";
const ENTRY_B = "00000000-0000-4000-8000-000000000012";
const DUE_A = "00000000-0000-4000-8000-000000000021";
const DUE_B = "00000000-0000-4000-8000-000000000022";

const entries = [
  { id: ENTRY_A, direction: "income", amount_vnd: 2_000_000, category: "sponsor", occurred_on: "2026-09-20", description: "Tài trợ", created_at: "2026-09-20T08:00:00.000Z", updated_at: "2026-09-20T08:00:00.000Z" },
  { id: ENTRY_B, direction: "expense", amount_vnd: 750_000, category: "equipment", occurred_on: "2026-10-24", description: "Mua bóng", created_at: "2026-10-24T08:00:00.000Z", updated_at: "2026-10-24T08:00:00.000Z" },
  { id: "00000000-0000-4000-8000-000000000013", direction: "income", amount_vnd: 500_000, category: "member_due", occurred_on: "2026-10-18", description: "Phí tháng 10", created_at: "2026-10-18T08:00:00.000Z", updated_at: "2026-10-18T08:00:00.000Z" },
];
const dues = [
  { id: DUE_A, user_id: USER_A, period_start: "2026-10-01", amount_vnd: 500_000, due_date: "2026-10-10", status: "paid", paid_at: "2026-10-18T08:00:00.000Z", finance_entry_id: entries[2]!.id, updated_at: "2026-10-18T08:00:00.000Z" },
  { id: DUE_B, user_id: USER_B, period_start: "2026-10-01", amount_vnd: 500_000, due_date: "2026-10-10", status: "pending", paid_at: null, finance_entry_id: null, updated_at: "2026-10-01T08:00:00.000Z" },
];

function dependencies(overrides: { entries?: unknown[]; dues?: unknown[]; profiles?: unknown[]; failTable?: string } = {}) {
  const calls: Array<{ table: string; operation: string; args: unknown[] }> = [];
  const rows: Record<string, unknown[]> = { finance_entries: overrides.entries ?? entries, member_dues: overrides.dues ?? dues, memberships: [{ user_id: USER_A }, { user_id: USER_B }, { user_id: "00000000-0000-4000-8000-000000000004" }], profiles: overrides.profiles ?? [{ id: USER_A, display_name: "Nguyễn An" }, { id: USER_B, display_name: "Trần Bình" }, { id: "00000000-0000-4000-8000-000000000004", display_name: "Lê Cường" }] };
  function query(table: string) {
    const state = { gt: null as string | null };
    const chain = {
      select(...args: unknown[]) { calls.push({ table, operation: "select", args }); return chain; },
      eq(...args: unknown[]) { calls.push({ table, operation: "eq", args }); return chain; },
      is(...args: unknown[]) { calls.push({ table, operation: "is", args }); return chain; },
      in(...args: unknown[]) { calls.push({ table, operation: "in", args }); return chain; },
      order(...args: unknown[]) { calls.push({ table, operation: "order", args }); return chain; },
      gt(_column: string, cursor: string) { state.gt = cursor; calls.push({ table, operation: "gt", args: [_column, cursor] }); return chain; },
      async limit(size: number) { calls.push({ table, operation: "limit", args: [size] }); const source = rows[table] ?? []; const page = state.gt ? source.filter((row) => String((row as { id: string }).id) > state.gt!).slice(0, size) : source.slice(0, size); return { data: page, error: overrides.failTable === table ? { code: "XX000" } : null }; },
    };
    return chain;
  }
  return { dependencies: { supabase: { from: ((table: string) => query(table)) as never } } satisfies FundsQueryDependencies, calls };
}

test("fund queries explicitly exclude voids and derive authoritative balance/month summaries", async () => {
  const state = dependencies();
  const result = await getFunds(TEAM_ID, "2026-10-01", state.dependencies);
  assert.deepEqual(result, { ok: true, data: {
    periodStart: "2026-10-01", balanceVnd: 1_750_000, monthIncomeVnd: 500_000, monthIncomeCount: 1, monthExpenseVnd: 750_000, monthExpenseCount: 1,
    pendingDuesVnd: 500_000, pendingDuesCount: 1, paidDuesCount: 1, totalDuesCount: 2,
    dues: [
      { id: DUE_A, userId: USER_A, displayName: "Nguyễn An", periodStart: "2026-10-01", amountVnd: 500_000, dueDate: "2026-10-10", status: "paid", paidAt: "2026-10-18T08:00:00.000Z", financeEntryId: entries[2]!.id, updatedAt: "2026-10-18T08:00:00.000Z" },
      { id: DUE_B, userId: USER_B, displayName: "Trần Bình", periodStart: "2026-10-01", amountVnd: 500_000, dueDate: "2026-10-10", status: "pending", paidAt: null, financeEntryId: null, updatedAt: "2026-10-01T08:00:00.000Z" },
    ],
    dueCandidates: [{ userId: "00000000-0000-4000-8000-000000000004", displayName: "Lê Cường" }],
    recentEntries: [
      { id: ENTRY_B, direction: "expense", amountVnd: 750_000, category: "equipment", occurredOn: "2026-10-24", description: "Mua bóng", createdAt: "2026-10-24T08:00:00.000Z", updatedAt: "2026-10-24T08:00:00.000Z" },
      { id: entries[2]!.id, direction: "income", amountVnd: 500_000, category: "member_due", occurredOn: "2026-10-18", description: "Phí tháng 10", createdAt: "2026-10-18T08:00:00.000Z", updatedAt: "2026-10-18T08:00:00.000Z" },
      { id: ENTRY_A, direction: "income", amountVnd: 2_000_000, category: "sponsor", occurredOn: "2026-09-20", description: "Tài trợ", createdAt: "2026-09-20T08:00:00.000Z", updatedAt: "2026-09-20T08:00:00.000Z" },
    ],
  } });
  assert.ok(state.calls.some((call) => call.table === "finance_entries" && call.operation === "is" && call.args[0] === "voided_at" && call.args[1] === null));
  assert.ok(state.calls.some((call) => call.table === "member_dues" && call.operation === "eq" && call.args[0] === "period_start" && call.args[1] === "2026-10-01"));
  assert.ok(state.calls.some((call) => call.table === "memberships" && call.operation === "eq" && call.args[0] === "status" && call.args[1] === "active"));
});

test("fund queries fail closed on malformed VND, due lifecycle, identity, or database results", async () => {
  for (const state of [
    dependencies({ entries: [{ ...entries[0], amount_vnd: 1.5 }] }),
    dependencies({ dues: [{ ...dues[0], status: "paid", paid_at: null }] }),
    dependencies({ profiles: [{ id: USER_A, display_name: "Nguyễn An" }] }),
    dependencies({ failTable: "finance_entries" }),
  ]) assert.deepEqual(await getFunds(TEAM_ID, "2026-10-01", state.dependencies), { ok: false, error: "server" });
});
