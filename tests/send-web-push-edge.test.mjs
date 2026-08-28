import assert from "node:assert/strict";
import test from "node:test";

const INTERNAL_SECRET = "internal-push-secret-with-enough-entropy";
const DELIVERY_ID = "10000000-0000-4000-8000-000000000001";
const OUTBOX_ID = "20000000-0000-4000-8000-000000000001";

function claimedRow(overrides = {}) {
  return {
    delivery_id: DELIVERY_ID,
    outbox_id: OUTBOX_ID,
    endpoint: "https://push.example.test/subscriptions/device-one",
    p256dh: "A".repeat(88),
    auth: "B".repeat(24),
    title: "Lời mời tham gia trận đấu",
    body: "Bạn được mời tham gia trận gặp FC NÁT.",
    target_path:
      "/teams/nat-fc/matches/30000000-0000-4000-8000-000000000001/rsvp",
    event_kind: "invitation",
    attempt: 1,
    ...overrides,
  };
}

function request({
  method = "POST",
  secret = INTERNAL_SECRET,
  contentType = "application/json; charset=utf-8",
  body = JSON.stringify({ source: "database" }),
  declaredLength,
} = {}) {
  return new Request("https://functions.example/send-web-push", {
    method,
    headers: {
      ...(secret ? { "x-pro7-push-secret": secret } : {}),
      ...(contentType ? { "content-type": contentType } : {}),
      ...(declaredLength === undefined
        ? {}
        : { "content-length": String(declaredLength) }),
    },
    body: method === "POST" ? body : undefined,
  });
}

async function loadHandler(options = {}) {
  const edge = await import("../supabase/functions/send-web-push/index.ts").catch(
    () => null,
  );
  assert.ok(edge, "the local send-web-push Edge Function must exist");
  assert.equal(typeof edge.createSendWebPushHandler, "function");

  const state = {
    claimLimits: [],
    sends: [],
    settlements: [],
  };
  const rows = options.rows ?? [];
  const handler = edge.createSendWebPushHandler({
    internalSecret: INTERNAL_SECRET,
    claimLimit: options.claimLimit ?? 50,
    vapid: {
      subject: "mailto:push@example.test",
      publicKey: "public-vapid-key",
      privateKey: "private-vapid-key",
    },
    async claim(limit) {
      state.claimLimits.push(limit);
      if (options.claimError) throw new Error("sensitive claim SQL detail");
      return rows;
    },
    async send(subscription, payload, vapid) {
      state.sends.push({ subscription, payload: JSON.parse(payload), vapid });
      if (options.sendError) throw options.sendError;
      return { statusCode: options.statusCode ?? 201 };
    },
    async settle(deliveryId, outcome, errorCode) {
      state.settlements.push({ deliveryId, outcome, errorCode });
      if (options.settleError) throw new Error("sensitive settlement SQL detail");
    },
  });
  return { edge, handler, state };
}

async function json(response) {
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/u);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  return response.json();
}

test("push worker rejects non-POST, browser preflight, media mismatch, and bad secret before claiming", async () => {
  const { handler, state } = await loadHandler();
  const cases = [
    [request({ method: "GET" }), 405, "method_not_allowed"],
    [request({ method: "OPTIONS" }), 405, "method_not_allowed"],
    [request({ contentType: "text/plain" }), 415, "unsupported_media_type"],
    [request({ secret: "" }), 401, "unauthorized"],
    [request({ secret: "almost-the-right-secret" }), 401, "unauthorized"],
  ];
  for (const [input, status, code] of cases) {
    const response = await handler(input);
    assert.equal(response.status, status);
    assert.equal((await json(response)).code, code);
  }
  assert.deepEqual(state.claimLimits, []);
});

