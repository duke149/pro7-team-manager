import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseSquadFilters } from "../lib/squad/filters";
import { getSquadPlayer, listSquadPlayers } from "../lib/squad/queries";
import type { Database } from "../lib/supabase/database.types";

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

function clientDouble({
  memberships = [response(playerRows())],
  profiles = [response(profileRows())],
  rpc = response([{ admin_notes: "Theo dõi thể lực" }]),
}: {
  memberships?: SupabaseResponse[];
  profiles?: SupabaseResponse[];
  rpc?: SupabaseResponse;
} = {}) {
  const calls: Array<{ table: string; query: QueryDouble }> = [];
  const queues = { memberships: [...memberships], profiles: [...profiles] };
  const rpcCalls: Array<{ name: string; arguments: unknown }> = [];

  const client = {
    from(table: "memberships" | "profiles") {
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
        { method: "in", arguments: ["id", ["user-b", "user-a"]] },
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
  const fixture = clientDouble();
  const result = await listSquadPlayers(
    "team-1",
    parseSquadFilters(new URLSearchParams({ q: "50%_" })),
    { supabase: fixture.client },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.calls[1].query.calls.slice(0, 5), [
    { method: "select", arguments: ["id,display_name,avatar_path,avatar_url"] },
    { method: "in", arguments: ["id", ["user-b", "user-a"]] },
    { method: "ilike", arguments: ["display_name", "%50\\%\\_%"] },
    { method: "order", arguments: ["display_name", { ascending: true, nullsFirst: false }] },
    { method: "order", arguments: ["id", { ascending: true }] },
  ]);
  assert.deepEqual(
    fixture.calls.flatMap(({ query }) => query.calls).filter((call) => call.method === "limit"),
    [
      { method: "limit", arguments: [48] },
      { method: "limit", arguments: [48] },
    ],
  );
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

test("getSquadPlayer returns not_found without requesting admin notes when the safe row is absent", async () => {
  const fixture = clientDouble({ memberships: [response(null)], profiles: [] });
  const result = await getSquadPlayer("team-1", "missing-user", false, {
    supabase: fixture.client,
  });

  assert.deepEqual(result, { ok: false, error: "not_found" });
  assert.deepEqual(fixture.rpcCalls, []);
  assert.equal(
    fixture.calls[0].query.calls[0].arguments[0],
    "user_id,role_id,status,role:roles!memberships_role_team_fkey(id,name,slug,is_system),player:team_player_profiles!team_player_profiles_membership_fkey!inner(shirt_number,official_position,player_status,join_date)",
  );
});

test("getSquadPlayer augments safe profile detail with manager-only notes through the authorized RPC", async () => {
  const fixture = clientDouble({
    memberships: [response(playerRows()[0])],
    profiles: [response(profileRows()[1])],
  });
  const result = await getSquadPlayer("team-1", "user-b", true, {
    supabase: fixture.client,
  });

  assert.deepEqual(result, {
    ok: true,
    player: {
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
      arguments: { p_team_id: "team-1", p_user_id: "user-b" },
    },
  ]);
  assert.equal(
    String(fixture.calls[1].query.calls[0].arguments[0]).includes("admin_notes"),
    false,
  );
});

test("getSquadPlayer fails closed when the manager note RPC or profile query fails", async () => {
  const rpcError = clientDouble({
    memberships: [response(playerRows()[0])],
    profiles: [response(profileRows()[1])],
    rpc: response(null, { code: "42501", message: "denied SQL", details: "", hint: "" }),
  });
  assert.deepEqual(
    await getSquadPlayer("team-1", "user-b", true, { supabase: rpcError.client }),
    { ok: false, error: "server" },
  );
});
