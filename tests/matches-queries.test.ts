import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { getMatchDetail, listMatches } from "../lib/matches/queries";

test("Matches database contracts reject browser-runtime imports", () => {
  for (const modulePath of ["queries", "actions"]) {
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `globalThis.window = {}; await import("./lib/matches/${modulePath}.ts");`,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.notEqual(child.status, 0, modulePath);
    assert.match(`${child.stdout}${child.stderr}`, /PRO7 server-only boundary: Matches/u);
  }
});

type Result = { data: unknown; error: null | { code?: string } };

class QueryDouble implements PromiseLike<Result> {
  readonly calls: { method: string; arguments: unknown[] }[] = [];
  constructor(private readonly result: Result) {}
  private chain(method: string, arguments_: unknown[]) { this.calls.push({ method, arguments: arguments_ }); return this; }
  select(...args: unknown[]) { return this.chain("select", args); }
  eq(...args: unknown[]) { return this.chain("eq", args); }
  in(...args: unknown[]) { return this.chain("in", args); }
  order(...args: unknown[]) { return this.chain("order", args); }
  limit(...args: unknown[]) { return this.chain("limit", args); }
  maybeSingle(...args: unknown[]) { return this.chain("maybeSingle", args); }
  then<TResult1 = Result, TResult2 = never>(resolve?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    return Promise.resolve(this.result).then(resolve, reject);
  }
}

function clientDouble(results: Record<string, Result[]>) {
  const calls: { table: string; query: QueryDouble }[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        const result = results[table]?.shift() ?? { data: [], error: null };
        const query = new QueryDouble(result);
        calls.push({ table, query });
        return query;
      },
    } as never,
  };
}

const MATCH_A = {
  id: "00000000-0000-4000-8000-000000000101",
  opponent: "Metro City",
  starts_at: "2026-10-19T12:30:00+00:00",
  venue: "Riverside",
  is_home: true,
  rsvp_deadline: "2026-10-18T12:30:00+00:00",
  status: "scheduled",
  team_score: null,
  opponent_score: null,
  updated_at: "2026-10-01T00:00:00+00:00",
  attendance: [
    { user_id: "00000000-0000-4000-8000-000000000010", status: "available", updated_at: "2026-10-02T00:00:00+00:00" },
    { user_id: "00000000-0000-4000-8000-000000000011", status: "pending", updated_at: "2026-10-02T00:00:00+00:00" },
  ],
};

test("listMatches uses an explicit scoped select and returns stable startsAt/id order with live RSVP counts", async () => {
  const fixture = clientDouble({ matches: [{ data: [
    { ...MATCH_A, id: "00000000-0000-4000-8000-000000000102" },
    MATCH_A,
  ], error: null }] });
  const result = await listMatches("team-1", "00000000-0000-4000-8000-000000000010", { supabase: fixture.client });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.matches.map((match) => match.id) : [], [
    "00000000-0000-4000-8000-000000000101",
    "00000000-0000-4000-8000-000000000102",
  ]);
  assert.deepEqual(result.ok ? result.matches[0]?.attendance : null, {
    invited: 2,
    available: 1,
    unavailable: 0,
    pending: 1,
  });
  assert.deepEqual(result.ok ? result.matches[0]?.ownAttendance : null, {
    status: "available",
    updatedAt: "2026-10-02T00:00:00+00:00",
  });
  assert.deepEqual(fixture.calls[0], {
    table: "matches",
    query: fixture.calls[0]?.query,
  });
  assert.deepEqual(fixture.calls[0]?.query.calls, [
    { method: "select", arguments: ["id,opponent,starts_at,venue,is_home,rsvp_deadline,status,team_score,opponent_score,updated_at,attendance:match_attendance(user_id,status,updated_at)"] },
    { method: "eq", arguments: ["team_id", "team-1"] },
    { method: "order", arguments: ["starts_at", { ascending: true }] },
    { method: "order", arguments: ["id", { ascending: true }] },
    { method: "limit", arguments: [100] },
  ]);
});