test("push worker accepts only the exact bounded internal database payload", async () => {
  const { handler, state } = await loadHandler();
  for (const input of [
    request({ body: "{" }),
    request({ body: JSON.stringify({ source: "browser" }) }),
    request({ body: JSON.stringify({ source: "database", extra: true }) }),
  ]) {
    const response = await handler(input);
    assert.equal(response.status, 400);
    assert.equal((await json(response)).code, "invalid_payload");
  }

  const declared = await handler(request({ declaredLength: 1025 }));
  assert.equal(declared.status, 413);
  assert.equal((await json(declared)).code, "body_too_large");

  const streamed = await handler(request({ body: "x".repeat(1025) }));
  assert.equal(streamed.status, 413);
  assert.equal((await json(streamed)).code, "body_too_large");
  assert.deepEqual(state.claimLimits, []);
});

test("push worker returns honest zero counts when the queue is empty", async () => {
  const { handler, state } = await loadHandler();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), {
    ok: true,
    claimed: 0,
    sent: 0,
    retry: 0,
    expired: 0,
    failed: 0,
    settleErrors: 0,
  });
  assert.deepEqual(state.claimLimits, [50]);
});

test("push worker sends a minimal same-origin RSVP payload and settles success", async () => {
  const row = claimedRow();
  const { handler, state } = await loadHandler({ rows: [row] });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), {
    ok: true,
    claimed: 1,
    sent: 1,
    retry: 0,
    expired: 0,
    failed: 0,
    settleErrors: 0,
  });
  assert.deepEqual(state.sends, [
    {
      subscription: {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      payload: {
        version: 1,
        outboxId: OUTBOX_ID,
        eventKind: "invitation",
        title: row.title,
        body: row.body,
        url: row.target_path,
        tag: `pro7-match-${OUTBOX_ID}`,
      },
      vapid: {
        subject: "mailto:push@example.test",
        publicKey: "public-vapid-key",
        privateKey: "private-vapid-key",
      },
    },
  ]);
  assert.deepEqual(state.settlements, [
    { deliveryId: DELIVERY_ID, outcome: "sent", errorCode: null },
  ]);
});

test("push worker classifies expired, retryable, permanent, and network failures", async () => {
  const cases = [
    [{ statusCode: 410 }, "expired", "provider_410", "expired"],
    [{ statusCode: 503 }, "retry", "provider_503", "retry"],
    [{ statusCode: 429 }, "retry", "provider_429", "retry"],
    [{ statusCode: 400 }, "permanent", "provider_400", "failed"],
    [{ sendError: new Error("sensitive endpoint failure") }, "retry", "network_error", "retry"],
  ];
  for (const [behavior, outcome, errorCode, countKey] of cases) {
    const { handler, state } = await loadHandler({ rows: [claimedRow()], ...behavior });
    const response = await handler(request());
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body[countKey], 1, JSON.stringify(behavior));
    assert.deepEqual(state.settlements, [
      { deliveryId: DELIVERY_ID, outcome, errorCode },
    ]);
  }
});

test("push worker fails malformed claims closed without sending", async () => {
  for (const row of [
    claimedRow({ delivery_id: "not-a-uuid" }),
    claimedRow({ endpoint: "http://push.example.test/device" }),
    claimedRow({ target_path: "https://evil.example/rsvp" }),
    claimedRow({ event_kind: "unexpected" }),
    claimedRow({ title: "" }),
    claimedRow({ attempt: 21 }),
  ]) {
    const { handler, state } = await loadHandler({ rows: [row] });
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.equal((await json(response)).failed, 1);
    assert.deepEqual(state.sends, []);
    if (row.delivery_id === DELIVERY_ID) {
      assert.deepEqual(state.settlements, [
        {
          deliveryId: DELIVERY_ID,
          outcome: "permanent",
          errorCode: "malformed_claim",
        },
      ]);
    } else {
      assert.deepEqual(state.settlements, []);
    }
  }
});

