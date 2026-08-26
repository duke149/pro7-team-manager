import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseSquadFilters } from "../lib/squad/filters";
import { getSquadPlayer, listAssignableSquadRoles, listSquadPlayers } from "../lib/squad/queries";
import type { Database } from "../lib/supabase/database.types";

const DETAIL_USER_ID = "00000000-0000-4000-8000-000000000051";
const MISSING_USER_ID = "00000000-0000-4000-8000-000000000052";

test("Squad database contracts reject browser-runtime imports", () => {
  for (const modulePath of ["queries", "actions"]) {
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `globalThis.window = {}; await import("./lib/squad/${modulePath}.ts");`,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.notEqual(child.status, 0, modulePath);
    assert.match(`${child.stdout}${child.stderr}`, /PRO7 server-only boundary/u);
  }
});

type SupabaseResponse = {
  data: unknown;
  error: { code: string; message: string; details: string; hint: string } | null;
  count: number | null;
  status: number;
  statusText: string;
};

type QueryCall = { method: string; arguments: unknown[] };

function response(data: unknown, error: SupabaseResponse["error"] = null): SupabaseResponse {
  return {
    data,
    error,
    count: null,
    status: error ? 400 : 200,
    statusText: error ? "Bad Request" : "OK",
  };
}

function playerRows({ status = "active", playerStatus = "available" } = {}) {
  return [
    {
      user_id: "user-a",
      role_id: "role-admin",
      status,
      role: { id: "role-admin", name: "Admin", slug: "admin", is_system: true },
      player: {
        shirt_number: 10,
        official_position: "ATT",
        player_status: playerStatus,
        join_date: "2026-01-01",
      },
    },
    {
      user_id: "user-b",
      role_id: "role-member",
      status,
      role: { id: "role-member", name: "Cầu thủ", slug: "member", is_system: true },
      player: {
        shirt_number: 8,
        official_position: "MID",
        player_status: playerStatus,
        join_date: "2026-01-02",
      },
    },
  ];
}

function profileRows() {
  return [
    {
      id: "user-a",
      display_name: "An",
      avatar_path: "user-a/avatar.webp",
      avatar_url: null,
      phone: "0900000001",
      date_of_birth: "2000-01-01",
      height_cm: 175,
      weight_kg: 68.5,
      preferred_positions: ["ATT"],
    },
    {
      id: "user-b",
      display_name: "Bình",
      avatar_path: null,
      avatar_url: "https://example.test/binh.png",
      phone: null,
      date_of_birth: null,
      height_cm: null,
      weight_kg: null,
      preferred_positions: ["MID"],
    },
  ];
}

class QueryDouble implements PromiseLike<SupabaseResponse> {
  readonly calls: QueryCall[] = [];

  constructor(private readonly result: SupabaseResponse) {}

  private record(method: string, ...arguments_: unknown[]) {
    this.calls.push({ method, arguments: arguments_ });
    return this;
  }

  select(...arguments_: unknown[]) { return this.record("select", ...arguments_); }
  eq(...arguments_: unknown[]) { return this.record("eq", ...arguments_); }
  gt(...arguments_: unknown[]) { return this.record("gt", ...arguments_); }
  in(...arguments_: unknown[]) { return this.record("in", ...arguments_); }
  ilike(...arguments_: unknown[]) { return this.record("ilike", ...arguments_); }
  order(...arguments_: unknown[]) { return this.record("order", ...arguments_); }
  limit(...arguments_: unknown[]) { return this.record("limit", ...arguments_); }
  maybeSingle(...arguments_: unknown[]) { return this.record("maybeSingle", ...arguments_); }

