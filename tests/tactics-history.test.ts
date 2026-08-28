import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MatchSummary } from "../lib/matches/model";
import type { Database } from "../lib/supabase/database.types";
import { getTacticsDetail } from "../lib/tactics/queries";

const MATCH_ID = "60000000-0000-4000-8000-000000000001";
const TACTIC_ID = "61000000-0000-4000-8000-000000000001";
const USERS = Array.from({ length: 7 }, (_, index) => `62000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`);
const COMPLETED_MATCH: MatchSummary = {
  id: MATCH_ID,
  opponent: "FC NÁT",
  startsAt: "2026-08-27T12:00:00.000Z",
  venue: "Sân CK2",
  isHome: true,
  rsvpDeadline: "2026-08-27T10:00:00.000Z",
  status: "completed",
  teamScore: 3,
  opponentScore: 2,
  updatedAt: "2026-08-27T14:00:00.000Z",
  attendance: { invited: 7, available: 7, unavailable: 0, pending: 0 },
  ownAttendance: null,
};

type ResponseShape = { data: unknown; error: { code: string; message: string } | null };
type Call = { table: string; method: string; arguments: unknown[] };

class QueryDouble implements PromiseLike<ResponseShape> {
  constructor(
    private readonly table: string,
    private readonly result: ResponseShape,
    private readonly calls: Call[],
  ) {}
  private record(method: string, ...arguments_: unknown[]) {
    this.calls.push({ table: this.table, method, arguments: arguments_ });
    return this;
  }
  select(...arguments_: unknown[]) { return this.record("select", ...arguments_); }
  eq(...arguments_: unknown[]) { return this.record("eq", ...arguments_); }
  gt(...arguments_: unknown[]) { return this.record("gt", ...arguments_); }
  in(...arguments_: unknown[]) { return this.record("in", ...arguments_); }
  order(...arguments_: unknown[]) { return this.record("order", ...arguments_); }
  limit(...arguments_: unknown[]) { this.record("limit", ...arguments_); return Promise.resolve(this.result); }
  then<TResult1 = ResponseShape, TResult2 = never>(
    onfulfilled?: ((value: ResponseShape) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function appliedTactic({
  id = TACTIC_ID,
  version = 1,
  users = USERS,
}: {
  id?: string;
  version?: number;
  users?: readonly string[];
} = {}) {
  return {
    id,
    mode: "attacking",
    formation: "2-3-1",
    instructions: "Giữ cự ly đội hình.",
    version,
    pressing: "medium",
    defensive_line: "medium",
    status: "applied",
    updated_at: "2026-08-27T11:00:00.000Z",
    applied_at: "2026-08-27T11:30:00.000Z",
    slots: users.map((userId, index) => ({
      user_id: userId,
      slot_kind: index < 7 ? "starter" : "bench",
      slot_key: index < 7 ? `starter-${index + 1}` : `bench-${index - 6}`,
      role_label: index === 0 ? "GK" : index < 3 ? "DEF" : index < 6 ? "MID" : "ATT",
      shirt_number: index + 1 <= 99 ? index + 1 : null,
      x: index === 0 ? 50 : 10 + index,
      y: index === 0 ? 90 : 70 - Math.min(index, 30),
    })),
  };
}

function clientDouble(queues: Record<string, ResponseShape[]>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const result = queues[table]?.shift();
      assert.ok(result, `unexpected ${table} query`);
      return new QueryDouble(table, result, calls);
    },
  } as unknown as Pick<SupabaseClient<Database>, "from">;
  return { client, calls };
}

function memberships(users = USERS) {
  return users.map((userId, index) => ({
    user_id: userId,
    status: index === 6 ? "inactive" : "active",
    player: { shirt_number: index + 1, official_position: index === 0 ? "GK" : "MID", player_status: "available" },
  }));
}

function profiles(users = USERS) {
  return users.map((id, index) => ({ id, display_name: index === 6 ? null : `Cầu thủ ${index + 1}` }));
}

test("completed tactics resolve every referenced inactive member and request only applied history", async () => {
  const fixture = clientDouble({
    match_tactics: [{ data: [appliedTactic()], error: null }],
    memberships: [{ data: memberships(), error: null }],
    profiles: [{ data: profiles(), error: null }],
  });
  const result = await getTacticsDetail("team-1", MATCH_ID, "member-1", true, {
    listMatches: async () => ({ ok: true, matches: [COMPLETED_MATCH] }),
    supabase: fixture.client,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.detail.players.map((player) => player.userId), USERS);
  assert.equal(result.ok && result.detail.players.at(-1)?.displayName, `Cựu thành viên • ${USERS[6].slice(0, 8)}`);
  assert.ok(fixture.calls.some((call) => call.table === "match_tactics" && call.method === "eq" && call.arguments[0] === "status" && call.arguments[1] === "applied"));
  assert.ok(fixture.calls.some((call) => call.table === "memberships" && call.method === "in" && call.arguments[0] === "user_id" && JSON.stringify(call.arguments[1]) === JSON.stringify(USERS)));
  assert.equal(fixture.calls.some((call) => call.table === "memberships" && call.method === "eq" && call.arguments[0] === "status"), false);
});

test("completed tactics fail closed when a referenced membership or profile is missing or duplicated", async () => {
  for (const fixture of [
    clientDouble({ match_tactics: [{ data: [appliedTactic()], error: null }], memberships: [{ data: memberships().slice(0, -1), error: null }] }),
    clientDouble({ match_tactics: [{ data: [appliedTactic()], error: null }], memberships: [{ data: memberships(), error: null }], profiles: [{ data: profiles().slice(0, -1), error: null }] }),
    clientDouble({ match_tactics: [{ data: [appliedTactic()], error: null }], memberships: [{ data: [...memberships(), memberships()[0]], error: null }] }),
  ]) {
    assert.deepEqual(await getTacticsDetail("team-1", MATCH_ID, "member-1", false, {
      listMatches: async () => ({ ok: true, matches: [COMPLETED_MATCH] }),
      supabase: fixture.client,
    }), { ok: false, error: "server" });
  }
});

test("completed tactics reject a historical identity set above the explicit safe bound", async () => {
  const rows = Array.from({ length: 34 }, (_, rowIndex) => {
    const users = Array.from({ length: 30 }, (_, slotIndex) => {
      const serial = rowIndex * 30 + slotIndex + 1;
      return `63000000-0000-4000-8000-${serial.toString().padStart(12, "0")}`;
    });
    return appliedTactic({
      id: `64000000-0000-4000-8000-${(rowIndex + 1).toString().padStart(12, "0")}`,
      version: rowIndex + 1,
      users,
    });
  });
  const fixture = clientDouble({ match_tactics: [{ data: rows, error: null }] });
  assert.deepEqual(await getTacticsDetail("team-1", MATCH_ID, "member-1", true, {
    listMatches: async () => ({ ok: true, matches: [COMPLETED_MATCH] }),
    supabase: fixture.client,
  }), { ok: false, error: "server" });
  assert.equal(fixture.calls.some((call) => call.table === "memberships"), false);
});
