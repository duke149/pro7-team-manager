import assert from "node:assert/strict";
import test from "node:test";

import type { MatchListResult, MatchSummary } from "../lib/matches/model";
import { loadOverview } from "../lib/overview/queries";

type Result = { data: unknown; error: null | { code?: string } };

class QueryDouble implements PromiseLike<Result> {
  readonly calls: { method: string; arguments: unknown[] }[] = [];
  constructor(private readonly result: Result) {}
  private chain(method: string, arguments_: unknown[]) { this.calls.push({ method, arguments: arguments_ }); return this; }
  select(...args: unknown[]) { return this.chain("select", args); }
  eq(...args: unknown[]) { return this.chain("eq", args); }
  lte(...args: unknown[]) { return this.chain("lte", args); }
  in(...args: unknown[]) { return this.chain("in", args); }
  order(...args: unknown[]) { return this.chain("order", args); }
  limit(...args: unknown[]) { return this.chain("limit", args); }
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
        const query = new QueryDouble(results[table]?.shift() ?? { data: [], error: null });
        calls.push({ table, query });
        return query;
      },
    } as never,
  };
}

const NOW = "2026-10-10T00:00:00.000Z";
const USER_ID = "00000000-0000-4000-8000-000000000010";
const PLAYER_A = "00000000-0000-4000-8000-000000000020";
const PLAYER_B = "00000000-0000-4000-8000-000000000021";

function summary(id: string, startsAt: string, overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id,
    opponent: `Opponent ${id.slice(-1)}`,
    startsAt,
    venue: "Riverside",
    isHome: true,
    rsvpDeadline: new Date(Date.parse(startsAt) - 86_400_000).toISOString(),
    status: "scheduled",
    teamScore: null,
    opponentScore: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    attendance: { invited: 3, available: 1, unavailable: 1, pending: 1 },
    ownAttendance: { status: "pending", updatedAt: "2026-10-02T00:00:00.000Z" },
    ...overrides,
  };
}

const COMPLETED_A = summary("00000000-0000-4000-8000-000000000101", "2026-10-01T12:00:00.000Z", { status: "completed", teamScore: 2, opponentScore: 1 });
const COMPLETED_B = summary("00000000-0000-4000-8000-000000000102", "2026-10-05T12:00:00.000Z", { status: "completed", teamScore: 1, opponentScore: 0 });
const UPCOMING = summary("00000000-0000-4000-8000-000000000103", "2026-10-12T12:00:00.000Z");

test("loadOverview uses bounded explicit queries and returns only published current news with completed-match scorers", async () => {
  const fixture = clientDouble({
    match_player_stats: [{ data: [
      { match_id: COMPLETED_A.id, user_id: PLAYER_A, goals: 2 },
      { match_id: COMPLETED_B.id, user_id: PLAYER_B, goals: 2 },
      { match_id: UPCOMING.id, user_id: PLAYER_A, goals: 99 },
    ], error: null }],
    team_news: [{ data: [
      { id: "00000000-0000-4000-8000-000000000201", title: "Tin mới", body: "Nội dung thật", status: "published", published_at: "2026-10-09T09:00:00.000Z" },
      { id: "00000000-0000-4000-8000-000000000200", title: "Tin cũ", body: "Nội dung cũ", status: "published", published_at: "2026-10-08T09:00:00.000Z" },
      { id: "00000000-0000-4000-8000-000000000199", title: "Tin thứ ba", body: "Nội dung ba", status: "published", published_at: "2026-10-07T09:00:00.000Z" },
      { id: "00000000-0000-4000-8000-000000000198", title: "Tin thứ tư", body: "Nội dung bốn", status: "published", published_at: "2026-10-06T09:00:00.000Z" },
    ], error: null }],
    profiles: [{ data: [
      { id: PLAYER_A, display_name: "Bình" },
      { id: PLAYER_B, display_name: "An" },
    ], error: null }],
  });
  const matchCalls: unknown[][] = [];
  const matches: MatchListResult = { ok: true, matches: [UPCOMING, COMPLETED_B, COMPLETED_A] };
  const result = await loadOverview("team-1", USER_ID, NOW, {
    supabase: fixture.client,
    listMatches: async (...args) => { matchCalls.push(args); return matches; },
  });

  assert.deepEqual(matchCalls, [["team-1", USER_ID]]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.data.news.map(({ title }) => title) : [], ["Tin mới", "Tin cũ", "Tin thứ ba", "Tin thứ tư"]);
  assert.deepEqual(result.ok ? result.data.statistics.topScorer : null, { userId: PLAYER_B, displayName: "An", goals: 2 });
  assert.equal(result.ok ? result.data.nextMatch?.id : null, UPCOMING.id);
  assert.deepEqual(fixture.calls.map(({ table, query }) => ({ table, calls: query.calls })), [
    { table: "match_player_stats", calls: [
      { method: "select", arguments: ["match_id,user_id,goals"] },
      { method: "eq", arguments: ["team_id", "team-1"] },
      { method: "order", arguments: ["match_id", { ascending: true }] },
      { method: "order", arguments: ["user_id", { ascending: true }] },
      { method: "limit", arguments: [1001] },
    ] },
    { table: "team_news", calls: [
      { method: "select", arguments: ["id,title,body,status,published_at"] },
      { method: "eq", arguments: ["team_id", "team-1"] },
      { method: "eq", arguments: ["status", "published"] },
      { method: "lte", arguments: ["published_at", NOW] },
      { method: "order", arguments: ["published_at", { ascending: false }] },
      { method: "order", arguments: ["id", { ascending: false }] },
      { method: "limit", arguments: [25] },
    ] },
    { table: "profiles", calls: [
      { method: "select", arguments: ["id,display_name"] },
      { method: "in", arguments: ["id", [PLAYER_A, PLAYER_B]] },
      { method: "order", arguments: ["id", { ascending: true }] },
      { method: "limit", arguments: [100] },
    ] },
  ]);
});

