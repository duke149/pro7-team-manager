import assert from "node:assert/strict";
import test from "node:test";

const origin = "http://localhost:3000";
const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const ROLE_ID = "00000000-0000-4000-8000-000000000002";
const CALLER_ID = "00000000-0000-4000-8000-000000000003";
const USER_ID = "00000000-0000-4000-8000-000000000004";
const OTHER_TEAM_ID = "00000000-0000-4000-8000-000000000005";
const TEMPORARY_PASSWORD = "Temp-Account-7!Secure#9";

function payload(overrides = {}) {
  return {
    teamId: TEAM_ID,
    email: "new.player@example.com",
    displayName: "Nguyễn Minh Anh",
    roleId: ROLE_ID,
    shirtNumber: 17,
    officialPosition: "MID",
    joinDate: "2026-08-25",
    ...overrides,
  };
}

function request({
  method = "POST",
  requestOrigin = origin,
  authorization = "Bearer verified-token",
  contentType = "application/json; charset=utf-8",
  body = JSON.stringify(payload()),
  declaredLength,
} = {}) {
  const headers = {
    ...(requestOrigin ? { origin: requestOrigin } : {}),
    ...(authorization ? { authorization } : {}),
    ...(contentType ? { "content-type": contentType } : {}),
    ...(declaredLength !== undefined ? { "content-length": String(declaredLength) } : {}),
  };
  return new Request("https://functions.example/provision-team-member", {
    method,
    headers,
    body: method === "POST" ? body : undefined,
  });
}

function accessRow(permissions = ["members.manage", "players.manage"]) {
  return {
    team_id: TEAM_ID,
    team_name: "PRO7 FC",
    team_slug: "pro7-fc",
    role_id: ROLE_ID,
    role_slug: "admin",
    role_name: "Admin",
    permission_codes: permissions,
  };
}

async function loadHandler(options = {}) {
  const edge = await import("../supabase/functions/provision-team-member/index.ts").catch(() => null);
  assert.ok(edge, "the local provision-team-member Edge Function must exist");
  assert.equal(typeof edge.createProvisionTeamMemberHandler, "function");

  const state = {
    events: [],
    callerTokens: [],
    serviceClients: 0,
    createAttributes: [],
    deletedUsers: [],
    attachArguments: [],
  };
  const existingUser = options.existingUser
    ? { id: USER_ID, email: "new.player@example.com" }
    : null;

  function query(table) {
    const calls = [];
    const chain = {
      select(columns) {
        calls.push(["select", columns]);
        return chain;
      },
      eq(column, value) {
        calls.push(["eq", column, value]);
        return chain;
      },
      limit(value) {
        calls.push(["limit", value]);
        return chain;
      },
      async maybeSingle() {
        state.events.push(`query:${table}`);
        if (options.queryFailure === table) {
          return { data: null, error: { code: "XX000", message: "sensitive database detail" } };
        }
        if (table === "roles") {
          const teamId = options.crossTeamRole ? OTHER_TEAM_ID : TEAM_ID;
          return {
            data: {
              id: ROLE_ID,
              team_id: teamId,
              slug: options.ownerRole ? "owner" : "member",
              is_system: options.ownerRole ?? false,
            },
            error: null,
          };
        }
        if (table === "role_permissions") {
          return options.teamDeleteRole
            ? { data: { role_id: ROLE_ID }, error: null }
            : { data: null, error: null };
        }
        if (table === "memberships") {
          return options.membershipStatus
            ? { data: { status: options.membershipStatus }, error: null }
            : { data: null, error: null };
        }
        throw new Error(`unexpected table ${table}: ${JSON.stringify(calls)}`);
      },
    };
    return chain;
  }

  const handler = edge.createProvisionTeamMemberHandler({
    allowedOrigins: [origin, "https://pro7.example"],
    now: () => new Date("2026-08-26T12:00:00.000Z"),
    generateTemporaryPassword() {
      state.events.push("password");
      return TEMPORARY_PASSWORD;
    },
    createCallerClient(token) {
      state.events.push("caller");
      state.callerTokens.push(token);
      return {
        auth: {
          async getUser(receivedToken) {
            state.events.push("getUser");
            assert.equal(receivedToken, token);
            if (options.getUserThrows) throw new Error("sensitive auth failure");
            return options.invalidJwt
              ? { data: { user: null }, error: { message: "expired token detail" } }
              : { data: { user: { id: CALLER_ID } }, error: null };
          },
        },
        async rpc(name) {
          state.events.push("authorize");
          assert.equal(name, "get_current_team_access_contexts");
          if (options.authorizationThrows) throw new Error("sensitive permission failure");
          return {
            data: options.accessRows ?? [accessRow(options.permissions)],
            error: options.authorizationError ? { message: "permission SQL detail" } : null,
          };
        },
      };
    },
    createServiceClient() {
      state.events.push("service");
      state.serviceClients += 1;
      return {
        auth: {
          admin: {
            async listUsers({ page, perPage }) {
              state.events.push(`listUsers:${page}:${perPage}`);
              if (options.listUsersThrows) throw new Error("sensitive admin detail");
              if (options.listUsersError) {
                return { data: { users: [] }, error: { message: "sensitive admin detail" } };
              }
              return { data: { users: page === 1 && existingUser ? [existingUser] : [] }, error: null };
            },
            async createUser(attributes) {
              state.events.push("createUser");
              state.createAttributes.push(attributes);
              if (options.createThrows) throw new Error(`must not leak ${TEMPORARY_PASSWORD}`);
              if (options.createError) {
                return { data: { user: null }, error: { message: `must not leak ${TEMPORARY_PASSWORD}` } };
              }
              return { data: { user: { id: USER_ID, email: attributes.email } }, error: null };
            },
            async deleteUser(userId) {
              state.events.push("deleteUser");
              state.deletedUsers.push(userId);
              if (options.deleteThrows) throw new Error(`must not leak ${TEMPORARY_PASSWORD}`);
              return options.deleteError
                ? { data: { user: null }, error: { message: `must not leak ${TEMPORARY_PASSWORD}` } }
                : { data: { user: { id: userId } }, error: null };
            },
          },
        },
        from: query,
        async rpc(name, arguments_) {
          state.events.push("attach");
          assert.equal(name, "attach_team_member");
          state.attachArguments.push(arguments_);
          if (options.attachThrows) throw new Error(`must not leak ${TEMPORARY_PASSWORD}`);
          return options.attachError
            ? { data: null, error: options.attachError }
            : { data: null, error: null };
        },
      };
    },
  });
  return { edge, handler, state };
}