  then<TResult1 = SupabaseResponse, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function rosterFixture(index: number, overrides: Record<string, unknown> = {}) {
  const suffix = String(index).padStart(12, "0");
  const userId = `00000000-0000-4000-8000-${suffix}`;
  return {
    membership: {
      user_id: userId,
      role_id: "role-member",
      status: "active",
      role: { id: "role-member", name: "Cầu thủ", slug: "member", is_system: true },
      player: {
        shirt_number: 50,
        official_position: "MID",
        player_status: "available",
        join_date: "2026-01-02",
        ...(overrides.player as Record<string, unknown> | undefined),
      },
    },
    profile: {
      id: userId,
      display_name: `Player ${String(index).padStart(2, "0")}`,
      avatar_path: null,
      avatar_url: null,
      ...(overrides.profile as Record<string, unknown> | undefined),
    },
  };
}

function clientDouble({
  memberships = [response(playerRows())],
  profiles = [response(profileRows())],
  roles = [],
  rolePermissions = [],
  rpc = response([{ admin_notes: "Theo dõi thể lực" }]),
}: {
  memberships?: SupabaseResponse[];
  profiles?: SupabaseResponse[];
  roles?: SupabaseResponse[];
  rolePermissions?: SupabaseResponse[];
  rpc?: SupabaseResponse;
} = {}) {
  const calls: Array<{ table: string; query: QueryDouble }> = [];
  const queues = {
    memberships: [...memberships],
    profiles: [...profiles],
    roles: [...roles],
    role_permissions: [...rolePermissions],
  };
  const rpcCalls: Array<{ name: string; arguments: unknown }> = [];

  const client = {
    from(table: "memberships" | "profiles" | "roles" | "role_permissions") {
      const result = queues[table].shift();
      assert.ok(result, `unexpected ${table} query`);
      const query = new QueryDouble(result);
      calls.push({ table, query });
      return query;
    },
    async rpc(name: string, arguments_: unknown) {
      rpcCalls.push({ name, arguments: arguments_ });
      return rpc;
    },
  } as unknown as SupabaseClient<Database>;

  return { client, calls, rpcCalls };
}

test("listAssignableSquadRoles returns only same-team non-owner roles without team.delete", async () => {
  const fixture = clientDouble({
    roles: [response([
      { id: "role-admin", name: "Quản lý", slug: "admin", is_system: true },
      { id: "role-custom", name: "Đội trưởng", slug: "captain", is_system: false },
      { id: "role-member", name: "Cầu thủ", slug: "member", is_system: true },
      { id: "role-owner", name: "Chủ sở hữu", slug: "owner", is_system: true },
    ])],
    rolePermissions: [response([
      { role_id: "role-admin", permission_code: "team.delete" },
    ])],
  });

  const result = await listAssignableSquadRoles("team-1", true, { supabase: fixture.client });

  assert.deepEqual(result, {
    ok: true,
    roles: [
      { id: "role-member", name: "Cầu thủ", slug: "member", isSystem: true },
      { id: "role-custom", name: "Đội trưởng", slug: "captain", isSystem: false },
    ],
  });
  assert.deepEqual(fixture.calls.map(({ table, query }) => ({ table, calls: query.calls })), [
    {
      table: "roles",
      calls: [
        { method: "select", arguments: ["id,name,slug,is_system"] },
        { method: "eq", arguments: ["team_id", "team-1"] },
        { method: "order", arguments: ["id", { ascending: true }] },
        { method: "limit", arguments: [64] },
      ],
    },
    {
      table: "role_permissions",
      calls: [
        { method: "select", arguments: ["role_id,permission_code"] },
        { method: "in", arguments: ["role_id", ["role-admin", "role-custom", "role-member"]] },
        { method: "eq", arguments: ["permission_code", "team.delete"] },
        { method: "order", arguments: ["role_id", { ascending: true }] },
        { method: "limit", arguments: [4] },
      ],
    },
  ]);
});

test("listAssignableSquadRoles fails closed on malformed or inaccessible role permissions", async () => {
  const fixture = clientDouble({
    roles: [response([{ id: "role-member", name: "Cầu thủ", slug: "member", is_system: true }])],
    rolePermissions: [response(null, { code: "42501", message: "denied", details: "", hint: "" })],
  });

  assert.deepEqual(
    await listAssignableSquadRoles("team-1", true, { supabase: fixture.client }),
    { ok: false, error: "server" },
  );
});

test("listAssignableSquadRoles refuses an RLS-incomplete caller before database access", async () => {
  const fixture = clientDouble();

  assert.deepEqual(
    await listAssignableSquadRoles("team-1", false, { supabase: fixture.client }),
    { ok: false, error: "server" },
  );
  assert.deepEqual(fixture.calls, []);
});

test("listAssignableSquadRoles keyset-pages beyond 64 roles without silent truncation", async () => {
  const roleRows = Array.from({ length: 65 }, (_, offset) => ({
    id: `role-${String(offset + 1).padStart(3, "0")}`,
    name: `Vai trò ${String(offset + 1).padStart(3, "0")}`,
    slug: `role-${String(offset + 1).padStart(3, "0")}`,
    is_system: false,
  }));
  const fixture = clientDouble({
    roles: [response(roleRows.slice(0, 64)), response(roleRows.slice(64))],
    rolePermissions: [response([]), response([])],
  });

  const result = await listAssignableSquadRoles("team-1", true, { supabase: fixture.client });

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.roles.length : 0, 65);
  assert.equal(result.ok ? result.roles.at(-1)?.id : null, "role-065");
  assert.deepEqual(
    fixture.calls.filter(({ table }) => table === "roles")[1]?.query.calls,
    [
      { method: "select", arguments: ["id,name,slug,is_system"] },
      { method: "eq", arguments: ["team_id", "team-1"] },
      { method: "gt", arguments: ["id", "role-064"] },
      { method: "order", arguments: ["id", { ascending: true }] },
      { method: "limit", arguments: [64] },
    ],
  );
});

