import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deactivateTeamPlayer,
  updateTeamPlayer,
  type SquadActionDependencies,
} from "../lib/squad/actions";
import type { Database } from "../lib/supabase/database.types";
import type { PermissionCode } from "../lib/teams/permissions";

const VALID_UPDATE = {
  roleId: "00000000-0000-4000-8000-000000000002",
  shirtNumber: 8,
  officialPosition: "MID",
  playerStatus: "available",
  joinDate: "2026-01-02",
  adminNotes: "Theo dõi thể lực",
};
const TARGET_USER_ID = "00000000-0000-4000-8000-000000000003";
const TARGET = { slug: "pro7-fc", userId: TARGET_USER_ID } as const;

type DatabaseError = {
  code: string;
  message: string;
  details: string;
  hint: string;
};

function response(error: DatabaseError | null = null) {
  return {
    data: null,
    error,
    count: null,
    status: error ? 400 : 200,
    statusText: error ? "Bad Request" : "OK",
  };
}

function request(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://pro7.example/api/teams/pro7-fc/players/user-2", {
    method: "PATCH",
    headers: {
      "content-type": "application/json; charset=utf-8",
      origin: "https://pro7.example",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function dependencies({
  deniedPermission,
  rpcError = null,
}: {
  deniedPermission?: PermissionCode;
  rpcError?: DatabaseError | null;
} = {}) {
  const permissionCalls: Array<{ slug: string; permission: PermissionCode }> = [];
  const rpcCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const rpcReceivers: unknown[] = [];
  const context = {
    team: { id: "team-1", name: "PRO7 FC", slug: "pro7-fc" },
    userId: "manager-1",
    membership: { roleId: "role-admin", roleSlug: "admin", roleName: "Admin" },
    permissions: ["players.manage", "members.manage"] as PermissionCode[],
  };

  const supabase = {
    async rpc(this: unknown, name: string, arguments_: unknown) {
      rpcReceivers.push(this);
      rpcCalls.push({ name, arguments: arguments_ as Record<string, unknown> });
      return response(rpcError);
    },
  } as unknown as SupabaseClient<Database>;
  const value: SquadActionDependencies = {
    now: () => new Date("2026-08-26T00:00:00.000Z"),
    async requireTeamPermission(slug, permission) {
      permissionCalls.push({ slug, permission });
      return permission === deniedPermission ? null : context;
    },
    supabase,
  };
  return { value, permissionCalls, rpcCalls, rpcReceivers, supabase };
}

async function json(responseValue: Response) {
  return responseValue.json() as Promise<Record<string, unknown>>;
}

test("updateTeamPlayer rejects cross-origin and non-JSON requests before authorization", async () => {
  const crossOrigin = dependencies();
  const crossOriginResponse = await updateTeamPlayer(
    request(VALID_UPDATE, { origin: "https://attacker.example" }),
    TARGET,
    crossOrigin.value,
  );
  assert.equal(crossOriginResponse.status, 403);
  assert.deepEqual(await json(crossOriginResponse), {
    ok: false,
    code: "forbidden",
    message: "Yêu cầu không được phép.",
  });
  assert.deepEqual(crossOrigin.permissionCalls, []);
  assert.deepEqual(crossOrigin.rpcCalls, []);

  const wrongType = dependencies();
  const wrongTypeResponse = await updateTeamPlayer(
    request(VALID_UPDATE, { "content-type": "text/plain" }),
    TARGET,
    wrongType.value,
  );
  assert.equal(wrongTypeResponse.status, 415);
  assert.deepEqual(wrongType.permissionCalls, []);
});

test("updateTeamPlayer independently requires both player and member management permissions", async () => {
  for (const deniedPermission of ["players.manage", "members.manage"] as const) {
    const fixture = dependencies({ deniedPermission });
    const responseValue = await updateTeamPlayer(
      request(VALID_UPDATE),
      TARGET,
      fixture.value,
    );

    assert.equal(responseValue.status, 403);
    assert.deepEqual(await json(responseValue), {
      ok: false,
      code: "forbidden",
      message: "Bạn không có quyền quản lý cầu thủ.",
    });
    assert.deepEqual(fixture.permissionCalls, [
      { slug: "pro7-fc", permission: "players.manage" },
      { slug: "pro7-fc", permission: "members.manage" },
    ]);
    assert.deepEqual(fixture.rpcCalls, []);
  }
});

test("updateTeamPlayer maps a malformed route user ID to not_found before authorization or UUID RPC", async () => {
  const fixture = dependencies();
  const responseValue = await updateTeamPlayer(
    request(VALID_UPDATE),
    { slug: "pro7-fc", userId: "not-a-uuid" },
    fixture.value,
  );

  assert.equal(responseValue.status, 404);
  assert.deepEqual(await json(responseValue), {
    ok: false,
    code: "not_found",
    message: "Không tìm thấy cầu thủ.",
  });
  assert.deepEqual(fixture.permissionCalls, []);
  assert.deepEqual(fixture.rpcCalls, []);
});

test("updateTeamPlayer sends only validated fields and verified team context to manage_team_player", async () => {
  const fixture = dependencies();
  const responseValue = await updateTeamPlayer(
    request(VALID_UPDATE),
    TARGET,
    fixture.value,
  );

  assert.equal(responseValue.status, 200);
  assert.deepEqual(await json(responseValue), { ok: true });
  assert.deepEqual(fixture.rpcCalls, [
    {
      name: "manage_team_player",
      arguments: {
        p_team_id: "team-1",
        p_user_id: TARGET_USER_ID,
        p_role_id: "00000000-0000-4000-8000-000000000002",
        p_shirt_number: 8,
        p_official_position: "MID",
        p_player_status: "available",
        p_join_date: "2026-01-02",
        p_admin_notes: "Theo dõi thể lực",
        p_deactivate: false,
      },
    },
  ]);
  assert.equal("actorId" in fixture.rpcCalls[0].arguments, false);
  assert.equal("p_actor_user_id" in fixture.rpcCalls[0].arguments, false);
  assert.equal(fixture.rpcReceivers[0], fixture.supabase);
});

test("updateTeamPlayer returns Vietnamese field errors for malformed official fields", async () => {
  const cases: Array<{ field: string; value: unknown; message: string }> = [
    { field: "roleId", value: "", message: "Vai trò không hợp lệ." },
    { field: "roleId", value: "role-member", message: "Vai trò không hợp lệ." },
    { field: "shirtNumber", value: 100, message: "Số áo phải từ 1 đến 99." },
    { field: "officialPosition", value: "coach", message: "Vị trí thi đấu không hợp lệ." },
    { field: "playerStatus", value: "retired", message: "Tình trạng cầu thủ không hợp lệ." },
    { field: "joinDate", value: "2027-01-01", message: "Ngày gia nhập không được ở tương lai." },
    { field: "adminNotes", value: "x".repeat(1001), message: "Ghi chú quản trị tối đa 1.000 ký tự." },
  ];

  for (const testCase of cases) {
    const fixture = dependencies();
    const responseValue = await updateTeamPlayer(
      request({ ...VALID_UPDATE, [testCase.field]: testCase.value }),
      TARGET,
      fixture.value,
    );
    assert.equal(responseValue.status, 422, testCase.field);
    assert.deepEqual(await json(responseValue), {
      ok: false,
      code: "validation",
      message: "Vui lòng kiểm tra lại thông tin cầu thủ.",
      fieldErrors: { [testCase.field]: testCase.message },
    });
    assert.deepEqual(fixture.rpcCalls, []);
  }
});

test("updateTeamPlayer rejects unknown payload fields and malformed JSON", async () => {
  const extraField = dependencies();
  const extraFieldResponse = await updateTeamPlayer(
    request({ ...VALID_UPDATE, actorId: "attacker" }),
    TARGET,
    extraField.value,
  );
  assert.equal(extraFieldResponse.status, 400);
  assert.equal((await json(extraFieldResponse)).code, "malformed");
  assert.deepEqual(extraField.permissionCalls, []);

  const malformed = dependencies();
  const malformedRequest = new Request("https://pro7.example/api/player", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "https://pro7.example" },
    body: "{",
  });
  const malformedResponse = await updateTeamPlayer(
    malformedRequest,
    TARGET,
    malformed.value,
  );
  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(malformed.permissionCalls, []);
});