async function responseBody(response) {
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/u);
  return response.json();
}

function assertAllowedCors(response, expectedOrigin = origin) {
  assert.equal(response.headers.get("access-control-allow-origin"), expectedOrigin);
  assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(
    response.headers.get("access-control-allow-headers"),
    "authorization, content-type, apikey, x-client-info",
  );
  assert.equal(response.headers.get("vary"), "Origin");
}

function assertSensitiveJsonIsNotCacheable(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
}

test("Edge handler reflects only an exact allowed origin for CORS preflight", async () => {
  const { handler } = await loadHandler();
  const allowed = await handler(request({ method: "OPTIONS", authorization: "", contentType: "" }));
  assert.equal(allowed.status, 204);
  assert.equal(await allowed.text(), "");
  assertAllowedCors(allowed);

  const denied = await handler(request({ method: "OPTIONS", requestOrigin: "http://localhost:3000.evil.test", authorization: "", contentType: "" }));
  assert.equal(denied.status, 403);
  assert.deepEqual(await responseBody(denied), {
    ok: false,
    code: "origin_not_allowed",
    message: "Nguồn yêu cầu không được chấp nhận.",
  });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("Edge handler enforces POST and application/json before authentication", async () => {
  const { handler, state } = await loadHandler();
  const method = await handler(request({ method: "GET" }));
  assert.equal(method.status, 405);
  assert.equal((await responseBody(method)).code, "method_not_allowed");

  const media = await handler(request({ contentType: "text/plain" }));
  assert.equal(media.status, 415);
  assert.equal((await responseBody(media)).code, "unsupported_media_type");
  assert.deepEqual(state.callerTokens, []);
});

test("Edge handler rejects declared and streamed request bodies above 16 KiB", async () => {
  const declared = await loadHandler();
  const declaredResponse = await declared.handler(request({ declaredLength: 16 * 1024 + 1 }));
  assert.equal(declaredResponse.status, 413);
  assert.equal((await responseBody(declaredResponse)).code, "body_too_large");
  assert.deepEqual(declared.state.callerTokens, []);

  const streamed = await loadHandler();
  const streamedResponse = await streamed.handler(request({ body: "x".repeat(16 * 1024 + 1) }));
  assert.equal(streamedResponse.status, 413);
  assert.equal((await responseBody(streamedResponse)).code, "body_too_large");
  assert.equal(streamed.state.serviceClients, 0);
});

test("Edge handler verifies a bearer JWT with getUser and never constructs service access for an invalid caller", async () => {
  const missing = await loadHandler();
  const missingResponse = await missing.handler(request({ authorization: "" }));
  assert.equal(missingResponse.status, 401);
  assert.equal((await responseBody(missingResponse)).code, "unauthorized");
  assert.equal(missing.state.serviceClients, 0);

  const invalid = await loadHandler({ invalidJwt: true });
  const invalidResponse = await invalid.handler(request());
  assert.equal(invalidResponse.status, 401);
  assert.equal((await responseBody(invalidResponse)).code, "unauthorized");
  assert.deepEqual(invalid.state.callerTokens, ["verified-token"]);
  assert.deepEqual(invalid.state.events, ["caller", "getUser"]);
  assert.equal(invalid.state.serviceClients, 0);
});

test("Edge handler requires both manage permissions for the requested team before service access", async () => {
  for (const permissions of [[], ["players.manage"], ["members.manage"]]) {
    const { handler, state } = await loadHandler({ permissions });
    const response = await handler(request());
    assert.equal(response.status, 403, JSON.stringify(permissions));
    assert.equal((await responseBody(response)).code, "forbidden");
    assert.equal(state.serviceClients, 0);
    assert.deepEqual(state.events, ["caller", "getUser", "authorize"]);
  }
});

test("Edge handler denies Owner and cross-team role assignment without touching Auth users", async () => {
  for (const options of [{ ownerRole: true }, { crossTeamRole: true }, { teamDeleteRole: true }]) {
    const { handler, state } = await loadHandler(options);
    const response = await handler(request());
    assert.equal(response.status, 403, JSON.stringify(options));
    assert.equal((await responseBody(response)).code, "role_not_assignable");
    assert.deepEqual(state.createAttributes, []);
    assert.deepEqual(state.attachArguments, []);
  }
});

test("Edge handler creates, confirms, and atomically attaches a truly new user", async () => {
  const { handler, state } = await loadHandler();
  const response = await handler(request());
  assert.equal(response.status, 201);
  assert.deepEqual(await responseBody(response), {
    ok: true,
    account: "created",
    userId: USER_ID,
    temporaryPassword: TEMPORARY_PASSWORD,
  });
  assert.deepEqual(state.createAttributes, [{
    email: "new.player@example.com",
    password: TEMPORARY_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Nguyễn Minh Anh" },
  }]);
  assert.deepEqual(state.attachArguments, [{
    p_verified_actor_user_id: CALLER_ID,
    p_team_id: TEAM_ID,
    p_user_id: USER_ID,
    p_display_name: "Nguyễn Minh Anh",
    p_requires_password_change: true,
    p_role_id: ROLE_ID,
    p_shirt_number: 17,
    p_official_position: "MID",
    p_join_date: "2026-08-25",
  }]);
  assert.ok(state.events.indexOf("getUser") < state.events.indexOf("service"));
  assert.ok(state.events.indexOf("authorize") < state.events.indexOf("service"));
  assertAllowedCors(response);
  assertSensitiveJsonIsNotCacheable(response);
});

test("Edge handler attaches an existing user without generating or resetting a password", async () => {
  const { handler, state } = await loadHandler({ existingUser: true });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), {
    ok: true,
    account: "attached",
    userId: USER_ID,
  });
  assert.equal(state.events.includes("password"), false);
  assert.deepEqual(state.createAttributes, []);
  assert.deepEqual(state.attachArguments, [{
    p_verified_actor_user_id: CALLER_ID,
    p_team_id: TEAM_ID,
    p_user_id: USER_ID,
    p_display_name: "Nguyễn Minh Anh",
    p_requires_password_change: false,
    p_role_id: ROLE_ID,
    p_shirt_number: 17,
    p_official_position: "MID",
    p_join_date: "2026-08-25",
  }]);
  assertSensitiveJsonIsNotCacheable(response);
});

