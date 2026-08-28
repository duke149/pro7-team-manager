import assert from "node:assert/strict";
import test from "node:test";

import {
  mutatePushSubscription,
  type PushSubscriptionActionDependencies,
} from "../lib/push/actions";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SUBSCRIPTION_ID = "20000000-0000-4000-8000-000000000001";
const endpoint = "https://push.example.test/subscriptions/device-one";
const subscription = {
  endpoint,
  expirationTime: null,
  keys: { p256dh: "A".repeat(88), auth: "B".repeat(24) },
};

function request(
  method: "POST" | "DELETE" = "POST",
  body: unknown = method === "POST" ? subscription : { endpoint },
  origin = "https://pro7.example",
) {
  return new Request("https://pro7.example/api/push/subscriptions", {
    method,
    headers: { origin, "content-type": "application/json", "user-agent": "Browser/1.0" },
    body: JSON.stringify(body),
  });
}

function dependencies(options: { user?: boolean; rpcError?: boolean; rpcData?: unknown } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const value: PushSubscriptionActionDependencies = {
    getCurrentUser: async () => options.user === false ? null : { id: USER_ID },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: options.rpcData ?? (name === "upsert_push_subscription" ? SUBSCRIPTION_ID : true),
        error: options.rpcError ? { message: "sensitive database detail" } : null,
      };
    },
  };
  return { value, calls };
}

test("subscription action rejects unsafe transport before identity or RPC work", async () => {
  for (const input of [
    request("POST", subscription, "https://evil.example"),
    new Request("https://pro7.example/api/push/subscriptions", { method: "POST", headers: { origin: "https://pro7.example", "content-type": "text/plain" }, body: "{}" }),
    new Request("https://pro7.example/api/push/subscriptions", { method: "POST", headers: { origin: "https://pro7.example", "content-type": "application/json", "content-length": String(16 * 1024 + 1) }, body: "{}" }),
  ]) {
    const supplied = dependencies();
    const response = await mutatePushSubscription(input, supplied.value);
    assert.ok([403, 413, 415].includes(response.status));
    assert.deepEqual(supplied.calls, []);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("subscription action binds subscribe to verified caller through one RPC", async () => {
  const supplied = dependencies();
  const response = await mutatePushSubscription(request(), supplied.value);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, subscriptionId: SUBSCRIPTION_ID });
  assert.deepEqual(supplied.calls, [{
    name: "upsert_push_subscription",
    args: {
      p_endpoint: endpoint,
      p_p256dh: "A".repeat(88),
      p_auth: "B".repeat(24),
      p_expiration_time: null,
      p_user_agent: "Browser/1.0",
    },
  }]);
});

test("subscription action removes only the verified caller endpoint", async () => {
  const supplied = dependencies();
  const response = await mutatePushSubscription(request("DELETE"), supplied.value);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, removed: true });
  assert.deepEqual(supplied.calls, [{
    name: "delete_push_subscription",
    args: { p_endpoint: endpoint },
  }]);
});

test("subscription action fails closed for missing caller, malformed body, and RPC failures", async () => {
  const unauthenticated = dependencies({ user: false });
  const unauthorized = await mutatePushSubscription(request(), unauthenticated.value);
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(unauthenticated.calls, []);

  const malformed = dependencies();
  const invalid = await mutatePushSubscription(request("POST", { ...subscription, userId: USER_ID }), malformed.value);
  assert.equal(invalid.status, 422);
  assert.deepEqual(malformed.calls, []);

  const failed = dependencies({ rpcError: true });
  const error = await mutatePushSubscription(request(), failed.value);
  assert.equal(error.status, 500);
  const raw = await error.text();
  assert.equal(raw.includes("sensitive"), false);

  const malformedSuccess = dependencies({ rpcData: "not-a-uuid" });
  const bad = await mutatePushSubscription(request(), malformedSuccess.value);
  assert.equal(bad.status, 500);
});