test("updateTeamPlayer maps duplicate shirts, stale rows, and owner or cross-team denials without SQL details", async () => {
  const cases = [
    {
      error: { code: "23505", message: "duplicate key team_player_profiles_team_shirt_number_key", details: "Key (team_id, shirt_number)", hint: "" },
      status: 409,
      body: { ok: false, code: "shirt_conflict", message: "Số áo này đã được sử dụng trong đội." },
    },
    {
      error: { code: "P0002", message: "Team player not found", details: "stale", hint: "" },
      status: 409,
      body: { ok: false, code: "stale", message: "Thông tin cầu thủ đã thay đổi. Vui lòng tải lại." },
    },
    {
      error: { code: "42501", message: "Owner membership is immutable", details: "private", hint: "" },
      status: 403,
      body: { ok: false, code: "forbidden", message: "Không thể thay đổi cầu thủ này." },
    },
  ];

  for (const testCase of cases) {
    const fixture = dependencies({ rpcError: testCase.error });
    const responseValue = await updateTeamPlayer(
      request(VALID_UPDATE),
      TARGET,
      fixture.value,
    );
    assert.equal(responseValue.status, testCase.status);
    const body = await json(responseValue);
    assert.deepEqual(body, testCase.body);
    assert.equal(JSON.stringify(body).includes(testCase.error.message), false);
  }
});

