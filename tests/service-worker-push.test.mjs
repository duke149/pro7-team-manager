import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function worker() {
  const source = await readFile(new URL("../public/pro7-sw.js", import.meta.url), "utf8");
  const handlers = new Map();
  const shown = [];
  const opened = [];
  const navigated = [];
  const client = {
    url: "https://pro7.example/teams/nat-fc/overview",
    async focus() {},
    async navigate(url) { navigated.push(url); },
  };
  const self = {
    location: { origin: "https://pro7.example" },
    registration: {
      async showNotification(title, options) { shown.push({ title, options }); },
    },
    clients: {
      async matchAll() { return [client]; },
      async openWindow(url) { opened.push(url); },
      async claim() {},
    },
    skipWaiting() {},
    addEventListener(name, handler) { handlers.set(name, handler); },
  };
  vm.runInNewContext(source, { self, URL, JSON, Promise, Set });
  return { handlers, shown, opened, navigated };
}

function pushPayload(overrides = {}) {
  return {
    version: 1,
    outboxId: "20000000-0000-4000-8000-000000000001",
    eventKind: "invitation",
    title: "Lời mời tham gia trận đấu",
    body: "Bạn được mời tham gia trận gặp FC NÁT.",
    url: "/teams/nat-fc/matches/30000000-0000-4000-8000-000000000001/rsvp",
    tag: "pro7-match-20000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

test("service worker validates push payloads and shows only local RSVP notifications", async () => {
  const runtime = await worker();
  const handler = runtime.handlers.get("push");
  assert.equal(typeof handler, "function");
  let pending;
  handler({ data: { json: () => pushPayload() }, waitUntil(value) { pending = value; } });
  await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.shown)), [{
    title: "Lời mời tham gia trận đấu",
    options: {
      body: "Bạn được mời tham gia trận gặp FC NÁT.",
      tag: "pro7-match-20000000-0000-4000-8000-000000000001",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: "/teams/nat-fc/matches/30000000-0000-4000-8000-000000000001/rsvp" },
    },
  }]);

  for (const payload of [
    pushPayload({ url: "https://evil.example/rsvp" }),
    pushPayload({ eventKind: "unknown" }),
    pushPayload({ extra: true }),
    null,
  ]) {
    let rejected;
    handler({ data: payload === null ? null : { json: () => payload }, waitUntil(value) { rejected = value; } });
    await rejected;
  }
  assert.equal(runtime.shown.length, 1);
});

test("notification click focuses an existing client and navigates only within the worker origin", async () => {
  const runtime = await worker();
  const handler = runtime.handlers.get("notificationclick");
  let closed = 0;
  let pending;
  handler({
    notification: { data: { url: "/teams/nat-fc/matches/30000000-0000-4000-8000-000000000001/rsvp" }, close() { closed += 1; } },
    waitUntil(value) { pending = value; },
  });
  await pending;
  assert.equal(closed, 1);
  assert.deepEqual(runtime.navigated, ["https://pro7.example/teams/nat-fc/matches/30000000-0000-4000-8000-000000000001/rsvp"]);
  assert.deepEqual(runtime.opened, []);

  handler({
    notification: { data: { url: "https://evil.example/rsvp" }, close() {}, },
    waitUntil(value) { pending = value; },
  });
  await pending;
  assert.equal(runtime.navigated.length, 1);
  assert.deepEqual(runtime.opened, []);
});
