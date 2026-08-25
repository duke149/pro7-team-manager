import assert from "node:assert/strict";
import test from "node:test";

const origin = "https://pro7.example";
const user = { id: "user-1", email: "member@example.com" };
const currentTemporaryPassword = "Temporary-1!";
const newPassword = "Violet-Cedar9!";

async function loadHandler(options = {}) {
  const edge = await import("../supabase/functions/change-temporary-password/index.ts").catch(
    () => null,
  );
  assert.ok(edge, "the local change-temporary-password Edge Function must exist");
  assert.equal(
    typeof edge.createChangeTemporaryPasswordHandler,
    "function",
    "the Edge Function must export an injected handler factory",
  );

  const state = { passwordUpdates: [], flagCleared: false, events: [] };
  const handler = edge.createChangeTemporaryPasswordHandler({
    allowedOrigins: [origin],
    createJwtClient() {
      return {
        auth: {
          async getUser() {
            if (options.rejectGetUser) throw new Error("identity unavailable");
            return options.invalidToken
              ? { data: { user: null }, error: { message: "expired" } }
              : { data: { user }, error: null };
          },
        },
      };
    },
    createPasswordClient() {
      return {
        auth: {
          async signInWithPassword({ password }) {
            if (options.rejectSignIn) throw new Error("sign-in unavailable");
            return password === currentTemporaryPassword && !options.invalidCurrentPassword
              ? { data: { session: { access_token: "must-not-leak" }, user }, error: null }
              : { data: { session: null, user: null }, error: { message: "invalid" } };
          },
        },
      };
    },
    createServiceClient() {
      return {
        auth: {
          admin: {
            async updateUserById(_id, { password }) {
              state.events.push(`admin:${password}`);
              if (
                (options.adminUpdateFailure && password === newPassword) ||
                (options.compensationFailure && password === currentTemporaryPassword) ||
                (options.rejectAdmin && password === newPassword)
              ) {
                if (options.rejectAdmin && password === newPassword) {
                  throw new Error("admin unavailable");
                }
                return { data: { user: null }, error: { message: "upstream failure" } };
              }
              state.passwordUpdates.push(password);
              return { data: { user }, error: null };
            },
          },
        },
        from(table) {
          assert.equal(table, "profiles");
          return {
            update(values) {
              assert.deepEqual(values, { requires_password_change: false });
              return {
                eq(field, value) {
                  assert.equal(field, "id");
                  assert.equal(value, user.id);
                  return {
                    async select(columns) {
                      assert.equal(columns, "id");
                      state.events.push("profile");
                      if (options.rejectProfile) throw new Error("database unavailable");
                      if (options.profileClearFailure) {
                        return { data: null, error: { message: "database failure" } };
                      }
                      if (options.profileClearZeroRows) return { data: [], error: null };
                      state.flagCleared = true;
                      return { data: [{ id: user.id }], error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  });
  return { handler, state };
}

function request({
  method = "POST",
  requestOrigin = origin,
  authorization = "Bearer verified-token",
  body = { currentTemporaryPassword, newPassword },
} = {}) {
  return new Request("https://functions.example/change-temporary-password", {
    method,
    headers: {
      origin: requestOrigin,
      ...(authorization ? { authorization } : {}),
      "content-type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

async function responseBody(response) {
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  return response.json();
}

function assertAllowedCors(response) {
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(
    response.headers.get("access-control-allow-headers"),
    "authorization, content-type, apikey, x-client-info",
  );
}

test("Edge handler answers allowed CORS preflight before POST-only enforcement", async () => {
  const { handler } = await loadHandler();
  const response = await handler(request({ method: "OPTIONS", authorization: "" }));

  assert.equal(response.status, 204);
  assertAllowedCors(response);
  assert.equal(await response.text(), "");
});

test("Edge handler denies disallowed CORS preflight without reflecting its origin", async () => {
  const { handler } = await loadHandler();
  const response = await handler(
    request({ method: "OPTIONS", requestOrigin: "https://attacker.example", authorization: "" }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await responseBody(response), { error: "Nguồn yêu cầu không được chấp nhận." });
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("Edge handler allows only POST requests after accepting the request origin", async () => {
  const { handler } = await loadHandler();
  const response = await handler(request({ method: "GET" }));

  assert.equal(response.status, 405);
  assert.deepEqual(await responseBody(response), { error: "Phương thức không được hỗ trợ." });
  assertAllowedCors(response);
});

test("Edge handler rejects origins outside its allow-list", async () => {
  const { handler } = await loadHandler();
  const response = await handler(request({ requestOrigin: "https://attacker.example" }));

  assert.equal(response.status, 403);
  assert.deepEqual(await responseBody(response), { error: "Nguồn yêu cầu không được chấp nhận." });
});

test("Edge handler rejects missing or invalid bearer callers", async () => {
  const missing = await loadHandler();
  const missingResponse = await missing.handler(request({ authorization: "" }));
  assert.equal(missingResponse.status, 401);
  assert.deepEqual(await responseBody(missingResponse), { error: "Không thể xác minh tài khoản." });

  const invalid = await loadHandler({ invalidToken: true });
  const invalidResponse = await invalid.handler(request());
  assert.equal(invalidResponse.status, 401);
  assert.deepEqual(await responseBody(invalidResponse), { error: "Không thể xác minh tài khoản." });
});

test("Edge handler gives no credential detail when the current temporary password is invalid", async () => {
  const { handler, state } = await loadHandler({ invalidCurrentPassword: true });
  const response = await handler(request());

  assert.equal(response.status, 422);
  assert.deepEqual(await responseBody(response), { error: "Không thể đổi mật khẩu." });
  assert.deepEqual(state.passwordUpdates, []);
  assert.equal(state.flagCleared, false);
});

test("Edge handler rejects an unchanged password without clearing the profile flag", async () => {
  const { handler, state } = await loadHandler();
  const response = await handler(
    request({ body: { currentTemporaryPassword, newPassword: currentTemporaryPassword } }),
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await responseBody(response), { error: "Không thể đổi mật khẩu." });
  assert.deepEqual(state.passwordUpdates, []);
  assert.equal(state.flagCleared, false);
});

test("Edge handler rejects a new password that fails policy", async () => {
  const { handler, state } = await loadHandler();
  const response = await handler(
    request({ body: { currentTemporaryPassword, newPassword: "short" } }),
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await responseBody(response), { error: "Không thể đổi mật khẩu." });
  assert.deepEqual(state.passwordUpdates, []);
  assert.equal(state.flagCleared, false);
});

test("Edge handler retains the profile flag when the Admin API password update fails", async () => {
  const { handler, state } = await loadHandler({ adminUpdateFailure: true });
  const response = await handler(request());

  assert.equal(response.status, 500);
  assert.deepEqual(await responseBody(response), { error: "Không thể đổi mật khẩu." });
  assert.deepEqual(state.passwordUpdates, []);
  assert.equal(state.flagCleared, false);
});

test("Edge handler compensates when profile clearing fails", async () => {
  const { handler, state } = await loadHandler({ profileClearFailure: true });
  const response = await handler(request());

  assert.equal(response.status, 500);
  assert.deepEqual(await responseBody(response), { error: "Không thể đổi mật khẩu." });
  assert.deepEqual(state.passwordUpdates, [newPassword, currentTemporaryPassword]);
  assert.deepEqual(state.events, [`admin:${newPassword}`, "profile", `admin:${currentTemporaryPassword}`]);
  assert.equal(state.flagCleared, false);
});

test("Edge handler compensates when no profile flag row is cleared", async () => {
  const { handler, state } = await loadHandler({ profileClearZeroRows: true });
  const response = await handler(request());

  assert.equal(response.status, 500);
  assert.deepEqual(await responseBody(response), { error: "Không thể đổi mật khẩu." });
  assert.deepEqual(state.passwordUpdates, [newPassword, currentTemporaryPassword]);
  assert.deepEqual(state.events, [`admin:${newPassword}`, "profile", `admin:${currentTemporaryPassword}`]);
});

test("Edge handler returns manual recovery guidance when compensation fails", async () => {
  const { handler, state } = await loadHandler({
    profileClearFailure: true,
    compensationFailure: true,
  });
  const response = await handler(request());

  assert.equal(response.status, 500);
  assert.deepEqual(await responseBody(response), {
    error: "Không thể hoàn tất đổi mật khẩu. Vui lòng liên hệ quản trị viên.",
    code: "manual_recovery_required",
  });
  assert.deepEqual(state.passwordUpdates, [newPassword]);
  assert.deepEqual(state.events, [`admin:${newPassword}`, "profile", `admin:${currentTemporaryPassword}`]);
});

test("Edge handler sanitizes rejected dependency promises", async () => {
  for (const options of [
    { rejectGetUser: true },
    { rejectSignIn: true },
    { rejectAdmin: true },
    { rejectProfile: true },
  ]) {
    const { handler } = await loadHandler(options);
    const response = await handler(request());

    assert.equal(response.status, 500, JSON.stringify(options));
    assert.deepEqual(
      await responseBody(response),
      { error: "Không thể đổi mật khẩu." },
      JSON.stringify(options),
    );
    assertAllowedCors(response);
  }
});

test("Edge handler updates the password then clears exactly one profile flag row", async () => {
  const { handler, state } = await loadHandler();
  const response = await handler(request());

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { message: "Đổi mật khẩu thành công." });
  assert.deepEqual(state.passwordUpdates, [newPassword]);
  assert.deepEqual(state.events, [`admin:${newPassword}`, "profile"]);
  assert.equal(state.flagCleared, true);
});