test("updateTeamPlayer hides generic database failures and raw SQL details", async () => {
  const fixture = dependencies({
    rpcError: { code: "XX000", message: "select secret from private.audit_events", details: "password", hint: "schema" },
  });
  const responseValue = await updateTeamPlayer(
    request(VALID_UPDATE),
    TARGET,
    fixture.value,
  );
  const body = await json(responseValue);

  assert.equal(responseValue.status, 500);
  assert.deepEqual(body, {
    ok: false,
    code: "server",
    message: "Không thể cập nhật cầu thủ. Vui lòng thử lại.",
  });
  assert.equal(JSON.stringify(body).includes("private.audit_events"), false);
});

test("deactivateTeamPlayer requires the literal DEACTIVATE confirmation before authorization", async () => {
  for (const confirmation of ["deactivate", " DEACTIVATE ", "", null]) {
    const fixture = dependencies();
    const responseValue = await deactivateTeamPlayer(
      request({ ...VALID_UPDATE, confirmation }),
      TARGET,
      fixture.value,
    );
    assert.equal(responseValue.status, 422);
    assert.deepEqual(await json(responseValue), {
      ok: false,
      code: "validation",
      message: "Vui lòng kiểm tra lại thông tin cầu thủ.",
      fieldErrors: { confirmation: "Nhập DEACTIVATE để xác nhận ngừng hoạt động." },
    });
    assert.deepEqual(fixture.permissionCalls, []);
    assert.deepEqual(fixture.rpcCalls, []);
  }
});

test("deactivateTeamPlayer invokes the same authorized RPC with deactivation enabled", async () => {
  const fixture = dependencies();
  const responseValue = await deactivateTeamPlayer(
    request({ ...VALID_UPDATE, confirmation: "DEACTIVATE" }),
    TARGET,
    fixture.value,
  );

  assert.equal(responseValue.status, 200);
  assert.equal(fixture.rpcCalls.length, 1);
  assert.equal(fixture.rpcCalls[0].name, "manage_team_player");
  assert.equal(fixture.rpcCalls[0].arguments.p_deactivate, true);
});
