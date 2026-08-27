import assert from "node:assert/strict";
import test from "node:test";

import { mutateOverviewReminderRoute } from "../app/api/teams/[slug]/matches/[matchId]/remind/route";
import { remindPendingAttendance, type OverviewActionDependencies } from "../lib/overview/actions";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const ACTOR_ID = "00000000-0000-4000-8000-000000000002";
const MATCH_ID = "00000000-0000-4000-8000-000000000003";
const CONTEXT: TeamAccessContext = {
  team: { id: TEAM_ID, name: "PRO7 FC", slug: "pro7-fc" },
  userId: ACTOR_ID,
  membership: { roleId: "role-admin", roleSlug: "admin", roleName: "Admin" },
  permissions: ["matches.read", "matches.manage"],
};

function request(body: unknown = {}, headers: Record<string, string> = {}) {
  return new Request(`https://pro7.example/api/teams/pro7-fc/matches/${MATCH_ID}/remind`, {
    method: "POST",
    headers: { origin: "https://pro7.example", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function fixture(options: {
  context?: TeamAccessContext | null;
  rpcData?: unknown;
  rpcError?: { code?: string } | null;
} = {}) {
  const permissions: PermissionCode[] = [];
  const fromCalls: string[] = [];
  const rpcs: { name: string; args: unknown }[] = [];
  const deps: OverviewActionDependencies = {
    requireTeamPermission: async (_slug, permission) => {
      permissions.push(permission);
      return "context" in options ? options.context ?? null : CONTEXT;
    },
    supabase: {
      from(table: string) {
        fromCalls.push(table);
        throw new Error("Reminder action must not issue a PostgREST recipient query");
      },
      rpc: (async (name: string, args: unknown) => {
        rpcs.push({ name, args });
        return { data: "rpcData" in options ? options.rpcData : 0, error: options.rpcError ?? null };
      }) as never,
    } as never,
  };
  return { deps, permissions, fromCalls, rpcs };
}

const EXPECTED_RPC = {
  name: "remind_match_attendance",
  args: { p_team_id: TEAM_ID, p_match_id: MATCH_ID },
} as const;

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
    assert.deepEqual(value.fromCalls, []);
    assert.deepEqual(value.rpcs, []);
  }
});

test("reminder re-requires matches.manage before any database operation", async () => {
  const value = fixture({ context: null });
  const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);

  assert.equal(response.status, 403);
  assert.deepEqual(value.permissions, ["matches.manage"]);
  assert.deepEqual(value.fromCalls, []);
  assert.deepEqual(value.rpcs, []);
});

test("scheduled reminder delegates recipient derivation atomically to one exact two-argument RPC", async () => {
  const value = fixture({ rpcData: 201 });
  const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, reminded: 201 });
  assert.deepEqual(value.permissions, ["matches.manage"]);
  assert.deepEqual(value.fromCalls, []);
  assert.deepEqual(value.rpcs, [EXPECTED_RPC]);
});

test("scheduled reminder with zero pending recipients still calls the authoritative RPC", async () => {
  const value = fixture({ rpcData: 0 });
  const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, reminded: 0 });
  assert.deepEqual(value.fromCalls, []);
  assert.deepEqual(value.rpcs, [EXPECTED_RPC]);
});

test("valid nonexistent match is rejected by the authoritative RPC", async () => {
  const value = fixture({ rpcError: { code: "P0002" } });
  const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, code: "not_found", message: "Không tìm thấy trận đấu." });
  assert.deepEqual(value.fromCalls, []);
  assert.deepEqual(value.rpcs, [EXPECTED_RPC]);
});

test("reminder fails closed on malformed RPC counts", async () => {
  for (const rpcData of [-1, 1.5, "1", null]) {
    const value = fixture({ rpcData });
    const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);
    assert.equal(response.status, 500);
    assert.deepEqual(value.fromCalls, []);
    assert.deepEqual(value.rpcs, [EXPECTED_RPC]);
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
    const value = fixture({ rpcError: { code } });
    const response = await remindPendingAttendance(request(), { slug: "pro7-fc", matchId: MATCH_ID }, value.deps);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, publicCode);
    assert.deepEqual(value.fromCalls, []);
    assert.deepEqual(value.rpcs, [EXPECTED_RPC]);
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
