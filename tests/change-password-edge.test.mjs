import assert from "node:assert/strict";
import test from "node:test";

const origin = "https://pro7.example";
const user = { id: "user-1", email: "member@example.com" };

async function loadHandler(options = {}) {
  const edge = await import(
    "../supabase/functions/change-temporary-password/index.ts"
  ).catch(() => null);
  assert.ok(edge, "the local change-temporary-password Edge Function must exist");
  assert.equal(
    typeof edge.createChangeTemporaryPasswordHandler,
    "function",
    "the Edge Function must export an injected handler factory",
  );

  const state = { updatedPassword: null, flagCleared: false };
  const handler = edge.createChangeTemporaryPasswordHandler({
    allowedOrigins: [origin],
    createJwtClient() {
      return {
        auth: {
          async getUser() {
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
            return password === "Temporary-1!" && !options.invalidCurrentPassword
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
              if (options.adminUpdateFailure) {
                return { data: { user: null }, error: { message: "upstream failure" } };
              }
              state.updatedPassword = password;
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
                  return Promise.resolve(
                    options.profileClearFailure
                      ? { data: null, error: { message: "database failure" } }
                      : (() => {
                          state.flagCleared = true;
                          return { data: null, error: null };
                        })(),
                  );
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
  body = { currentTemporaryPassword: "Temporary-1!", newPassword: "Violet-Cedar9!" },
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

test("Edge handler allows only POST requests", async () => {
  const { handler } = await loadHandler();
  const response = await handler(request({ method: "GET" }));

  assert.equal(response.status, 405);
  assert.deepEqual(await responseBody(response), { error: "Phương thức không được hỗ trợ." });
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
  assert.deepEqual(state, { updatedPassword: null, flagCleared: false });
});

test("Edge handler rejects an unchanged password without clearing the profile flag", async () => {
  const { handler, state } = await loadHandler();
  const response = await handler(
    request({ body: { currentTemporaryPassword: "Temporary-1!", newPassword: "Temporary-1!" } }),
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await responseBody(response), { error: "Không thể đổi mật khẩu." });
  assert.deepEqual(state, { updatedPassword: null, flagCleared: false });
});

test("Edge handler rejects a new password that fails policy", async () => {
  const { handler, state } = await loadHandler();
  const response = await handler(
    request({ body: { currentTemporaryPassword: "Temporary-1!", newPassword: "short" } }),
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await responseBody(response), { error: "Không thể đổi mật khẩu." });
  assert.deepEqual(state, { updatedPassword: null, flagCleared: false });
});

test("Edge handler retains the profile flag when the Admin API password update fails", async () => {
  const { handler, state } = await loadHandler({ adminUpdateFailure: true });
  const response = await handler(request());

  assert.equal(response.status, 500);
  assert.deepEqual(await responseBody(response), { error: "Không thể đổi mật khẩu." });
  assert.deepEqual(state, { updatedPassword: null, flagCleared: false });
});

test("Edge handler reports a generic failure when profile flag clearing fails", async () => {
  const { handler, state } = await loadHandler({ profileClearFailure: true });
  const response = await handler(request());

  assert.equal(response.status, 500);
  assert.deepEqual(await responseBody(response), { error: "Không thể đổi mật khẩu." });
  assert.deepEqual(state, { updatedPassword: "Violet-Cedar9!", flagCleared: false });
});

test("Edge handler updates the password then clears only the password-change flag", async () => {
  const { handler, state } = await loadHandler();
  const response = await handler(request());

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { message: "Đổi mật khẩu thành công." });
  assert.deepEqual(state, { updatedPassword: "Violet-Cedar9!", flagCleared: true });
});
