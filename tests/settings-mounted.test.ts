import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

test("successful team save resets dirty state while failed saves remain retryable", async () => {
  const initialHandles = new Set(process._getActiveHandles());
  const win = new Window({ url: "https://pro7.example/teams/nat-fc/admin/settings" });
  for (const [key, value] of Object.entries({ window: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, Node: win.Node, Event: win.Event, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  const result = await build({ configFile: false, mode: "test", build: { lib: { entry: resolve("tests/settings-mounted-entry.ts"), formats: ["cjs"] }, write: false } });
  process.env.NODE_ENV = previousEnv;
  const code = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output).find(output => output.type === "chunk" && output.isEntry)?.code;
  assert.ok(code);
  const bundle = { exports: {} as typeof import("./settings-mounted-entry") };
  new Function("module", "exports", code)(bundle, bundle.exports);
  const { SettingsView, act, createElement, createRoot } = bundle.exports;
  const container = win.document.createElement("div"); win.document.body.append(container);
  const root = createRoot(container as unknown as Element);
  const previousFetch = globalThis.fetch;
  try {
    await act(async () => root.render(createElement(SettingsView, { team: { id: "team", name: "FC NÁT", slug: "nat-fc" }, permissions: ["team.update"], data: { updatedAt: "2026-09-05T00:00:00Z", notificationSettings: { matchInvitations: true, matchReminders: true, reminderHoursBefore: 2 }, paymentSettings: null, activeMembers: 23, inactiveMembers: 0, roles: [], auditEvents: [] } })));
    const form = container.querySelector("#team form"); const input = form?.querySelector("input"); const button = form?.querySelector("button");
    assert.ok(form); assert.ok(input); assert.ok(button); assert.equal(button.disabled, true);
    const setName = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set?.call(input, value); input.dispatchEvent(new win.Event("input", { bubbles: true })); });
    await setName("FC NÁT mới"); assert.equal(button.disabled, false);
    globalThis.fetch = async () => Response.json({ ok: true });
    await act(async () => { form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(button.disabled, true, "saved name must become the clean baseline");
    await setName("FC NÁT khác"); assert.equal(button.disabled, false);
    globalThis.fetch = async () => Response.json({ message: "Không thể lưu" }, { status: 500 });
    await act(async () => { form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(button.disabled, false, "failed save must remain retryable");
  } finally {
    globalThis.fetch = previousFetch;
    await act(async () => root.unmount());
    await win.happyDOM.abort(); win.close();
    for (const handle of process._getActiveHandles()) if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") (handle as MessagePort).close();
  }
});
