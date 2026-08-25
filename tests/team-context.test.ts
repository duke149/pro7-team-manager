import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
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

function response<T>(data: T): SupabaseResponse<T> {
  return { data, error: null, count: null, status: 200, statusText: "OK" };
}

function errorResponse<T>(message: string): SupabaseResponse<T> {
  return { data: null as T, error: { message }, count: null, status: 500, statusText: "Internal Server Error" };
}

function createSupabaseDouble(responses: Record<string, SupabaseResponse<unknown>>) {
  const filters: Array<{ table: string; column: string; value: unknown }> = [];
  const client = {
    from(table: string) {
      const result = responses[table];
      assert.ok(result, `unexpected ${table} read`);

      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ table, column, value });
          return query;
        },
        maybeSingle: async () => result,
        then: <TResult1 = SupabaseResponse<unknown>, TResult2 = never>(
          onfulfilled?: ((value: SupabaseResponse<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) => Promise.resolve(result).then(onfulfilled, onrejected),
      };

      return query;
    },
  };

  return Object.assign(client, { filters }) as unknown as SupabaseClient<Database> & {
    filters: Array<{ table: string; column: string; value: unknown }>;
  };
}

function authorizedClient() {
  return createSupabaseDouble({
    teams: response({ id: "team-1", name: "Falcons", slug: "falcons" }),
    memberships: response({ role_id: "role-1" }),
    roles: response({ id: "role-1", slug: "member", name: "Member" }),
    role_permissions: response([
      { permission_code: "matches.read" },
      { permission_code: "team.read" },
    ]),
  });
}

test("loadTeamAccessContext serializes an authorized active membership", async () => {
  const context = await loadTeamAccessContext("falcons", "user-1", authorizedClient());

  assert.deepEqual(context, {
    team: { id: "team-1", name: "Falcons", slug: "falcons" },
    userId: "user-1",
    membership: { roleId: "role-1", roleSlug: "member", roleName: "Member" },
    permissions: ["matches.read", "team.read"],
  });
  assert.equal(Object.isFrozen(context?.permissions), true);
});

test("loadTeamAccessContext fails closed for a missing or inactive membership", async () => {
  const client = createSupabaseDouble({
    teams: response({ id: "team-1", name: "Falcons", slug: "falcons" }),
    memberships: response(null),
  });

  assert.equal(await loadTeamAccessContext("falcons", "user-1", client), null);
  assert.deepEqual(client.filters, [
    { table: "teams", column: "slug", value: "falcons" },
    { table: "memberships", column: "team_id", value: "team-1" },
    { table: "memberships", column: "user_id", value: "user-1" },
    { table: "memberships", column: "status", value: "active" },
  ]);
});

test("loadTeamAccessContext fails closed for missing roles, data errors, and unknown permissions", async () => {
  const missingRole = createSupabaseDouble({
    teams: response({ id: "team-1", name: "Falcons", slug: "falcons" }),
    memberships: response({ role_id: "role-1" }),
    roles: response(null),
  });
  const dataError = createSupabaseDouble({
    teams: errorResponse("database unavailable"),
  });
  const unknownPermission = createSupabaseDouble({
    teams: response({ id: "team-1", name: "Falcons", slug: "falcons" }),
    memberships: response({ role_id: "role-1" }),
    roles: response({ id: "role-1", slug: "member", name: "Member" }),
    role_permissions: response([{ permission_code: "finance.destroy" }]),
  });

  assert.equal(await loadTeamAccessContext("falcons", "user-1", missingRole), null);
  assert.equal(await loadTeamAccessContext("falcons", "user-1", dataError), null);
  assert.equal(await loadTeamAccessContext("falcons", "user-1", unknownPermission), null);
});

test("listUserTeams returns only active teams in deterministic name, slug, and id order", async () => {
  const client = createSupabaseDouble({
    memberships: response([
      { teams: { id: "team-3", name: "Zebra", slug: "zebra" } },
      { teams: { id: "team-2", name: "Alpha", slug: "zulu" } },
      { teams: { id: "team-1", name: "Alpha", slug: "alpha" } },
    ]),
  });

  assert.deepEqual(await listUserTeams("user-1", client), [
    { id: "team-1", name: "Alpha", slug: "alpha" },
    { id: "team-2", name: "Alpha", slug: "zulu" },
    { id: "team-3", name: "Zebra", slug: "zebra" },
  ]);
  assert.deepEqual(client.filters, [
    { table: "memberships", column: "user_id", value: "user-1" },
    { table: "memberships", column: "status", value: "active" },
  ]);
});

test("listUserTeams uses code-point ordering for case and non-ASCII names", async () => {
  const client = createSupabaseDouble({
    memberships: response([
      { teams: { id: "team-4", name: "Đội", slug: "doi" } },
      { teams: { id: "team-3", name: "Doi", slug: "doi" } },
      { teams: { id: "team-2", name: "alpha", slug: "alpha" } },
      { teams: { id: "team-1", name: "Alpha", slug: "alpha" } },
    ]),
  });

  assert.deepEqual(await listUserTeams("user-1", client), [
    { id: "team-1", name: "Alpha", slug: "alpha" },
    { id: "team-3", name: "Doi", slug: "doi" },
    { id: "team-2", name: "alpha", slug: "alpha" },
    { id: "team-4", name: "Đội", slug: "doi" },
  ]);
});

test("requireTeamPermission uses verified identity and denies missing permissions", async () => {
  let identityReads = 0;
  const context = await requireTeamPermission("falcons", "finance.read", {
    supabase: authorizedClient(),
    getCurrentUser: async () => {
      identityReads += 1;
      return { id: "user-1" };
    },
  });

  assert.equal(context, null);
  assert.equal(identityReads, 1);
});
