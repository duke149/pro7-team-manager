import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PUSH_SUBSCRIPTION_BODY_BYTES,
  validatePushSubscriptionMutation,
} from "../lib/push/validation";

const endpoint = "https://push.example.test/subscriptions/device-one";

test("push subscription validation accepts exact subscribe and unsubscribe contracts", () => {
  const subscribe = {
    endpoint,
    expirationTime: null,
    keys: { p256dh: "A".repeat(88), auth: "B".repeat(24) },
  };
  const subscribeResult = validatePushSubscriptionMutation("POST", subscribe);
  assert.deepEqual(subscribeResult, {
    ok: true,
    value: Object.freeze({
      action: "subscribe",
      endpoint,
      expirationTime: null,
      p256dh: "A".repeat(88),
      auth: "B".repeat(24),
    }),
  });
  assert.deepEqual(validatePushSubscriptionMutation("DELETE", { endpoint }), {
    ok: true,
    value: Object.freeze({ action: "unsubscribe", endpoint }),
  });
  assert.equal(MAX_PUSH_SUBSCRIPTION_BODY_BYTES, 16 * 1024);
});

test("push subscription validation rejects unknown keys, wrong methods, and unsafe endpoints", () => {
  for (const [method, body] of [
    ["PATCH", { endpoint }],
    ["DELETE", { endpoint, extra: true }],
    ["POST", { endpoint, expirationTime: null, keys: { p256dh: "A".repeat(88), auth: "B".repeat(24) }, userId: "forged" }],
    ["POST", { endpoint: "http://push.example/device", expirationTime: null, keys: { p256dh: "A".repeat(88), auth: "B".repeat(24) } }],
    ["POST", { endpoint: "https://push.example/device#fragment", expirationTime: null, keys: { p256dh: "A".repeat(88), auth: "B".repeat(24) } }],
  ] as const) {
    assert.equal(validatePushSubscriptionMutation(method, body).ok, false);
  }
});

test("push subscription validation enforces expiration and encryption-key bounds", () => {
  const base = { endpoint, expirationTime: null, keys: { p256dh: "A".repeat(88), auth: "B".repeat(24) } };
  for (const body of [
    { ...base, expirationTime: 0 },
    { ...base, expirationTime: 1.5 },
    { ...base, expirationTime: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, keys: { ...base.keys, p256dh: "short" } },
    { ...base, keys: { ...base.keys, auth: "has spaces here" } },
    { ...base, keys: { ...base.keys, p256dh: "A".repeat(201) } },
  ]) {
    assert.equal(validatePushSubscriptionMutation("POST", body).ok, false);
  }
});