test("listSquadPlayers selects only safe columns, maps rows, and orders equal primary values by name", async () => {
  const fixture = clientDouble();
  const result = await listSquadPlayers(
    "team-1",
    parseSquadFilters(new URLSearchParams({ sort: "status", direction: "asc" })),
    { supabase: fixture.client },
  );

  assert.deepEqual(result, {
    ok: true,
    players: [
      {
        userId: "user-a",
        displayName: "An",
        avatarPath: "user-a/avatar.webp",
        avatarUrl: null,
        membershipStatus: "active",
        role: { id: "role-admin", name: "Admin", slug: "admin", isSystem: true },
        shirtNumber: 10,
        officialPosition: "ATT",
        playerStatus: "available",
        joinDate: "2026-01-01",
      },
      {
        userId: "user-b",
        displayName: "Bình",
        avatarPath: null,
        avatarUrl: "https://example.test/binh.png",
        membershipStatus: "active",
        role: { id: "role-member", name: "Cầu thủ", slug: "member", isSystem: true },
        shirtNumber: 8,
        officialPosition: "MID",
        playerStatus: "available",
        joinDate: "2026-01-02",
      },
    ],
  });

  assert.deepEqual(fixture.calls.map(({ table, query }) => ({ table, calls: query.calls })), [
    {
      table: "memberships",
      calls: [
        { method: "select", arguments: [
          "user_id,role_id,status,role:roles!memberships_role_team_fkey(id,name,slug,is_system),player:team_player_profiles!team_player_profiles_membership_fkey!inner(shirt_number,official_position,player_status,join_date)",
        ] },
        { method: "eq", arguments: ["team_id", "team-1"] },
        { method: "eq", arguments: ["status", "active"] },
        { method: "eq", arguments: ["player.player_status", "available"] },
        { method: "order", arguments: ["user_id", { ascending: true }] },
        { method: "limit", arguments: [48] },
      ],
    },
    {
      table: "profiles",
      calls: [
        { method: "select", arguments: ["id,display_name,avatar_path,avatar_url"] },
        { method: "in", arguments: ["id", ["user-a", "user-b"]] },
        { method: "order", arguments: ["display_name", { ascending: true, nullsFirst: false }] },
        { method: "order", arguments: ["id", { ascending: true }] },
        { method: "limit", arguments: [48] },
      ],
    },
  ]);
});

test("listSquadPlayers applies inactive membership separately from active player status and position", async () => {
  const inactive = clientDouble({ memberships: [response(playerRows({ status: "inactive" }))] });
  assert.equal(
    (await listSquadPlayers(
      "team-1",
      parseSquadFilters(new URLSearchParams({ status: "inactive", position: "DEF" })),
      { supabase: inactive.client },
    )).ok,
    true,
  );
  assert.deepEqual(inactive.calls[0].query.calls.slice(1, 5), [
    { method: "eq", arguments: ["team_id", "team-1"] },
    { method: "eq", arguments: ["status", "inactive"] },
    { method: "eq", arguments: ["player.official_position", "DEF"] },
    { method: "order", arguments: ["user_id", { ascending: true }] },
  ]);

  const injured = clientDouble({
    memberships: [response(playerRows({ playerStatus: "injured" }))],
  });
  await listSquadPlayers(
    "team-1",
    parseSquadFilters(new URLSearchParams({ status: "injured" })),
    { supabase: injured.client },
  );
  assert.deepEqual(injured.calls[0].query.calls.slice(1, 4), [
    { method: "eq", arguments: ["team_id", "team-1"] },
    { method: "eq", arguments: ["status", "active"] },
    { method: "eq", arguments: ["player.player_status", "injured"] },
  ]);
});

