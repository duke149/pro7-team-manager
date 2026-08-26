import assert from "node:assert/strict";
import test from "node:test";

import { mutateTactics, type TacticsActionDependencies } from "../lib/tactics/actions";
import type { TeamAccessContext } from "../lib/teams/context";
import type { PermissionCode } from "../lib/teams/permissions";

const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const MATCH_ID = "00000000-0000-4000-8000-000000000003";
const TACTIC_ID = "00000000-0000-4000-8000-000000000004";
const UPDATED_AT = "2026-10-01T00:00:00.000Z";
const PLAYER_IDS = Array.from({ length: 8 }, (_, index) => `00000000-0000-4000-8000-${(index + 10).toString().padStart(12, "0")}`);
const CONTEXT: TeamAccessContext = {
  team: { id: TEAM_ID, name: "PRO7 FC", slug: "pro7-fc" },
  userId: USER_ID,
  membership: { roleId: "role-1", roleSlug: "admin", roleName: "Admin" },
  permissions: ["tactics.read", "tactics.manage"],
};

function slots() {
  return PLAYER_IDS.map((userId, index) => ({
    userId,
    slotKind: index < 7 ? "starter" : "bench",
    slotKey: index < 7 ? `starter-${index + 1}` : "bench-1",
    roleLabel: index === 0 ? "GK" : index < 3 ? "DEF" : index < 6 ? "MID" : "ATT",
    shirtNumber: index + 1,
    x: index === 0 ? 50 : 15 + index * 10,
    y: index === 0 ? 90 : 75 - index * 8,
  }));
}

function payload() {
  return { action: "save", tacticId: TACTIC_ID, mode: "balanced", formation: "2-3-1", instructions: null, version: 2, pressing: "high", defensiveLine: "medium", slots: slots(), expectedUpdatedAt: UPDATED_AT };
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://pro7.example/api/teams/pro7-fc/tactics/${MATCH_ID}`, {
    method: "POST",
    headers: { origin: "https://pro7.example", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function dependencies(options: { context?: TeamAccessContext | null; activeIds?: readonly string[]; rpcError?: { code?: string } | null; rpcData?: unknown; savedRow?: unknown } = {}) {
  const calls: Array<{ kind: "permission"; permission: PermissionCode } | { kind: "from"; table: string } | { kind: "rpc"; name: string; args: unknown }> = [];
  const activeIds = options.activeIds ?? PLAYER_IDS;
  const membershipQuery = {
    select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
    async limit() { return { data: activeIds.map((user_id) => ({ user_id })), error: null }; },
  };
  const savedTacticQuery = {
    select() { return this; }, eq() { return this; }, limit() { return this; },
    async maybeSingle() { return { data: "savedRow" in options ? options.savedRow : { id: TACTIC_ID, version: 3, updated_at: "2026-10-02T00:00:00.000Z", status: "draft" }, error: null }; },
  };
  const deps: TacticsActionDependencies = {
    requireTeamPermission: async (_slug, permission) => { calls.push({ kind: "permission", permission }); return "context" in options ? options.context ?? null : CONTEXT; },
    supabase: {
      from: ((table: string) => { calls.push({ kind: "from", table }); return table === "memberships" ? membershipQuery : savedTacticQuery; }) as never,
      rpc: (async (name: string, args: unknown) => { calls.push({ kind: "rpc", name, args }); return { data: "rpcData" in options ? options.rpcData : TACTIC_ID, error: options.rpcError ?? null }; }) as never,
    },
  };
  return { deps, calls };
}

test("tactics mutations reject cross-origin and non-JSON requests before permission or database work", async () => {
  for (const unsafe of [
    request(payload(), { origin: "https://evil.example" }),
    request(payload(), { "content-type": "text/plain" }),
  ]) {
    const fixture = dependencies();
    const response = await mutateTactics(unsafe, { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
    assert.ok(response.status === 403 || response.status === 415);
    assert.deepEqual(fixture.calls, []);
  }
});

test("Admin save verifies every lineup user is active on the guarded team and invokes the exact RPC contract", async () => {
  const fixture = dependencies();
  const response = await mutateTactics(request(payload()), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, tactic: { id: TACTIC_ID, version: 3, updatedAt: "2026-10-02T00:00:00.000Z" } });
  assert.deepEqual(fixture.calls, [
    { kind: "permission", permission: "tactics.manage" },
    { kind: "from", table: "memberships" },
    { kind: "rpc", name: "save_match_tactic", args: {
      p_team_id: TEAM_ID, p_match_id: MATCH_ID, p_tactic_id: TACTIC_ID,
      p_mode: "balanced", p_formation: "2-3-1", p_instructions: null,
      p_version: 2, p_pressing: "high", p_defensive_line: "medium",
      p_slots: slots().map((slot) => ({ user_id: slot.userId, slot_kind: slot.slotKind, slot_key: slot.slotKey, role_label: slot.roleLabel, shirt_number: slot.shirtNumber, x: slot.x, y: slot.y })),
      p_expected_updated_at: UPDATED_AT,
    } },
    { kind: "from", table: "match_tactics" },
  ]);
});

test("save fails closed when the authoritative tactic row is malformed", async () => {
  const fixture = dependencies({ savedRow: { id: TACTIC_ID, version: "3", updated_at: "not-a-date", status: "draft" } });
  const response = await mutateTactics(request(payload()), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, code: "server", message: "Không thể lưu chiến thuật lúc này." });
});

test("save fails closed before RPC when any player is inactive or belongs to another team", async () => {
  const fixture = dependencies({ activeIds: PLAYER_IDS.slice(0, -1) });
  const response = await mutateTactics(request(payload()), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "validation");
  assert.equal(fixture.calls.some((call) => call.kind === "rpc"), false);
});

test("Member denial and apply preserve server authority and optimistic tokens", async () => {
  const denied = dependencies({ context: null });
  assert.equal((await mutateTactics(request({ action: "apply", tacticId: TACTIC_ID, expectedUpdatedAt: UPDATED_AT }), { slug: "pro7-fc", matchId: MATCH_ID }, denied.deps)).status, 403);
  assert.deepEqual(denied.calls, [{ kind: "permission", permission: "tactics.manage" }]);

  const fixture = dependencies({ rpcData: undefined });
  const response = await mutateTactics(request({ action: "apply", tacticId: TACTIC_ID, expectedUpdatedAt: UPDATED_AT }), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.calls, [
    { kind: "permission", permission: "tactics.manage" },
    { kind: "rpc", name: "apply_match_tactic", args: { p_team_id: TEAM_ID, p_tactic_id: TACTIC_ID, p_expected_updated_at: UPDATED_AT } },
  ]);
});

test("tactics actions map stale, lifecycle, validation, and internal RPC failures without leaking details", async () => {
  for (const [code, status, publicCode] of [
    ["40001", 409, "stale"], ["55000", 409, "lifecycle"], ["23514", 422, "validation"],
    ["23503", 422, "validation"], ["42501", 403, "forbidden"], ["P0002", 404, "not_found"], ["XX000", 500, "server"],
  ] as const) {
    const fixture = dependencies({ rpcError: { code } });
    const response = await mutateTactics(request({ action: "apply", tacticId: TACTIC_ID, expectedUpdatedAt: UPDATED_AT }), { slug: "pro7-fc", matchId: MATCH_ID }, fixture.deps);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, publicCode);
  }
});
