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
  gt(...args: unknown[]) { return this.chain("gt", args); }
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
  cancelled_at: null,
  updated_at: "2026-10-01T00:00:00+00:00",
  attendance: [
    { user_id: "00000000-0000-4000-8000-000000000010", status: "available", updated_at: "2026-10-02T00:00:00+00:00" },
    { user_id: "00000000-0000-4000-8000-000000000011", status: "pending", updated_at: "2026-10-02T00:00:00+00:00" },
  ],
};
const USER_ID = "00000000-0000-4000-8000-000000000010";

test("listMatches uses an explicit scoped select and returns stable startsAt/id order with live RSVP counts", async () => {
  const fixture = clientDouble({ matches: [{ data: [
    MATCH_A,
    { ...MATCH_A, id: "00000000-0000-4000-8000-000000000102", starts_at: "2026-10-18T12:30:00+00:00", rsvp_deadline: "2026-10-17T12:30:00+00:00" },
  ], error: null }] });
  const result = await listMatches("team-1", "00000000-0000-4000-8000-000000000010", { supabase: fixture.client });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.matches.map((match) => match.id) : [], [
    "00000000-0000-4000-8000-000000000102",
    "00000000-0000-4000-8000-000000000101",
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
    { method: "select", arguments: ["id,opponent,starts_at,venue,is_home,rsvp_deadline,status,team_score,opponent_score,cancelled_at,updated_at,attendance:match_attendance(user_id,status,updated_at)"] },
    { method: "eq", arguments: ["team_id", "team-1"] },
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

test("listMatches fails closed on every database match and attendance contract violation", async () => {
  const invalidRows = [
    { ...MATCH_A, id: "not-a-uuid" },
    { ...MATCH_A, opponent: "   " },
    { ...MATCH_A, opponent: "x".repeat(121) },
    { ...MATCH_A, starts_at: "2026-02-31T12:30:00Z" },
    { ...MATCH_A, venue: " " },
    { ...MATCH_A, rsvp_deadline: "2026-10-20T12:30:00Z" },
    { ...MATCH_A, team_score: -1 },
    { ...MATCH_A, team_score: 1.5 },
    { ...MATCH_A, status: "completed", team_score: null, opponent_score: 1 },
    { ...MATCH_A, status: "cancelled", cancelled_at: null },
    { ...MATCH_A, status: "completed", team_score: 1, opponent_score: 0, cancelled_at: "2026-10-19T14:30:00Z" },
    { ...MATCH_A, attendance: [{ ...MATCH_A.attendance[0], user_id: "bad" }] },
    { ...MATCH_A, attendance: [{ ...MATCH_A.attendance[0], updated_at: "2026-02-31T12:30:00Z" }] },
  ];
  for (const row of invalidRows) {
    const fixture = clientDouble({ matches: [{ data: [row], error: null }] });
    assert.deepEqual(await listMatches("team-1", "user-1", { supabase: fixture.client }), { ok: false, error: "server" });
  }
});

test("listMatches keyset-pages beyond 100 rows without losing the next or latest completed match", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    ...MATCH_A,
    id: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
    starts_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    rsvp_deadline: new Date(Date.UTC(2025, 11, index + 1)).toISOString(),
    ...(index === 99 ? { status: "completed", team_score: 2, opponent_score: 1 } : {}),
  }));
  const fixture = clientDouble({ matches: [
    { data: rows.slice(0, 100), error: null },
    { data: rows.slice(100), error: null },
  ] });
  const result = await listMatches("team-1", USER_ID, { supabase: fixture.client });
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.matches.length : 0, 101);
  assert.equal(fixture.calls.length, 2);
  assert.deepEqual(fixture.calls[1]?.query.calls.at(-2), { method: "gt", arguments: ["id", rows[99]?.id] });
});

