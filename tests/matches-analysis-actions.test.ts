import assert from "node:assert/strict";
import test from "node:test";

import { saveMatchAnalysis, type MatchAnalysisActionDependencies } from "../lib/matches/analysis-actions";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const MATCH_ID = "00000000-0000-4000-8000-000000000003";
const UPDATED_AT = "2026-10-01T00:00:00.000Z";
const NEXT_UPDATED_AT = "2026-10-01T00:00:00.000001Z";
const CONTEXT: TeamAccessContext = {
  team: { id: TEAM_ID, name: "PRO7 FC", slug: "pro7-fc" },
  userId: USER_ID,
  membership: { roleId: "role-1", roleSlug: "admin", roleName: "Admin" },
  permissions: ["matches.read", "matches.manage"],
};

function payload() {
  return {
    events: [{ minute: 12, sequenceNo: 1, eventType: "goal", teamSide: "team", playerUserId: USER_ID, secondaryUserId: null, note: null }],
    playerStats: [{ userId: USER_ID, minutesPlayed: 90, goals: 1, assists: 0, rating: 8.5, isMvp: true }],
    teamMetrics: { possession: { team: 55, opponent: 45 }, shots: { team: 8, opponent: 4 }, shotsOnTarget: { team: 4, opponent: 2 } },
    expectedUpdatedAt: UPDATED_AT,
  };
}

function request(value: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://pro7.example/api/teams/pro7-fc/matches/${MATCH_ID}/analysis`, {
    method: "PUT",
    headers: { origin: "https://pro7.example", "content-type": "application/json", ...headers },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
}

function dependencies(options: { context?: TeamAccessContext | null; rpcData?: unknown; rpcError?: { code?: string; message?: string } | null } = {}) {
  const calls: Array<{ permission?: PermissionCode; name?: string; args?: unknown }> = [];
  const deps: MatchAnalysisActionDependencies = {
    requireTeamPermission: async (_slug, permission) => {
      calls.push({ permission });
      return "context" in options ? options.context ?? null : CONTEXT;
    },
    supabase: {
      rpc: (async (name: string, args: unknown) => {
        calls.push({ name, args });
        return { data: "rpcData" in options ? options.rpcData : NEXT_UPDATED_AT, error: options.rpcError ?? null };
      }) as never,
    },
  };
  return { deps, calls };
}

test("saveMatchAnalysis rejects unsafe requests, malformed JSON, oversized bodies, and bad match IDs before authorization", async () => {
  const cases: Array<[Request, number]> = [
    [request(payload(), { origin: "https://evil.example" }), 403],
    [request(payload(), { "content-type": "text/plain" }), 415],
    [request("{"), 400],
    [request(payload(), { "content-length": "524289" }), 413],
    [request(`"${"đ".repeat(300_000)}"`), 413],
  ];
  for (const [unsafe, status] of cases) {
    const fixture = dependencies();
    const response = await saveMatchAnalysis(unsafe, { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
    assert.equal(response.status, status);
    assert.equal(fixture.calls.length, 0);
  }
  const fixture = dependencies();
  const response = await saveMatchAnalysis(request(payload()), { slug: "pro7-fc", matchId: "not-a-uuid" }, fixture.deps);
  assert.equal(response.status, 404);
  assert.equal(fixture.calls.length, 0);
});

test("saveMatchAnalysis rejects malformed and invalid payloads before permission or RPC work", async () => {
  for (const [value, status] of [
    [{ ...payload(), extra: true }, 400],
    [{ ...payload(), playerStats: [{ ...payload().playerStats[0], rating: 11 }] }, 422],
  ] as const) {
    const fixture = dependencies();
    const response = await saveMatchAnalysis(request(value), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
    assert.equal(response.status, status);
    assert.equal(fixture.calls.length, 0);
  }
});

test("saveMatchAnalysis requires matches.manage and binds the verified team in one exact RPC call", async () => {
  const denied = dependencies({ context: null });
  const deniedResponse = await saveMatchAnalysis(request(payload()), { slug: "pro7-fc", matchId: MATCH_ID }, denied.deps);
  assert.equal(deniedResponse.status, 403);
  assert.deepEqual(denied.calls, [{ permission: "matches.manage" }]);

  const fixture = dependencies();
  const response = await saveMatchAnalysis(request(payload()), { slug: "untrusted-route-slug", matchId: MATCH_ID }, fixture.deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, updatedAt: NEXT_UPDATED_AT });
  assert.deepEqual(fixture.calls, [
    { permission: "matches.manage" },
    { name: "manage_match_analysis", args: {
      p_team_id: TEAM_ID,
      p_match_id: MATCH_ID,
      p_events: [{ minute: 12, sequence_no: 1, event_type: "goal", team_side: "team", player_user_id: USER_ID, secondary_user_id: null, note: null }],
      p_player_stats: [{ user_id: USER_ID, minutes_played: 90, goals: 1, assists: 0, rating: 8.5, is_mvp: true }],
      p_team_metrics: { possession: { team: 55, opponent: 45 }, shots: { team: 8, opponent: 4 }, shots_on_target: { team: 4, opponent: 2 } },
      p_expected_updated_at: UPDATED_AT,
    } },
  ]);
});

test("saveMatchAnalysis maps database failures to stable public responses without leaking raw messages", async () => {
  for (const [code, status, publicCode] of [
    ["40001", 409, "stale"],
    ["55000", 409, "lifecycle"],
    ["42501", 403, "forbidden"],
    ["28000", 403, "forbidden"],
    ["P0002", 404, "not_found"],
    ["22023", 422, "validation"],
    ["23503", 422, "validation"],
    ["23505", 422, "validation"],
    ["23514", 422, "validation"],
    ["XX000", 500, "server"],
  ] as const) {
    const fixture = dependencies({ rpcError: { code, message: "secret table and SQL detail" } });
    const response = await saveMatchAnalysis(request(payload()), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.code, publicCode);
    assert.doesNotMatch(JSON.stringify(body), /secret table|SQL detail/u);
    assert.equal(fixture.calls.filter((call) => call.name === "manage_match_analysis").length, 1);
  }
});

test("saveMatchAnalysis fails closed when RPC success does not return a valid timestamp", async () => {
  for (const rpcData of [null, "", "not-a-time", "2026-02-31T00:00:00Z"]) {
    const fixture = dependencies({ rpcData });
    const response = await saveMatchAnalysis(request(payload()), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false, code: "server", message: "Không thể lưu phân tích trận đấu. Vui lòng thử lại." });
  }
});
