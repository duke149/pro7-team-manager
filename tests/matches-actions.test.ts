import assert from "node:assert/strict";
import test from "node:test";

import {
  createMatch,
  mutateMatch,
  mutateMatchAttendance,
  type MatchActionDependencies,
} from "../lib/matches/actions";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const MATCH_ID = "00000000-0000-4000-8000-000000000003";
const UPDATED_AT = "2026-10-01T00:00:00.000Z";
const CONTEXT: TeamAccessContext = {
  team: { id: TEAM_ID, name: "PRO7 FC", slug: "pro7-fc" },
  userId: USER_ID,
  membership: { roleId: "role-1", roleSlug: "admin", roleName: "Admin" },
  permissions: ["matches.read", "matches.manage", "matches.respond"],
};

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://pro7.example${path}`, {
    method: "POST",
    headers: { origin: "https://pro7.example", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function dependencies(options: {
  context?: TeamAccessContext | null;
  rpcError?: { code?: string } | null;
  rpcData?: unknown | unknown[];
} = {}) {
  const calls: { permission: PermissionCode; name?: string; args?: unknown }[] = [];
  const deps: MatchActionDependencies = {
    requireTeamPermission: async (_slug, permission) => {
      calls.push({ permission });
      return "context" in options ? options.context ?? null : CONTEXT;
    },
    supabase: {
      rpc: (async (name: string, args: unknown) => {
        calls.push({ permission: "matches.read", name, args });
        const data = Array.isArray(options.rpcData) ? options.rpcData.shift() : options.rpcData;
        return { data: data ?? MATCH_ID, error: options.rpcError ?? null };
      }) as never,
    },
  };
  return { deps, calls };
}

test("createMatch rejects cross-origin/non-JSON before permission or RPC work", async () => {
  for (const unsafe of [
    request("/api/teams/pro7-fc/matches", {}, { origin: "https://evil.example" }),
    request("/api/teams/pro7-fc/matches", {}, { "content-type": "text/plain" }),
  ]) {
    const fixture = dependencies();
    const response = await createMatch(unsafe, { slug: "pro7-fc" }, fixture.deps);
    assert.ok(response.status === 403 || response.status === 415);
    assert.equal(fixture.calls.length, 0);
  }
});

test("createMatch requires matches.manage and invokes manage_match with exact null lifecycle arguments", async () => {
  const denied = dependencies({ context: null });
  assert.equal((await createMatch(request("/api/teams/pro7-fc/matches", {
    opponent: "Metro City", startsAt: "2026-10-19T12:30:00.000Z", venue: null, isHome: true,
    rsvpDeadline: "2026-10-18T12:30:00.000Z",
  }), { slug: "pro7-fc" }, denied.deps)).status, 403);

  const fixture = dependencies();
  const response = await createMatch(request("/api/teams/pro7-fc/matches", {
    opponent: "Metro City", startsAt: "2026-10-19T12:30:00.000Z", venue: null, isHome: true,
    rsvpDeadline: "2026-10-18T12:30:00.000Z",
  }), { slug: "pro7-fc" }, fixture.deps);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, matchId: MATCH_ID });
  assert.deepEqual(fixture.calls, [
    { permission: "matches.manage" },
    { permission: "matches.read", name: "manage_match", args: {
      p_action: "create", p_team_id: TEAM_ID, p_match_id: null, p_opponent: "Metro City",
      p_starts_at: "2026-10-19T12:30:00.000Z", p_venue: null, p_is_home: true,
      p_rsvp_deadline: "2026-10-18T12:30:00.000Z", p_team_score: null,
      p_opponent_score: null, p_expected_updated_at: null,
    } },
  ]);
});

test("mutateMatch maps optimistic-lock and lifecycle RPC errors without leaking details", async () => {
  for (const [code, status, publicCode] of [
    ["40001", 409, "stale"],
    ["55000", 409, "lifecycle"],
    ["42501", 403, "forbidden"],
    ["P0002", 404, "not_found"],
    ["XX000", 500, "server"],
  ] as const) {
    const fixture = dependencies({ rpcError: { code } });
    const response = await mutateMatch(request(`/api/teams/pro7-fc/matches/${MATCH_ID}`, {
      action: "cancel", expectedUpdatedAt: UPDATED_AT,
    }), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, publicCode);
  }
});

test("attendance invite is Admin-only while response targets the authenticated user and preserves stale token", async () => {
  const inviteDenied = dependencies({ context: null });
  const deniedResponse = await mutateMatchAttendance(request("/attendance", {
    action: "invite", userIds: [USER_ID],
  }), { slug: "pro7-fc", matchId: MATCH_ID }, inviteDenied.deps);
  assert.equal(deniedResponse.status, 403);
  assert.deepEqual(inviteDenied.calls, [{ permission: "matches.manage" }]);

  const fixture = dependencies();
  const response = await mutateMatchAttendance(request("/attendance", {
    action: "respond", status: "unavailable", note: null, expectedUpdatedAt: UPDATED_AT,
  }), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.calls, [
    { permission: "matches.respond" },
    { permission: "matches.read", name: "respond_match_attendance", args: {
      p_team_id: TEAM_ID, p_match_id: MATCH_ID, p_user_id: USER_ID,
      p_status: "unavailable", p_note: null, p_expected_updated_at: UPDATED_AT,
    } },
  ]);
});

test("attendance invitation batches 201 members through the idempotent RPC and sums requested counts", async () => {
  const userIds = Array.from({ length: 201 }, (_, index) => `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`);
  const fixture = dependencies({ rpcData: [200, 1] });
  const response = await mutateMatchAttendance(request("/attendance", { action: "invite", userIds }), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, invited: 201 });
  assert.deepEqual(fixture.calls, [
    { permission: "matches.manage" },
    { permission: "matches.read", name: "invite_match_attendance", args: { p_team_id: TEAM_ID, p_match_id: MATCH_ID, p_user_ids: userIds.slice(0, 200) } },
    { permission: "matches.read", name: "invite_match_attendance", args: { p_team_id: TEAM_ID, p_match_id: MATCH_ID, p_user_ids: userIds.slice(200) } },
  ]);
});
