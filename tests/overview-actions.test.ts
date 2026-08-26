import assert from "node:assert/strict";
import test from "node:test";

import { remindPendingAttendance, type OverviewActionDependencies } from "../lib/overview/actions";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";
import { mutateOverviewReminderRoute } from "../app/api/teams/[slug]/matches/[matchId]/remind/route";

const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const ACTOR_ID = "00000000-0000-4000-8000-000000000002";
const MATCH_ID = "00000000-0000-4000-8000-000000000003";
const CONTEXT: TeamAccessContext = {
  team: { id: TEAM_ID, name: "PRO7 FC", slug: "pro7-fc" },
  userId: ACTOR_ID,
  membership: { roleId: "role-admin", roleSlug: "admin", roleName: "Admin" },
  permissions: ["matches.read", "matches.manage"],
};

type Result = { data: unknown; error: null | { code?: string } };

class QueryDouble implements PromiseLike<Result> {
  readonly calls: { method: string; arguments: unknown[] }[] = [];
  constructor(private readonly result: Result) {}
  private chain(method: string, arguments_: unknown[]) { this.calls.push({ method, arguments: arguments_ }); return this; }
  select(...args: unknown[]) { return this.chain("select", args); }
  eq(...args: unknown[]) { return this.chain("eq", args); }
  gt(...args: unknown[]) { return this.chain("gt", args); }
  order(...args: unknown[]) { return this.chain("order", args); }
  limit(...args: unknown[]) { return this.chain("limit", args); }
  then<TResult1 = Result, TResult2 = never>(resolve?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    return Promise.resolve(this.result).then(resolve, reject);
  }
}

function request(body: unknown = {}, headers: Record<string, string> = {}) {
  return new Request(`https://pro7.example/api/teams/pro7-fc/matches/${MATCH_ID}/remind`, {
    method: "POST",
    headers: { origin: "https://pro7.example", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function fixture(options: {
  context?: TeamAccessContext | null;
  pages?: Result[];
  rpcData?: unknown;
  rpcError?: { code?: string } | null;
} = {}) {
  const permissions: PermissionCode[] = [];
  const queries: QueryDouble[] = [];
  const rpcs: { name: string; args: unknown }[] = [];
  const pages = [...(options.pages ?? [{ data: [], error: null }])];
  const deps: OverviewActionDependencies = {
    requireTeamPermission: async (_slug, permission) => {
      permissions.push(permission);
      return "context" in options ? options.context ?? null : CONTEXT;
    },
    supabase: {
      from(table: string) {
        assert.equal(table, "match_attendance");
        const query = new QueryDouble(pages.shift() ?? { data: [], error: null });
        queries.push(query);
        return query as never;
      },
      rpc: (async (name: string, args: unknown) => {
        rpcs.push({ name, args });
        return { data: options.rpcData ?? 0, error: options.rpcError ?? null };
      }) as never,
    } as never,
  };
  return { deps, permissions, queries, rpcs };
}

function userIds(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => `00000000-0000-4000-8000-${(offset + index + 1).toString(16).padStart(12, "0")}`);
}

test("reminder rejects cross-origin, non-JSON, and client-controlled recipient fields before authorization", async () => {
  for (const unsafe of [
    request({}, { origin: "https://evil.example" }),
    request({}, { "content-type": "text/plain" }),
    request({ userIds: [ACTOR_ID] }),
  ]) {
    const value = fixture();
    const response = await remindPendingAttendance(unsafe, { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);
    assert.ok([400, 403, 415].includes(response.status));
    assert.deepEqual(value.permissions, []);
    assert.deepEqual(value.rpcs, []);
  }
});

test("reminder re-requires matches.manage before reading pending attendance", async () => {
  const value = fixture({ context: null });
  const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);

  assert.equal(response.status, 403);
  assert.deepEqual(value.permissions, ["matches.manage"]);
  assert.equal(value.queries.length, 0);
  assert.equal(value.rpcs.length, 0);
});

test("reminder keyset-loads the complete pending set and invokes the notification RPC exactly once", async () => {
  const ids = userIds(201);
  const value = fixture({
    pages: [
      { data: ids.slice(0, 100).map((user_id) => ({ user_id })), error: null },
      { data: ids.slice(100, 200).map((user_id) => ({ user_id })), error: null },
      { data: ids.slice(200).map((user_id) => ({ user_id })), error: null },
    ],
    rpcData: 201,
  });
  const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, reminded: 201 });
  assert.deepEqual(value.permissions, ["matches.manage"]);
  assert.equal(value.queries.length, 3);
  assert.deepEqual(value.queries[0]?.calls, [
    { method: "select", arguments: ["user_id"] },
    { method: "eq", arguments: ["team_id", TEAM_ID] },
    { method: "eq", arguments: ["match_id", MATCH_ID] },
    { method: "eq", arguments: ["status", "pending"] },
    { method: "order", arguments: ["user_id", { ascending: true }] },
    { method: "limit", arguments: [100] },
  ]);
  assert.deepEqual(value.queries[1]?.calls.at(-2), { method: "gt", arguments: ["user_id", ids[99]] });
  assert.deepEqual(value.rpcs, [{
    name: "remind_match_attendance",
    args: { p_team_id: TEAM_ID, p_match_id: MATCH_ID, p_user_ids: ids },
  }]);
});

test("reminder returns an honest zero-pending no-op without calling the RPC", async () => {
  const value = fixture();
  const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, reminded: 0 });
  assert.deepEqual(value.rpcs, []);
});

test("reminder fails closed on malformed, unordered, overflow, and partial RPC results", async () => {
  const overflowIds = userIds(401);
  const cases = [
    fixture({ pages: [{ data: [{ user_id: "bad" }], error: null }] }),
    fixture({ pages: [{ data: [{ user_id: ACTOR_ID }, { user_id: ACTOR_ID }], error: null }] }),
    fixture({ pages: Array.from({ length: 5 }, (_, page) => ({ data: overflowIds.slice(page * 100, (page + 1) * 100).map((user_id) => ({ user_id })), error: null })) }),
    fixture({ pages: [{ data: [{ user_id: ACTOR_ID }], error: null }], rpcData: 0 }),
  ];
  for (const value of cases) {
    const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);
    assert.equal(response.status, 500);
    assert.ok(value.rpcs.length <= 1);
  }
});

test("reminder maps database lifecycle and permission failures without leaking details", async () => {
  for (const [code, status, publicCode] of [
    ["55000", 409, "lifecycle"],
    ["23503", 409, "lifecycle"],
    ["42501", 403, "forbidden"],
    ["P0002", 404, "not_found"],
    ["XX000", 500, "server"],
  ] as const) {
    const value = fixture({ pages: [{ data: [{ user_id: ACTOR_ID }], error: null }], rpcError: { code } });
    const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, publicCode);
  }
});

test("reminder route forwards only decoded path identity to its authority handler", async () => {
  const actualRequest = request();
  const response = new Response("OK");
  assert.equal(await mutateOverviewReminderRoute(
    actualRequest,
    Promise.resolve({ slug: "pro7-fc", matchId: MATCH_ID }),
    async (seenRequest, target) => {
      assert.equal(seenRequest, actualRequest);
      assert.deepEqual(target, { slug: "pro7-fc", matchId: MATCH_ID });
      return response;
    },
  ), response);
});
