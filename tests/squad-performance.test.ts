import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listSquadPerformance } from "../lib/squad/performance";
import type { Database } from "../lib/supabase/database.types";

const PLAYER_A = "00000000-0000-4000-8000-000000000001";
const PLAYER_B = "00000000-0000-4000-8000-000000000002";
const PLAYER_C = "00000000-0000-4000-8000-000000000003";
const MATCH_A = "10000000-0000-4000-8000-000000000001";
const MATCH_B = "10000000-0000-4000-8000-000000000002";
const MATCH_C = "10000000-0000-4000-8000-000000000003";

type ResponseShape = {
  data: unknown;
  error: { code: string; message: string; details: string; hint: string } | null;
};
type QueryCall = { method: string; arguments: unknown[] };

function response(data: unknown, error: ResponseShape["error"] = null): ResponseShape {
  return { data, error };
}

class QueryDouble implements PromiseLike<ResponseShape> {
  readonly calls: QueryCall[] = [];
  constructor(private readonly result: ResponseShape) {}
  private record(method: string, ...arguments_: unknown[]) {
    this.calls.push({ method, arguments: arguments_ });
    return this;
  }
  select(...arguments_: unknown[]) { return this.record("select", ...arguments_); }
  eq(...arguments_: unknown[]) { return this.record("eq", ...arguments_); }
  gt(...arguments_: unknown[]) { return this.record("gt", ...arguments_); }
  in(...arguments_: unknown[]) { return this.record("in", ...arguments_); }
  order(...arguments_: unknown[]) { return this.record("order", ...arguments_); }
  limit(...arguments_: unknown[]) { return this.record("limit", ...arguments_); }
  then<TResult1 = ResponseShape, TResult2 = never>(
    onfulfilled?: ((value: ResponseShape) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function clientDouble({ matches = [], stats = [] }: { matches?: ResponseShape[]; stats?: ResponseShape[] } = {}) {
  const queues = { matches: [...matches], match_player_stats: [...stats] };
  const calls: Array<{ table: string; query: QueryDouble }> = [];
  const client = {
    from(table: "matches" | "match_player_stats") {
      const result = queues[table].shift();
      assert.ok(result, `unexpected ${table} query`);
      const query = new QueryDouble(result);
      calls.push({ table, query });
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

const matches = [
  { id: MATCH_A, starts_at: "2026-10-03T12:00:00Z", team_score: 3, opponent_score: 1 },
  { id: MATCH_B, starts_at: "2026-10-02T12:00:00Z", team_score: 0, opponent_score: 1 },
  { id: MATCH_C, starts_at: "2026-10-01T12:00:00Z", team_score: 2, opponent_score: 2 },
];

test("Squad performance remains server-only", () => {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", 'globalThis.window = {}; await import("./lib/squad/performance.ts");'],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.notEqual(child.status, 0);
  assert.match(`${child.stdout}${child.stderr}`, /PRO7 server-only boundary/u);
});

test("aggregates only positive-minute completed-match appearances and returns explicit recorded states", async () => {
  const fixture = clientDouble({
    matches: [response(matches)],
    stats: [response([
      { match_id: MATCH_A, user_id: PLAYER_A, minutes_played: 90, goals: 2, assists: 1, rating: 8.5, is_mvp: true },
      { match_id: MATCH_A, user_id: PLAYER_B, minutes_played: 0, goals: 0, assists: 0, rating: null, is_mvp: false },
      { match_id: MATCH_B, user_id: PLAYER_A, minutes_played: 45, goals: 0, assists: 0, rating: 7.5, is_mvp: false },
      { match_id: MATCH_C, user_id: PLAYER_A, minutes_played: 0, goals: 0, assists: 0, rating: null, is_mvp: false },
    ])],
  });
  const result = await listSquadPerformance("team-1", [PLAYER_A, PLAYER_B, PLAYER_C], { supabase: fixture.client });

  assert.deepEqual(result, {
    ok: true,
    players: [
      { userId: PLAYER_A, recorded: true, appearances: 2, recentForm: ["W", "L"], minutes: 135, goals: 2, assists: 1, mvpCount: 1, averageRating: 8 },
      { userId: PLAYER_B, recorded: true, appearances: 0, recentForm: [], minutes: 0, goals: 0, assists: 0, mvpCount: 0, averageRating: null },
      { userId: PLAYER_C, recorded: false, appearances: 0, recentForm: [], minutes: 0, goals: 0, assists: 0, mvpCount: 0, averageRating: null },
    ],
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.ok && Object.isFrozen(result.players), true);
  assert.equal(result.ok && Object.isFrozen(result.players[0]), true);
  assert.deepEqual(fixture.calls.map(({ table }) => table), ["matches", "match_player_stats"]);
  assert.deepEqual(fixture.calls[0]?.query.calls, [
    { method: "select", arguments: ["id,starts_at,team_score,opponent_score"] },
    { method: "eq", arguments: ["team_id", "team-1"] },
    { method: "eq", arguments: ["status", "completed"] },
    { method: "order", arguments: ["id", { ascending: true }] },
    { method: "limit", arguments: [50] },
  ]);
  assert.deepEqual(fixture.calls[1]?.query.calls, [
    { method: "select", arguments: ["match_id,user_id,minutes_played,goals,assists,rating,is_mvp"] },
    { method: "eq", arguments: ["team_id", "team-1"] },
    { method: "in", arguments: ["match_id", [MATCH_A, MATCH_B, MATCH_C]] },
    { method: "in", arguments: ["user_id", [PLAYER_A, PLAYER_B, PLAYER_C]] },
    { method: "order", arguments: ["match_id", { ascending: true }] },
    { method: "order", arguments: ["user_id", { ascending: true }] },
    { method: "limit", arguments: [10] },
  ]);
});

test("an empty completed-match history returns not-recorded players without querying RSVP, events, or stats", async () => {
  const fixture = clientDouble({ matches: [response([])] });
  const result = await listSquadPerformance("team-1", [PLAYER_A], { supabase: fixture.client });
  assert.deepEqual(result, {
    ok: true,
    players: [{ userId: PLAYER_A, recorded: false, appearances: 0, recentForm: [], minutes: 0, goals: 0, assists: 0, mvpCount: 0, averageRating: null }],
  });
  assert.deepEqual(fixture.calls.map(({ table }) => table), ["matches"]);
});

test("rejects malformed input, query errors, match rows, and player-stat rows instead of substituting zero", async () => {
  const databaseError = { code: "XX000", message: "secret SQL", details: "private table", hint: "" };
  const cases: Array<{ userIds?: string[]; matches: ResponseShape[]; stats?: ResponseShape[] }> = [
    { userIds: ["bad"], matches: [] },
    { matches: [response(null, databaseError)] },
    { matches: [response([{ ...matches[0], id: "bad" }])] },
    { matches: [response([{ ...matches[0], starts_at: "2026-02-31T12:00:00Z" }])] },
    { matches: [response([{ ...matches[0], team_score: -1 }])] },
    { matches: [response([matches[0]])], stats: [response(null, databaseError)] },
    { matches: [response([matches[0]])], stats: [response([{ match_id: MATCH_A, user_id: PLAYER_A, minutes_played: 1.5, goals: 0, assists: 0, rating: null, is_mvp: false }])] },
    { matches: [response([matches[0]])], stats: [response([{ match_id: MATCH_A, user_id: PLAYER_C, minutes_played: 1, goals: 0, assists: 0, rating: null, is_mvp: false }])] },
    { matches: [response([matches[0]])], stats: [response([
      { match_id: MATCH_A, user_id: PLAYER_A, minutes_played: 1, goals: 0, assists: 0, rating: null, is_mvp: false },
      { match_id: MATCH_A, user_id: PLAYER_A, minutes_played: 2, goals: 0, assists: 0, rating: null, is_mvp: false },
    ])] },
  ];
  for (const fixtureCase of cases) {
    const fixture = clientDouble({ matches: fixtureCase.matches, stats: fixtureCase.stats ?? [] });
    assert.deepEqual(
      await listSquadPerformance("team-1", fixtureCase.userIds ?? [PLAYER_A], { supabase: fixture.client }),
      { ok: false, error: "server" },
    );
  }
});

test("fails closed above 200 completed matches and rejects non-monotonic or oversized pages", async () => {
  const rows = Array.from({ length: 201 }, (_, index) => ({
    id: `10000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
    starts_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    team_score: 1,
    opponent_score: 0,
  }));
  const overflow = clientDouble({ matches: [
    response(rows.slice(0, 50)),
    response(rows.slice(50, 100)),
    response(rows.slice(100, 150)),
    response(rows.slice(150, 200)),
    response(rows.slice(200)),
  ] });
  assert.deepEqual(await listSquadPerformance("team-1", [PLAYER_A], { supabase: overflow.client }), { ok: false, error: "server" });
  assert.deepEqual(overflow.calls.filter(({ table }) => table === "matches")[1]?.query.calls.at(-2), { method: "gt", arguments: ["id", rows[49]?.id] });
  assert.equal(overflow.calls.some(({ table }) => table === "match_player_stats"), false);

  const duplicate = clientDouble({ matches: [response([matches[0], matches[0]])] });
  assert.deepEqual(await listSquadPerformance("team-1", [PLAYER_A], { supabase: duplicate.client }), { ok: false, error: "server" });
  const oversized = clientDouble({ matches: [response(Array.from({ length: 51 }, () => matches[0]))] });
  assert.deepEqual(await listSquadPerformance("team-1", [PLAYER_A], { supabase: oversized.client }), { ok: false, error: "server" });
});