test("push worker isolates devices and never returns identifiers or provider details", async () => {
  const secondDelivery = "10000000-0000-4000-8000-000000000002";
  const rows = [
    claimedRow(),
    claimedRow({
      delivery_id: secondDelivery,
      endpoint: "https://push.example.test/subscriptions/device-two",
    }),
  ];
  let sendNumber = 0;
  const edge = await import("../supabase/functions/send-web-push/index.ts");
  const settlements = [];
  const handler = edge.createSendWebPushHandler({
    internalSecret: INTERNAL_SECRET,
    claimLimit: 2,
    vapid: {
      subject: "mailto:push@example.test",
      publicKey: "public-vapid-key",
      privateKey: "private-vapid-key",
    },
    async claim() {
      return rows;
    },
    async send() {
      sendNumber += 1;
      if (sendNumber === 2) throw new Error("sensitive provider error");
      return { statusCode: 201 };
    },
    async settle(deliveryId, outcome, errorCode) {
      settlements.push({ deliveryId, outcome, errorCode });
    },
  });
  const response = await handler(request());
  const raw = await response.text();
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(raw), {
    ok: true,
    claimed: 2,
    sent: 1,
    retry: 1,
    expired: 0,
    failed: 0,
    settleErrors: 0,
  });
  assert.deepEqual(settlements, [
    { deliveryId: DELIVERY_ID, outcome: "sent", errorCode: null },
    { deliveryId: secondDelivery, outcome: "retry", errorCode: "network_error" },
  ]);
  for (const secret of [DELIVERY_ID, OUTBOX_ID, "device-one", "device-two", "sensitive"]) {
    assert.equal(raw.includes(secret), false);
  }
});

test("push worker redacts queue failures and reports settlement failures only as a count", async () => {
  const claim = await loadHandler({ claimError: true });
  const claimResponse = await claim.handler(request());
  assert.equal(claimResponse.status, 500);
  const claimRaw = await claimResponse.text();
  assert.deepEqual(JSON.parse(claimRaw), {
    ok: false,
    code: "claim_failed",
    message: "Không thể nhận hàng đợi thông báo.",
  });
  assert.equal(claimRaw.includes("sensitive"), false);

  const settlement = await loadHandler({ rows: [claimedRow()], settleError: true });
  const settlementResponse = await settlement.handler(request());
  assert.equal(settlementResponse.status, 200);
  assert.deepEqual(await json(settlementResponse), {
    ok: true,
    claimed: 1,
    sent: 1,
    retry: 0,
    expired: 0,
    failed: 0,
    settleErrors: 1,
  });
});

test("push worker runtime requires exact configuration and constructs a service-only queue client", async () => {
  const edge = await import("../supabase/functions/send-web-push/index.ts");
  assert.equal(typeof edge.createSendWebPushRuntimeDependencies, "function");
  const values = new Map([
    ["SUPABASE_URL", "https://project.supabase.co"],
    ["SUPABASE_SERVICE_ROLE_KEY", "service-role-key"],
    ["PRO7_PUSH_INTERNAL_SECRET", INTERNAL_SECRET],
    ["PRO7_VAPID_SUBJECT", "mailto:push@example.test"],
    ["PRO7_VAPID_PUBLIC_KEY", "public-vapid-key"],
    ["PRO7_VAPID_PRIVATE_KEY", "private-vapid-key"],
    ["PRO7_PUSH_BATCH_SIZE", "75"],
  ]);
  const clients = [];
  const runtime = edge.createSendWebPushRuntimeDependencies({
    getEnvironment(name) {
      return values.get(name);
    },
    createSupabaseClient(url, key, options) {
      clients.push({ url, key, options });
      return { rpc() {} };
    },
    sendNotification: async () => ({ statusCode: 201 }),
  });
  assert.equal(runtime.internalSecret, INTERNAL_SECRET);
  assert.equal(runtime.claimLimit, 75);
  assert.deepEqual(runtime.vapid, {
    subject: "mailto:push@example.test",
    publicKey: "public-vapid-key",
    privateKey: "private-vapid-key",
  });
  assert.deepEqual(clients, [
    {
      url: "https://project.supabase.co",
      key: "service-role-key",
      options: {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    },
  ]);

  assert.throws(
    () =>
      edge.createSendWebPushRuntimeDependencies({
        getEnvironment: () => undefined,
        createSupabaseClient: () => ({}),
        sendNotification: async () => ({ statusCode: 201 }),
      }),
    /Missing required Edge Function configuration/u,
  );
});