test("listMatches reports a server error instead of silently omitting rows above its explicit safe bound", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    ...MATCH_A,
    id: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
  }));
  const fixture = clientDouble({ matches: Array.from({ length: 11 }, (_, page) => ({ data: rows.slice(page * 100, (page + 1) * 100), error: null })) });
  assert.deepEqual(await listMatches("team-1", USER_ID, { supabase: fixture.client }), { ok: false, error: "server" });
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
      { method: "select", arguments: ["id,opponent,starts_at,venue,is_home,rsvp_deadline,status,team_score,opponent_score,cancelled_at,updated_at,attendance:match_attendance(user_id,status,note,responded_at,updated_at)"] },
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
      { method: "limit", arguments: [201] },
    ] },
    { table: "match_player_stats", calls: [
      { method: "select", arguments: ["user_id,minutes_played,goals,assists,rating,is_mvp"] },
      { method: "eq", arguments: ["team_id", "team-1"] },
      { method: "eq", arguments: ["match_id", MATCH_A.id] },
      { method: "order", arguments: ["user_id", { ascending: true }] },
      { method: "limit", arguments: [101] },
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
      { method: "limit", arguments: [100] },
    ] },
    { table: "profiles", calls: [
      { method: "select", arguments: ["id,display_name"] },
      { method: "in", arguments: ["id", [
        "00000000-0000-4000-8000-000000000010",
        "00000000-0000-4000-8000-000000000011",
      ]] },
      { method: "order", arguments: ["id", { ascending: true }] },
      { method: "limit", arguments: [100] },
    ] },
  ]);
});

test("getMatchDetail fails closed on malformed attendance, event, and player-stat rows", async () => {
  const validDetailMatch = {
    ...MATCH_A,
    attendance: MATCH_A.attendance.map((row) => ({ ...row, note: null, responded_at: row.status === "pending" ? null : "2026-10-02T00:00:00+00:00" })),
  };
  const cases = [
    { matches: [{ data: { ...validDetailMatch, attendance: [{ ...validDetailMatch.attendance[0], status: "available", responded_at: null }] }, error: null }], match_events: [{ data: [], error: null }], match_player_stats: [{ data: [], error: null }] },
    { matches: [{ data: validDetailMatch, error: null }], match_events: [{ data: [{ id: "bad", minute: -1, sequence_no: 0, event_type: "goal", team_side: "team", player_user_id: null, secondary_user_id: null, note: " " }], error: null }], match_player_stats: [{ data: [], error: null }] },
    { matches: [{ data: validDetailMatch, error: null }], match_events: [{ data: [], error: null }], match_player_stats: [{ data: [{ user_id: "bad", minutes_played: 121, goals: -1, assists: 0.5, rating: 11, is_mvp: false }], error: null }] },
    { matches: [{ data: { ...validDetailMatch, attendance: [validDetailMatch.attendance[0], validDetailMatch.attendance[0]] }, error: null }], match_events: [{ data: [], error: null }], match_player_stats: [{ data: [], error: null }] },
    { matches: [{ data: validDetailMatch, error: null }], match_events: [{ data: [
      { id: "00000000-0000-4000-8000-000000000201", minute: 10, sequence_no: 1, event_type: "goal", team_side: "team", player_user_id: null, secondary_user_id: null, note: null },
      { id: "00000000-0000-4000-8000-000000000202", minute: 10, sequence_no: 1, event_type: "note", team_side: "team", player_user_id: null, secondary_user_id: null, note: null },
    ], error: null }], match_player_stats: [{ data: [], error: null }] },
    { matches: [{ data: validDetailMatch, error: null }], match_events: [{ data: [], error: null }], match_player_stats: [{ data: [
      { user_id: "00000000-0000-4000-8000-000000000010", minutes_played: 90, goals: 1, assists: 0, rating: 9.1, is_mvp: true },
      { user_id: "00000000-0000-4000-8000-000000000010", minutes_played: 90, goals: 1, assists: 0, rating: 9.1, is_mvp: true },
    ], error: null }] },
  ];
  for (const value of cases) {
    const fixture = clientDouble({ ...value, match_team_stats: [{ data: null, error: null }] });
    assert.deepEqual(await getMatchDetail("team-1", MATCH_A.id, USER_ID, false, { supabase: fixture.client }), { ok: false, error: "server" });
  }
});

