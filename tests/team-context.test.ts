import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadUserTeams,
  listUserTeams,
  loadTeamAccessContext,
  requireTeamPermission,
} from "../lib/teams/context";
import type { Database } from "../lib/supabase/database.types";

type SupabaseResponse<T> = {
  data: T;
  error: { message: string } | null;
  count: number | null;
  status: number;
  statusText: string;
};

type AccessRpcRow = {
  team_id: string;
  team_name: string;
  team_slug: string;
  role_id: string;
  role_slug: string;
  role_name: string;
  permission_codes: string[];
};

function response<T>(data: T): SupabaseResponse<T> {
  return { data, error: null, count: null, status: 200, statusText: "OK" };
}

function errorResponse<T>(message: string): SupabaseResponse<T> {
  return {
    data: null as T,
    error: { message },
    count: null,
    status: 500,
    statusText: "Internal Server Error",
  };
}

function createSupabaseDouble(result: SupabaseResponse<unknown>) {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const client = {
    rpc(name: string, args?: unknown) {
      rpcCalls.push({ name, args });
      return Promise.resolve(result);
    },
    from() {
      throw new Error("team context must use its narrow RPC instead of base tables");
    },
  };

  return Object.assign(client, { rpcCalls }) as unknown as SupabaseClient<Database> & {
    rpcCalls: Array<{ name: string; args: unknown }>;
  };
}

function accessRow(overrides: Partial<AccessRpcRow> = {}): AccessRpcRow {
  return {
    team_id: "team-1",
    team_name: "Falcons",
    team_slug: "falcons",
    role_id: "role-1",
    role_slug: "member",
    role_name: "Member",
    permission_codes: ["matches.read", "team.read"],
    ...overrides,
  };
}

function authorizedDependencies(rows: AccessRpcRow[] = [accessRow()]) {
  return {
    supabase: createSupabaseDouble(response(rows)),
    getCurrentUser: async () => ({ id: "user-1" }),
  };
}

test("loadTeamAccessContext serializes only the matching verified RPC row", async () => {
  const dependencies = authorizedDependencies();
  const context = await loadTeamAccessContext("falcons", dependencies);

  assert.deepEqual(context, {
    team: { id: "team-1", name: "Falcons", slug: "falcons" },
    userId: "user-1",
    membership: { roleId: "role-1", roleSlug: "member", roleName: "Member" },
    permissions: ["matches.read", "team.read"],
  });
  assert.equal(Object.isFrozen(context?.permissions), true);
  assert.deepEqual(dependencies.supabase.rpcCalls, [
    { name: "get_current_team_access_contexts", args: undefined },
  ]);
});

test("loadTeamAccessContext fails closed for missing or inactive RPC rows", async () => {
  assert.equal(
    await loadTeamAccessContext("falcons", authorizedDependencies([])),
    null,
  );
});

test("loadTeamAccessContext fails closed for RPC errors, malformed rows, and unknown permissions", async () => {
  const errorClient = createSupabaseDouble(errorResponse("database unavailable"));
  const malformed = authorizedDependencies([
    { ...accessRow(), role_name: undefined as unknown as string },
  ]);
  const unknownPermission = authorizedDependencies([
    accessRow({ permission_codes: ["finance.destroy"] }),
  ]);

  assert.equal(
    await loadTeamAccessContext("falcons", {
      supabase: errorClient,
      getCurrentUser: async () => ({ id: "user-1" }),
    }),
    null,
  );
  assert.equal(await loadTeamAccessContext("falcons", malformed), null);
  assert.equal(await loadTeamAccessContext("falcons", unknownPermission), null);
});

test("listUserTeams returns RPC teams in deterministic name, slug, and id order", async () => {
  const dependencies = authorizedDependencies([
    accessRow({ team_id: "team-3", team_name: "Zebra", team_slug: "zebra" }),
    accessRow({ team_id: "team-2", team_name: "Alpha", team_slug: "zulu" }),
    accessRow({ team_id: "team-1", team_name: "Alpha", team_slug: "alpha" }),
  ]);

  assert.deepEqual(await listUserTeams(dependencies), [
    { id: "team-1", name: "Alpha", slug: "alpha" },
    { id: "team-2", name: "Alpha", slug: "zulu" },
    { id: "team-3", name: "Zebra", slug: "zebra" },
  ]);
});

test("listUserTeams uses code-point ordering for case and non-ASCII names", async () => {
  const dependencies = authorizedDependencies([
    accessRow({ team_id: "team-4", team_name: "Đội", team_slug: "doi" }),
    accessRow({ team_id: "team-3", team_name: "Doi", team_slug: "doi" }),
    accessRow({ team_id: "team-2", team_name: "alpha", team_slug: "alpha" }),
    accessRow({ team_id: "team-1", team_name: "Alpha", team_slug: "alpha" }),
  ]);

  assert.deepEqual(await listUserTeams(dependencies), [
    { id: "team-1", name: "Alpha", slug: "alpha" },
    { id: "team-3", name: "Doi", slug: "doi" },
    { id: "team-2", name: "alpha", slug: "alpha" },
    { id: "team-4", name: "Đội", slug: "doi" },
  ]);
});

test("loadUserTeams distinguishes an explicit empty membership list from RPC failures", async () => {
  assert.deepEqual(await loadUserTeams(authorizedDependencies([])), {
    ok: true,
    teams: [],
  });
  assert.deepEqual(
    await loadUserTeams({
      supabase: createSupabaseDouble(errorResponse("database unavailable")),
      getCurrentUser: async () => ({ id: "user-1" }),
    }),
    { ok: false },
  );
  assert.deepEqual(
    await loadUserTeams({
      supabase: createSupabaseDouble(response([{ malformed: true }])),
      getCurrentUser: async () => ({ id: "user-1" }),
    }),
    { ok: false },
  );
});

test("loadUserTeams retains immutable effective permissions for landing resolution", async () => {
  const result = await loadUserTeams(
    authorizedDependencies([
      accessRow({
        team_id: "team-finance",
        team_name: "Finance Team",
        team_slug: "finance-team",
        permission_codes: ["finance.read"],
      }),
    ]),
  );

  assert.deepEqual(result, {
    ok: true,
    teams: [
      {
        id: "team-finance",
        name: "Finance Team",
        slug: "finance-team",
        permissions: ["finance.read"],
      },
    ],
  });
  assert.equal(result.ok && Object.isFrozen(result.teams[0]?.permissions), true);
});

test("requireTeamPermission uses verified identity and denies missing permissions", async () => {
  let identityReads = 0;
  const context = await requireTeamPermission("falcons", "finance.read", {
    ...authorizedDependencies(),
    getCurrentUser: async () => {
      identityReads += 1;
      return { id: "user-1" };
    },
  });

  assert.equal(context, null);
  assert.equal(identityReads, 1);
});