test("Edge handler returns a stable duplicate code for an active membership", async () => {
  const { handler, state } = await loadHandler({ existingUser: true, membershipStatus: "active" });
  const response = await handler(request());
  assert.equal(response.status, 409);
  assert.deepEqual(await responseBody(response), {
    ok: false,
    code: "duplicate_membership",
    message: "Cầu thủ đã là thành viên hoạt động của đội.",
  });
  assert.deepEqual(state.createAttributes, []);
  assert.deepEqual(state.attachArguments, []);
  assertSensitiveJsonIsNotCacheable(response);
});

test("Edge handler deletes only its just-created Auth user when attachment fails", async () => {
  const { handler, state } = await loadHandler({ attachError: { code: "23505", message: "shirt detail" } });
  const response = await handler(request());
  assert.equal(response.status, 409);
  assert.deepEqual(await responseBody(response), {
    ok: false,
    code: "conflict",
    message: "Không thể thêm cầu thủ do dữ liệu đã tồn tại.",
  });
  assert.deepEqual(state.deletedUsers, [USER_ID]);
  assert.ok(state.events.indexOf("attach") < state.events.indexOf("deleteUser"));
});

test("Edge handler redacts attachment and compensation failures, including the temporary password", async () => {
  for (const options of [
    { attachError: { code: "XX000", message: `database ${TEMPORARY_PASSWORD}` }, deleteError: true },
    { attachThrows: true, deleteThrows: true },
  ]) {
    const { handler } = await loadHandler(options);
    const response = await handler(request());
    assert.equal(response.status, 500, JSON.stringify(options));
    const raw = await response.text();
    assert.deepEqual(JSON.parse(raw), {
      ok: false,
      code: "manual_recovery_required",
      message: "Không thể hoàn tất tạo cầu thủ. Vui lòng liên hệ quản trị viên.",
    });
    assert.equal(raw.includes(TEMPORARY_PASSWORD), false);
    assert.equal(raw.includes("database"), false);
  }
});

test("Edge runtime password generation is at least 20 characters and always spans all required classes", async () => {
  const { edge } = await loadHandler();
  for (let index = 0; index < 32; index += 1) {
    const password = edge.generateTemporaryPassword();
    assert.ok(password.length >= 20);
    assert.match(password, /[A-Z]/u);
    assert.match(password, /[a-z]/u);
    assert.match(password, /[0-9]/u);
    assert.match(password, /[^A-Za-z0-9]/u);
  }
});
