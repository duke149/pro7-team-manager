import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "../matches/model";
import { isIsoTimestamp } from "../matches/validation";
import type { Database } from "../supabase/database.types";
import type { DueStatus, FinanceDirection, FinanceEntry, FundsResult, MemberDue } from "./model";
import { isDate } from "./validation";
import "../matches/server-only";

const PAGE_SIZE = 100;
const MAX_ROWS = 2_000;
const RECENT_LIMIT = 20;
type EntryRow = { id: string; direction: FinanceDirection; amount_vnd: number; category: string; occurred_on: string; description: string; created_at: string; updated_at: string };
type DueRow = { id: string; user_id: string; period_start: string; amount_vnd: number; due_date: string; status: DueStatus; paid_at: string | null; finance_entry_id: string | null; updated_at: string };
type ProfileRow = { id: string; display_name: string | null };
export type FundsQueryDependencies = { supabase?: Pick<SupabaseClient<Database>, "from"> };

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function bounded(value: unknown, maximum: number) { return typeof value === "string" && value === value.trim() && Array.from(value).length >= 1 && Array.from(value).length <= maximum; }
function money(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function entryRow(value: unknown): value is EntryRow {
  return record(value) && isUuid(value.id) && (value.direction === "income" || value.direction === "expense") && money(value.amount_vnd) && bounded(value.category, 80) && isDate(value.occurred_on) && bounded(value.description, 500) && isIsoTimestamp(value.created_at) && isIsoTimestamp(value.updated_at);
}
function dueRow(value: unknown): value is DueRow {
  if (!record(value) || !isUuid(value.id) || !isUuid(value.user_id) || !isDate(value.period_start) || !value.period_start.endsWith("-01") || !money(value.amount_vnd) || !isDate(value.due_date) || value.due_date < value.period_start || !["pending", "paid", "waived"].includes(String(value.status)) || !isIsoTimestamp(value.updated_at)) return false;
  return value.status === "paid" ? isIsoTimestamp(value.paid_at) && isUuid(value.finance_entry_id) : value.paid_at === null && value.finance_entry_id === null;
}
function profileRow(value: unknown): value is ProfileRow { return record(value) && isUuid(value.id) && (value.display_name === null || bounded(value.display_name, 100)); }
function unique(values: readonly string[]) { return new Set(values).size === values.length; }
function nextMonth(period: string) { const date = new Date(`${period}T00:00:00.000Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 10); }
async function client(supplied?: Pick<SupabaseClient<Database>, "from">) { if (supplied) return supplied; const { createServerSupabaseClient } = await import("../supabase/server"); return createServerSupabaseClient(); }

async function loadEntries(supabase: Pick<SupabaseClient<Database>, "from">, teamId: string): Promise<EntryRow[] | null> {
  const rows: EntryRow[] = []; let cursor: string | null = null;
  while (true) {
    let query = supabase.from("finance_entries").select("id,direction,amount_vnd,category,occurred_on,description,created_at,updated_at").eq("team_id", teamId).is("voided_at", null).order("id", { ascending: true });
    if (cursor) query = query.gt("id", cursor);
    const response = await query.limit(PAGE_SIZE);
    if (response.error || !Array.isArray(response.data) || response.data.length > PAGE_SIZE || !response.data.every(entryRow)) return null;
    const page = response.data as unknown as EntryRow[];
    if (!unique(page.map(({ id }) => id)) || page.some((row, index) => index === 0 ? cursor !== null && row.id <= cursor : row.id <= page[index - 1]!.id) || rows.length + page.length > MAX_ROWS) return null;
    rows.push(...page); if (page.length < PAGE_SIZE) return rows; cursor = page.at(-1)!.id;
  }
}
async function loadDues(supabase: Pick<SupabaseClient<Database>, "from">, teamId: string, periodStart: string): Promise<DueRow[] | null> {
  const rows: DueRow[] = []; let cursor: string | null = null;
  while (true) {
    let query = supabase.from("member_dues").select("id,user_id,period_start,amount_vnd,due_date,status,paid_at,finance_entry_id,updated_at").eq("team_id", teamId).eq("period_start", periodStart).order("id", { ascending: true });
    if (cursor) query = query.gt("id", cursor);
    const response = await query.limit(PAGE_SIZE);
    if (response.error || !Array.isArray(response.data) || response.data.length > PAGE_SIZE || !response.data.every(dueRow)) return null;
    const page = response.data as unknown as DueRow[];
    if (!unique(page.map(({ id }) => id)) || page.some((row, index) => index === 0 ? cursor !== null && row.id <= cursor : row.id <= page[index - 1]!.id) || rows.length + page.length > MAX_ROWS) return null;
    rows.push(...page); if (page.length < PAGE_SIZE) return rows; cursor = page.at(-1)!.id;
  }
}
async function loadNames(supabase: Pick<SupabaseClient<Database>, "from">, ids: readonly string[]) {
  const names = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
    const requested = ids.slice(offset, offset + PAGE_SIZE);
    const response = await supabase.from("profiles").select("id,display_name").in("id", requested).order("id", { ascending: true }).limit(PAGE_SIZE);
    if (response.error || !Array.isArray(response.data) || response.data.length !== requested.length || !response.data.every(profileRow)) return null;
    const rows = response.data as unknown as ProfileRow[];
    if (!unique(rows.map(({ id }) => id)) || rows.some(({ id }) => !requested.includes(id))) return null;
    for (const row of rows) names.set(row.id, row.display_name ?? "Chưa đặt tên");
  }
  return names;
}
function entry(row: EntryRow): FinanceEntry { return Object.freeze({ id: row.id, direction: row.direction, amountVnd: row.amount_vnd, category: row.category, occurredOn: row.occurred_on, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at }); }
function due(row: DueRow, names: Map<string, string>): MemberDue { return Object.freeze({ id: row.id, userId: row.user_id, displayName: names.get(row.user_id) as string, periodStart: row.period_start, amountVnd: row.amount_vnd, dueDate: row.due_date, status: row.status, paidAt: row.paid_at, financeEntryId: row.finance_entry_id, updatedAt: row.updated_at }); }

export async function getFunds(teamId: string, periodStart: string, dependencies: FundsQueryDependencies = {}): Promise<FundsResult> {
  try {
    if (!isUuid(teamId) || !isDate(periodStart) || !periodStart.endsWith("-01")) return { ok: false, error: "server" };
    const supabase = await client(dependencies.supabase);
    const [entryRows, dueRows] = await Promise.all([loadEntries(supabase, teamId), loadDues(supabase, teamId, periodStart)]);
    if (!entryRows || !dueRows) return { ok: false, error: "server" };
    const userIds = [...new Set(dueRows.map(({ user_id }) => user_id))].sort();
    const names = await loadNames(supabase, userIds);
    if (!names) return { ok: false, error: "server" };
    const monthEnd = nextMonth(periodStart);
    const month = entryRows.filter((row) => row.occurred_on >= periodStart && row.occurred_on < monthEnd);
    const income = month.filter((row) => row.direction === "income"); const expense = month.filter((row) => row.direction === "expense"); const pending = dueRows.filter((row) => row.status === "pending");
    const balanceVnd = entryRows.reduce((total, row) => total + (row.direction === "income" ? row.amount_vnd : -row.amount_vnd), 0);
    const sums = [balanceVnd, income.reduce((sum, row) => sum + row.amount_vnd, 0), expense.reduce((sum, row) => sum + row.amount_vnd, 0), pending.reduce((sum, row) => sum + row.amount_vnd, 0)];
    if (!sums.every(Number.isSafeInteger)) return { ok: false, error: "server" };
    return { ok: true, data: Object.freeze({ periodStart, balanceVnd: sums[0]!, monthIncomeVnd: sums[1]!, monthIncomeCount: income.length, monthExpenseVnd: sums[2]!, monthExpenseCount: expense.length, pendingDuesVnd: sums[3]!, pendingDuesCount: pending.length, paidDuesCount: dueRows.filter((row) => row.status === "paid").length, totalDuesCount: dueRows.length, dues: Object.freeze(dueRows.map((row) => due(row, names)).sort((a, b) => a.displayName.localeCompare(b.displayName, "vi-VN") || a.id.localeCompare(b.id))), recentEntries: Object.freeze(entryRows.map(entry).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, RECENT_LIMIT)) }) };
  } catch { return { ok: false, error: "server" }; }
}
