import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { listTeamNotifications } from "../lib/notifications/queries";

type Result = { data: unknown; error: null | { code?: string } };
class QueryDouble implements PromiseLike<Result> {
  calls: Array<{ method: string; args: unknown[] }> = [];
  constructor(private result: Result) {}
  private chain(method: string, args: unknown[]) { this.calls.push({ method, args }); return this; }
  select(...args: unknown[]) { return this.chain("select", args); }
  eq(...args: unknown[]) { return this.chain("eq", args); }
  order(...args: unknown[]) { return this.chain("order", args); }
  limit(...args: unknown[]) { return this.chain("limit", args); }
  then<TResult1 = Result, TResult2 = never>(resolve?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return Promise.resolve(this.result).then(resolve, reject); }
}

const TEAM = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";
const MATCH = "00000000-0000-4000-8000-000000000003";
const ROW = { id: "00000000-0000-4000-8000-000000000004", team_id: TEAM, user_id: USER, type: "match_invitation", source_entity: "match", source_id: MATCH, title: "Lời mời trận đấu", body: "PRO7 FC gặp fc nat tại CK2", target_path: `/teams/pro7-fc/matches/${MATCH}`, read_at: null, created_at: "2026-08-26T12:00:00.000Z" };

test("notifications are bounded, own-user/team scoped, strictly parsed, and count unread", async () => {
  const query = new QueryDouble({ data: [ROW], error: null });
  const result = await listTeamNotifications(TEAM, USER, "pro7-fc", { from: () => query } as never);
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.unreadCount : -1, 1);
  assert.equal(result.ok ? result.notifications[0]?.targetPath : null, ROW.target_path);
  assert.deepEqual(query.calls, [
    { method: "select", args: ["id,team_id,user_id,type,source_entity,source_id,title,body,target_path,read_at,created_at"] },
    { method: "eq", args: ["team_id", TEAM] },
    { method: "eq", args: ["user_id", USER] },
    { method: "order", args: ["created_at", { ascending: false }] },
    { method: "order", args: ["id", { ascending: false }] },
    { method: "limit", args: [21] },
  ]);
});

test("notifications fail closed on overflow, malformed rows, duplicate IDs, and cross-team paths", async () => {
  const cases = [
    Array.from({ length: 21 }, (_, index) => ({ ...ROW, id: `00000000-0000-4000-8000-${(index + 10).toString(16).padStart(12, "0")}` })),
    [{ ...ROW, id: "bad" }],
    [ROW, ROW],
    [{ ...ROW, target_path: `/teams/other-team/matches/${MATCH}` }],
  ];
  for (const data of cases) {
    const query = new QueryDouble({ data, error: null });
    assert.deepEqual(await listTeamNotifications(TEAM, USER, "pro7-fc", { from: () => query } as never), { ok: false, error: "server" });
  }
});

test("the production notification query awaits the async server client factory", async () => {
  const source = await readFile(new URL("../lib/notifications/queries.ts", import.meta.url), "utf8");
  assert.match(source, /supplied \?\? await \(await import\("\.\.\/supabase\/server"\)\)\.createServerSupabaseClient\(\)/u);
});