test("getMatchDetail keyset-pages all 201 active invite candidates and profile batches", async () => {
  const ids = Array.from({ length: 201 }, (_, index) => `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`);
  const fixture = clientDouble({
    matches: [{ data: { ...MATCH_A, attendance: [] }, error: null }],
    match_events: [{ data: [], error: null }],
    match_player_stats: [{ data: [], error: null }],
    match_team_stats: [{ data: null, error: null }],
    memberships: [
      { data: ids.slice(0, 100).map((user_id) => ({ user_id })), error: null },
      { data: ids.slice(100, 200).map((user_id) => ({ user_id })), error: null },
      { data: ids.slice(200).map((user_id) => ({ user_id })), error: null },
    ],
    profiles: [
      { data: ids.slice(0, 100).map((id) => ({ id, display_name: null })), error: null },
      { data: ids.slice(100, 200).map((id) => ({ id, display_name: null })), error: null },
      { data: ids.slice(200).map((id) => ({ id, display_name: null })), error: null },
    ],
  });
  const result = await getMatchDetail("team-1", MATCH_A.id, USER_ID, true, { supabase: fixture.client });
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.detail.inviteCandidates.length : 0, 201);
  const membershipCalls = fixture.calls.filter(({ table }) => table === "memberships");
  assert.equal(membershipCalls.length, 3);
  assert.deepEqual(membershipCalls[1]?.query.calls.at(-2), { method: "gt", arguments: ["user_id", ids[99]] });
  assert.equal(fixture.calls.filter(({ table }) => table === "profiles").length, 3);
});

test("getMatchDetail reports explicit overflow instead of truncating active invite candidates", async () => {
  const ids = Array.from({ length: 401 }, (_, index) => `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`);
  const fixture = clientDouble({
    matches: [{ data: { ...MATCH_A, attendance: [] }, error: null }],
    match_events: [{ data: [], error: null }],
    match_player_stats: [{ data: [], error: null }],
    match_team_stats: [{ data: null, error: null }],
    memberships: Array.from({ length: 5 }, (_, page) => ({ data: ids.slice(page * 100, (page + 1) * 100).map((user_id) => ({ user_id })), error: null })),
  });
  assert.deepEqual(await getMatchDetail("team-1", MATCH_A.id, USER_ID, true, { supabase: fixture.client }), { ok: false, error: "server" });
  assert.equal(fixture.calls.filter(({ table }) => table === "profiles").length, 0);
});

test("getMatchDetail builds Admin analysis candidates from active, invited, and historical event/stat identities", async () => {
  const activeId = "00000000-0000-4000-8000-000000000020";
  const historicalId = "00000000-0000-4000-8000-000000000021";
  const scorerId = "00000000-0000-4000-8000-000000000022";
  const assistId = "00000000-0000-4000-8000-000000000023";
  const statOnlyId = "00000000-0000-4000-8000-000000000024";
  const completed = {
    ...MATCH_A,
    status: "completed",
    team_score: 2,
    opponent_score: 1,
    attendance: [{ user_id: historicalId, status: "available", note: null, responded_at: "2026-10-02T00:00:00+00:00", updated_at: "2026-10-02T00:00:00+00:00" }],
  };
  const fixture = clientDouble({
    matches: [{ data: completed, error: null }],
    match_events: [{ data: [{ id: "00000000-0000-4000-8000-000000000201", minute: 12, sequence_no: 1, event_type: "goal", team_side: "team", player_user_id: scorerId, secondary_user_id: assistId, note: null }], error: null }],
    match_player_stats: [{ data: [{ user_id: statOnlyId, minutes_played: 90, goals: 0, assists: 0, rating: 7.5, is_mvp: false }], error: null }],
    match_team_stats: [{ data: { schema_version: 1, metrics: {} }, error: null }],
    memberships: [{ data: [{ user_id: activeId }], error: null }],
    profiles: [{ data: [
      { id: activeId, display_name: "An Active" },
      { id: historicalId, display_name: "Cường Former" },
      { id: scorerId, display_name: "Dũng Scorer" },
      { id: assistId, display_name: "Bình Assist" },
      { id: statOnlyId, display_name: "Em Stat" },
    ], error: null }],
  });
  const result = await getMatchDetail("team-1", MATCH_A.id, USER_ID, true, { supabase: fixture.client });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.detail.analysisCandidates, [
    { userId: activeId, displayName: "An Active" },
    { userId: assistId, displayName: "Bình Assist" },
    { userId: historicalId, displayName: "Cường Former" },
    { userId: scorerId, displayName: "Dũng Scorer" },
    { userId: statOnlyId, displayName: "Em Stat" },
  ]);
  assert.deepEqual(result.detail.events[0], {
    id: "00000000-0000-4000-8000-000000000201",
    minute: 12,
    sequenceNo: 1,
    eventType: "goal",
    teamSide: "team",
    playerUserId: scorerId,
    playerDisplayName: "Dũng Scorer",
    secondaryUserId: assistId,
    secondaryDisplayName: "Bình Assist",
    note: null,
  });
});