test("listSquadPlayers sends escaped display-name search only to profiles and remains bounded to 48", async () => {
  const fixture = clientDouble({
    profiles: [
      response(profileRows().map(({ id }) => ({ id }))),
      response([]),
    ],
  });
  const result = await listSquadPlayers(
    "team-1",
    parseSquadFilters(new URLSearchParams({ q: "50%_" })),
    { supabase: fixture.client },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.calls[2].query.calls.slice(0, 5), [
    { method: "select", arguments: ["id,display_name,avatar_path,avatar_url"] },
    { method: "in", arguments: ["id", ["user-a", "user-b"]] },
    { method: "ilike", arguments: ["display_name", "%50\\%\\_%"] },
    { method: "order", arguments: ["display_name", { ascending: true, nullsFirst: false }] },
    { method: "order", arguments: ["id", { ascending: true }] },
  ]);
  assert.deepEqual(
    fixture.calls.flatMap(({ query }) => query.calls).filter((call) => call.method === "limit"),
    [
      { method: "limit", arguments: [48] },
      { method: "limit", arguments: [48] },
      { method: "limit", arguments: [48] },
    ],
  );
});

test("listSquadPlayers searches eligible memberships beyond the first 48-user keyset page", async () => {
  const roster = Array.from({ length: 49 }, (_, offset) =>
    rosterFixture(offset + 1, offset === 48 ? { profile: { display_name: "Zed Match" } } : {}),
  );
  const fixture = clientDouble({
    memberships: [
      response(roster.slice(0, 48).map(({ membership }) => membership)),
      response([roster[48].membership]),
    ],
    profiles: [
      response(roster.slice(0, 48).map(({ profile }) => ({ id: profile.id }))),
      response([]),
      response([{ id: roster[48].profile.id }]),
      response([roster[48].profile]),
    ],
  });

  const result = await listSquadPlayers(
    "team-1",
    parseSquadFilters(new URLSearchParams({ q: "Zed Match" })),
    { supabase: fixture.client },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.players.map((player) => player.userId) : [], [
    roster[48].profile.id,
  ]);
  assert.deepEqual(
    fixture.calls.filter(({ table }) => table === "memberships")[1]?.query.calls,
    [
      { method: "select", arguments: [
        "user_id,role_id,status,role:roles!memberships_role_team_fkey(id,name,slug,is_system),player:team_player_profiles!team_player_profiles_membership_fkey!inner(shirt_number,official_position,player_status,join_date)",
      ] },
      { method: "eq", arguments: ["team_id", "team-1"] },
      { method: "eq", arguments: ["status", "active"] },
      { method: "eq", arguments: ["player.player_status", "available"] },
      { method: "gt", arguments: ["user_id", roster[47].profile.id] },
      { method: "order", arguments: ["user_id", { ascending: true }] },
      { method: "limit", arguments: [48] },
    ],
  );
});

test("listSquadPlayers includes a leading requested-sort value outside the first 48-user keyset page", async () => {
  const roster = Array.from({ length: 49 }, (_, offset) =>
    rosterFixture(offset + 1, offset === 48 ? { player: { shirt_number: 1 } } : {}),
  );
  const fixture = clientDouble({
    memberships: [
      response(roster.slice(0, 48).map(({ membership }) => membership)),
      response([roster[48].membership]),
    ],
    profiles: [
      response(roster.slice(0, 48).map(({ profile }) => profile)),
      response([roster[48].profile]),
    ],
  });

  const result = await listSquadPlayers(
    "team-1",
    parseSquadFilters(new URLSearchParams({ sort: "shirt_number", direction: "asc" })),
    { supabase: fixture.client },
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.players.length : 0, 48);
  assert.equal(result.ok ? result.players[0].userId : null, roster[48].profile.id);
});