test("listMatches fails closed on query errors and malformed nested rows", async () => {
  for (const result of [
    { data: null, error: { code: "42501" } },
    { data: [{ ...MATCH_A, attendance: [{ status: "available" }] }], error: null },
    { data: [{ ...MATCH_A, status: "invented" }], error: null },
  ]) {
    const fixture = clientDouble({ matches: [result] });
    assert.deepEqual(await listMatches("team-1", "user-1", { supabase: fixture.client }), { ok: false, error: "server" });
  }
});

test("getMatchDetail explicitly loads authorized match analysis and active invite candidates", async () => {
  const fixture = clientDouble({
    matches: [{ data: {
      ...MATCH_A,
      attendance: MATCH_A.attendance.map((row) => ({
        ...row,
        note: row.status === "available" ? "Có mặt sớm" : null,
        responded_at: row.status === "available" ? "2026-10-02T00:00:00+00:00" : null,
      })),
    }, error: null }],
    match_events: [{ data: [], error: null }],
    match_player_stats: [{ data: [], error: null }],
    match_team_stats: [{ data: null, error: null }],
    memberships: [{ data: [{ user_id: "00000000-0000-4000-8000-000000000010" }], error: null }],
    profiles: [{ data: [
      { id: "00000000-0000-4000-8000-000000000010", display_name: "Nguyễn An" },
      { id: "00000000-0000-4000-8000-000000000011", display_name: "Bình" },
    ], error: null }],
  });
  const result = await getMatchDetail(
    "team-1",
    MATCH_A.id,
    "00000000-0000-4000-8000-000000000010",
    true,
    { supabase: fixture.client },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.detail.inviteCandidates : null, [{
    userId: "00000000-0000-4000-8000-000000000010",
    displayName: "Nguyễn An",
    invited: true,
  }]);
  assert.deepEqual(fixture.calls.map(({ table, query }) => ({ table, calls: query.calls })), [
    { table: "matches", calls: [
      { method: "select", arguments: ["id,opponent,starts_at,venue,is_home,rsvp_deadline,status,team_score,opponent_score,updated_at,attendance:match_attendance(user_id,status,note,responded_at,updated_at)"] },
      { method: "eq", arguments: ["team_id", "team-1"] },
      { method: "eq", arguments: ["id", MATCH_A.id] },
      { method: "maybeSingle", arguments: [] },
    ] },
    { table: "match_events", calls: [
      { method: "select", arguments: ["id,minute,sequence_no,event_type,team_side,player_user_id,secondary_user_id,note"] },
      { method: "eq", arguments: ["team_id", "team-1"] },
      { method: "eq", arguments: ["match_id", MATCH_A.id] },
      { method: "order", arguments: ["minute", { ascending: true }] },
      { method: "order", arguments: ["sequence_no", { ascending: true }] },
      { method: "limit", arguments: [300] },
    ] },
    { table: "match_player_stats", calls: [
      { method: "select", arguments: ["user_id,minutes_played,goals,assists,rating,is_mvp"] },
      { method: "eq", arguments: ["team_id", "team-1"] },
      { method: "eq", arguments: ["match_id", MATCH_A.id] },
      { method: "order", arguments: ["user_id", { ascending: true }] },
      { method: "limit", arguments: [100] },
    ] },
    { table: "match_team_stats", calls: [
      { method: "select", arguments: ["schema_version,metrics"] },
      { method: "eq", arguments: ["team_id", "team-1"] },
      { method: "eq", arguments: ["match_id", MATCH_A.id] },
      { method: "maybeSingle", arguments: [] },
    ] },
    { table: "memberships", calls: [
      { method: "select", arguments: ["user_id"] },
      { method: "eq", arguments: ["team_id", "team-1"] },
      { method: "eq", arguments: ["status", "active"] },
      { method: "order", arguments: ["user_id", { ascending: true }] },
      { method: "limit", arguments: [200] },
    ] },
    { table: "profiles", calls: [
      { method: "select", arguments: ["id,display_name"] },
      { method: "in", arguments: ["id", [
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000011",
      ]] },
      { method: "order", arguments: ["id", { ascending: true }] },
      { method: "limit", arguments: [200] },
    ] },
  ]);
});