test("getMatchDetail resolves read-only historical names but omits analysis editor candidates for Members", async () => {
  const historicalId = "00000000-0000-4000-8000-000000000021";
  const scorerId = "00000000-0000-4000-8000-000000000022";
  const completed = {
    ...MATCH_A,
    status: "completed",
    team_score: 1,
    opponent_score: 0,
    attendance: [{ user_id: historicalId, status: "available", note: null, responded_at: "2026-10-02T00:00:00+00:00", updated_at: "2026-10-02T00:00:00+00:00" }],
  };
  const fixture = clientDouble({
    matches: [{ data: completed, error: null }],
    match_events: [{ data: [{ id: "00000000-0000-4000-8000-000000000201", minute: 12, sequence_no: 1, event_type: "goal", team_side: "team", player_user_id: scorerId, secondary_user_id: null, note: null }], error: null }],
    match_player_stats: [{ data: [], error: null }],
    match_team_stats: [{ data: null, error: null }],
    profiles: [{ data: [
      { id: historicalId, display_name: "Cường Former" },
      { id: scorerId, display_name: "Dũng Scorer" },
    ], error: null }],
  });
  const result = await getMatchDetail("team-1", MATCH_A.id, USER_ID, false, { supabase: fixture.client });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.detail.analysisCandidates, []);
  assert.equal(result.detail.events[0]?.playerDisplayName, "Dũng Scorer");
  assert.equal(fixture.calls.some(({ table }) => table === "memberships"), false);
});

test("getMatchDetail fails closed on invalid metrics and analysis row overflow", async () => {
  const validDetailMatch = {
    ...MATCH_A,
    attendance: MATCH_A.attendance.map((row) => ({ ...row, note: null, responded_at: row.status === "pending" ? null : "2026-10-02T00:00:00+00:00" })),
  };
  for (const value of [
    { events: [], stats: [], metrics: { possession: { team: 60, opponent: 39 } } },
    { events: [], stats: [], metrics: { shots: { team: -1, opponent: 2 } } },
    { events: [], stats: [], metrics: { shots: { team: 2, opponent: 2 }, shots_on_target: { team: 3, opponent: 1 } } },
    { events: Array.from({ length: 201 }, (_, index) => ({ id: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`, minute: index % 121, sequence_no: Math.floor(index / 121) + 1, event_type: "note", team_side: "team", player_user_id: null, secondary_user_id: null, note: `Event ${index}` })), stats: [], metrics: null },
    { events: [], stats: Array.from({ length: 101 }, (_, index) => ({ user_id: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`, minutes_played: 1, goals: 0, assists: 0, rating: null, is_mvp: false })), metrics: null },
  ]) {
    const fixture = clientDouble({
      matches: [{ data: validDetailMatch, error: null }],
      match_events: [{ data: value.events, error: null }],
      match_player_stats: [{ data: value.stats, error: null }],
      match_team_stats: [{ data: value.metrics === null ? null : { schema_version: 1, metrics: value.metrics }, error: null }],
    });
    assert.deepEqual(await getMatchDetail("team-1", MATCH_A.id, USER_ID, false, { supabase: fixture.client }), { ok: false, error: "server" });
  }
});