test("loadOverview preserves honest zero/empty statistics without profile lookups", async () => {
  const fixture = clientDouble({
    match_player_stats: [{ data: [], error: null }],
    team_news: [{ data: [], error: null }],
  });
  const result = await loadOverview("team-1", USER_ID, NOW, {
    supabase: fixture.client,
    listMatches: async () => ({ ok: true, matches: [] }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.data.nextMatch : "unexpected", null);
  assert.deepEqual(result.ok ? result.data.statistics : null, {
    completedMatches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    winRate: null,
    recentForm: [],
    recentPoints: 0,
    topScorer: null,
  });
  assert.deepEqual(fixture.calls.map(({ table }) => table), ["match_player_stats", "team_news"]);
});

test("loadOverview accepts a published offset timestamp that is before now by instant", async () => {
  const fixture = clientDouble({
    match_player_stats: [{ data: [], error: null }],
    team_news: [{ data: [{
      id: "00000000-0000-4000-8000-000000000201",
      title: "Tin theo múi giờ",
      body: "Đã phát hành trước thời điểm tải.",
      status: "published",
      published_at: "2026-10-10T06:00:00+07:00",
    }], error: null }],
  });
  const result = await loadOverview("team-1", USER_ID, NOW, {
    supabase: fixture.client,
    listMatches: async () => ({ ok: true, matches: [] }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.data.news.map(({ title }) => title) : [], ["Tin theo múi giờ"]);
});

test("loadOverview fails closed on match errors, inaccessible reads, overflow, and malformed rows", async () => {
  const cases: Array<{ matches?: MatchListResult; results: Record<string, Result[]> }> = [
    { matches: { ok: false, error: "server" }, results: {} },
    { results: { match_player_stats: [{ data: null, error: { code: "42501" } }], team_news: [{ data: [], error: null }] } },
    { results: { match_player_stats: [{ data: Array.from({ length: 1001 }, () => ({ match_id: COMPLETED_A.id, user_id: PLAYER_A, goals: 1 })), error: null }], team_news: [{ data: [], error: null }] } },
    { results: { match_player_stats: [{ data: [{ match_id: "bad", user_id: PLAYER_A, goals: -1 }], error: null }], team_news: [{ data: [], error: null }] } },
    { results: { match_player_stats: [{ data: [], error: null }], team_news: [{ data: [{ id: "bad", title: " ", body: "x", status: "draft", published_at: null }], error: null }] } },
  ];

  for (const fixtureCase of cases) {
    const fixture = clientDouble(fixtureCase.results);
    assert.deepEqual(await loadOverview("team-1", USER_ID, NOW, {
      supabase: fixture.client,
      listMatches: async () => fixtureCase.matches ?? { ok: true, matches: [COMPLETED_A] },
    }), { ok: false, error: "server" });
  }
});
