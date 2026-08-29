import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

type Root = { unmount(): void };
type Gate = (props: { vapidPublicKey?: string }) => React.ReactNode;
let PushPermissionGate: Gate;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => Root;
let browserWindow: Window & typeof globalThis;
type ActiveHandle = { constructor: { name: string }; close?: () => void };
const activeHandles = () => (process as unknown as { _getActiveHandles(): ActiveHandle[] })._getActiveHandles();
const initialHandles = new Set(activeHandles());

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/teams/nat-fc/overview" }) as unknown as Window & typeof globalThis;
  for (const [key, value] of Object.entries({
    window: browserWindow,
    document: browserWindow.document,
    navigator: browserWindow.navigator,
    HTMLElement: browserWindow.HTMLElement,
    Node: browserWindow.Node,
    Event: browserWindow.Event,
    MouseEvent: browserWindow.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({
    configFile: false,
    build: { lib: { entry: resolve("tests/fixtures/push-permission-mounted-entry.ts"), formats: ["cjs"], fileName: "push-permission" }, write: false },
  });
  process.env.NODE_ENV = nodeEnvironment ?? "test";
  const code = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output).find((entry) => entry.type === "chunk")?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ PushPermissionGate, act, createElement, createRoot } = bundleModule.exports as never);
});

test.after(async () => {
  await browserWindow.happyDOM.abort();
  browserWindow.close();
  for (const handle of activeHandles()) {
    if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") handle.close?.();
  }
});

function configure({ permission = "default", userAgent = "Desktop Browser", standalone = false, dismissed = false, webPushApis = true } = {}) {
  let requested = 0;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const subscription = {
    endpoint: "https://push.example.test/device",
    expirationTime: null,
    toJSON: () => ({ endpoint: "https://push.example.test/device", expirationTime: null, keys: { p256dh: "A".repeat(88), auth: "B".repeat(24) } }),
  };
  const pushManager = {
    async getSubscription() { return null; },
    async subscribe() { return subscription; },
  };
  const notification = {
    permission,
    async requestPermission() { requested += 1; return "granted"; },
  };
  if (webPushApis) {
    Object.defineProperty(browserWindow, "Notification", { configurable: true, value: notification });
    Object.defineProperty(browserWindow, "PushManager", { configurable: true, value: function PushManager() {} });
    Object.defineProperty(globalThis, "Notification", { configurable: true, value: notification });
    Object.defineProperty(globalThis, "PushManager", { configurable: true, value: browserWindow.PushManager });
    Object.defineProperty(browserWindow.navigator, "serviceWorker", {
      configurable: true,
      value: { async register() { return { pushManager }; } },
    });
  } else {
    Reflect.deleteProperty(browserWindow, "Notification");
    Reflect.deleteProperty(browserWindow, "PushManager");
    Reflect.deleteProperty(globalThis, "Notification");
    Reflect.deleteProperty(globalThis, "PushManager");
    Reflect.deleteProperty(browserWindow.navigator, "serviceWorker");
  }
  Object.defineProperty(browserWindow.navigator, "userAgent", { configurable: true, value: userAgent });
  Object.defineProperty(browserWindow.navigator, "standalone", { configurable: true, value: standalone });
  Object.defineProperty(browserWindow, "matchMedia", { configurable: true, value: () => ({ matches: standalone }) });
  const values = new Map<string, string>();
  if (dismissed) values.set("pro7-push-permission-dismissed:v1", "1");
  const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  Object.defineProperty(browserWindow, "localStorage", {
    configurable: true,
    value: localStorage,
  });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
  Object.defineProperty(browserWindow, "fetch", {
    configurable: true,
    value: async (url: string, init: RequestInit) => { requests.push({ url, init }); return new Response(JSON.stringify({ ok: true, subscriptionId: "20000000-0000-4000-8000-000000000001" }), { status: 201, headers: { "content-type": "application/json" } }); },
  });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: browserWindow.fetch });
  return { get requested() { return requested; }, requests, values };
}

async function mount() {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  await act(async () => { root.render(createElement(PushPermissionGate, { vapidPublicKey: "B".repeat(88) })); await Promise.resolve(); });
  return { container, root };
}

test("soft gate never requests browser permission before an explicit click", async () => {
  const browser = configure();
  const { container, root } = await mount();
  assert.match(container.textContent ?? "", /Nhận thông báo trận đấu/u);
  assert.equal(browser.requested, 0);
  const enable = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Bật thông báo"));
  assert.ok(enable);
  await act(async () => { (enable as HTMLButtonElement).click(); await Promise.resolve(); await Promise.resolve(); });
  assert.equal(browser.requested, 1);
  assert.equal(browser.requests.length, 1);
  assert.equal(browser.requests[0]?.url, "/api/push/subscriptions");
  assert.equal(browser.requests[0]?.init.method, "POST");
  assert.equal(container.querySelector(".push-permission-gate"), null);
  await act(async () => root.unmount());
});

test("dismissal persists and iOS outside standalone receives install guidance", async () => {
  configure({ dismissed: true });
  const dismissed = await mount();
  assert.equal(dismissed.container.querySelector(".push-permission-gate"), null);
  await act(async () => dismissed.root.unmount());

  const ios = configure({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" });
  const guided = await mount();
  assert.match(guided.container.textContent ?? "", /Thêm PRO7 vào Màn hình chính/u);
  assert.doesNotMatch(guided.container.textContent ?? "", /Bật thông báo/u);
  assert.equal(ios.requested, 0);
  await act(async () => guided.root.unmount());
});

test("iOS browser without push globals receives Home Screen guidance instead of an unsupported verdict", async () => {
  const ios = configure({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    webPushApis: false,
  });
  const guided = await mount();
  assert.match(guided.container.textContent ?? "", /Thêm PRO7 vào Màn hình chính/u);
  assert.doesNotMatch(guided.container.textContent ?? "", /chưa hỗ trợ Web Push/u);
  assert.equal(ios.requested, 0);
  await act(async () => guided.root.unmount());
});

test("installed iOS without Web Push APIs receives version and reinstall guidance", async () => {
  configure({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X)",
    standalone: true,
    webPushApis: false,
  });
  const unsupported = await mount();
  assert.match(unsupported.container.textContent ?? "", /Web Push chưa sẵn sàng trên iPhone\/iPad/u);
  assert.match(unsupported.container.textContent ?? "", /iOS\/iPadOS 16\.4/u);
  assert.match(unsupported.container.textContent ?? "", /xóa biểu tượng PRO7.*thêm lại/u);
  await act(async () => unsupported.root.unmount());
});

test("denied permission shows browser-settings guidance without another prompt", async () => {
  const browser = configure({ permission: "denied" });
  const { container, root } = await mount();
  assert.match(container.textContent ?? "", /cài đặt trình duyệt/u);
  assert.equal(browser.requested, 0);
  await act(async () => root.unmount());
});