test("listSquadPlayers fails closed on database errors or malformed rows", async () => {
  const databaseError = clientDouble({
    memberships: [response(null, { code: "XX000", message: "secret sql", details: "table", hint: "" })],
  });
  assert.deepEqual(
    await listSquadPlayers("team-1", parseSquadFilters(new URLSearchParams()), {
      supabase: databaseError.client,
    }),
    { ok: false, error: "server" },
  );

  const malformed = clientDouble({ memberships: [response([{ user_id: "only" }])] });
  assert.deepEqual(
    await listSquadPlayers("team-1", parseSquadFilters(new URLSearchParams()), {
      supabase: malformed.client,
    }),
    { ok: false, error: "server" },
  );
});

test("listSquadPlayers fails closed when an unsearched membership has no visible profile", async () => {
  const fixture = clientDouble({ profiles: [response(profileRows().slice(0, 1))] });

  assert.deepEqual(
    await listSquadPlayers("team-1", parseSquadFilters(new URLSearchParams()), {
      supabase: fixture.client,
    }),
    { ok: false, error: "server" },
  );
});

test("listSquadPlayers fails closed on a missing profile before applying display-name search", async () => {
  const fixture = clientDouble({ profiles: [response(profileRows().slice(0, 1))] });

  assert.deepEqual(
    await listSquadPlayers(
      "team-1",
      parseSquadFilters(new URLSearchParams({ q: "An" })),
      { supabase: fixture.client },
    ),
    { ok: false, error: "server" },
  );
});

test("getSquadPlayer returns not_found without requesting admin notes when the safe row is absent", async () => {
  const fixture = clientDouble({ memberships: [response(null)], profiles: [] });
  const result = await getSquadPlayer("team-1", MISSING_USER_ID, false, {
    supabase: fixture.client,
  });

  assert.deepEqual(result, { ok: false, error: "not_found" });
  assert.deepEqual(fixture.rpcCalls, []);
  assert.equal(
    fixture.calls[0].query.calls[0].arguments[0],
    "user_id,role_id,status,role:roles!memberships_role_team_fkey(id,name,slug,is_system),player:team_player_profiles!team_player_profiles_membership_fkey!inner(shirt_number,official_position,player_status,join_date)",
  );
});

test("getSquadPlayer treats a malformed route user ID as not_found before database access", async () => {
  const fixture = clientDouble({ memberships: [], profiles: [] });

  assert.deepEqual(
    await getSquadPlayer("team-1", "not-a-uuid", false, { supabase: fixture.client }),
    { ok: false, error: "not_found" },
  );
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(fixture.rpcCalls, []);
});

test("getSquadPlayer augments safe profile detail with manager-only notes through the authorized RPC", async () => {
  const fixture = clientDouble({
    memberships: [response({ ...playerRows()[1], user_id: DETAIL_USER_ID })],
    profiles: [response({ ...profileRows()[1], id: DETAIL_USER_ID })],
  });
  const result = await getSquadPlayer("team-1", DETAIL_USER_ID, true, {
    supabase: fixture.client,
  });

  assert.deepEqual(result, {
    ok: true,
    player: {
      userId: DETAIL_USER_ID,
      displayName: "Bình",
      avatarPath: null,
      avatarUrl: "https://example.test/binh.png",
      membershipStatus: "active",
      role: { id: "role-member", name: "Cầu thủ", slug: "member", isSystem: true },
      shirtNumber: 8,
      officialPosition: "MID",
      playerStatus: "available",
      joinDate: "2026-01-02",
      phone: null,
      dateOfBirth: null,
      heightCm: null,
      weightKg: null,
      preferredPositions: ["MID"],
      adminNotes: "Theo dõi thể lực",
    },
  });
  assert.deepEqual(fixture.rpcCalls, [
    {
      name: "get_team_player_admin_detail",
      arguments: { p_team_id: "team-1", p_user_id: DETAIL_USER_ID },
    },
  ]);
  assert.equal(
    String(fixture.calls[1].query.calls[0].arguments[0]).includes("admin_notes"),
    false,
  );
});

test("getSquadPlayer fails closed when the manager note RPC or profile query fails", async () => {
  const rpcError = clientDouble({
    memberships: [response({ ...playerRows()[1], user_id: DETAIL_USER_ID })],
    profiles: [response({ ...profileRows()[1], id: DETAIL_USER_ID })],
    rpc: response(null, { code: "42501", message: "denied SQL", details: "", hint: "" }),
  });
  assert.deepEqual(
    await getSquadPlayer("team-1", DETAIL_USER_ID, true, { supabase: rpcError.client }),
    { ok: false, error: "server" },
  );
});
