import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { TeamNotification } from "../lib/notifications/model";

const ID = "00000000-0000-4000-8000-000000000201";
const notifications: TeamNotification[] = [{ id: ID, type: "match_invitation", sourceId: "00000000-0000-4000-8000-000000000101", title: "Mời tham gia trận", body: "FC NÁT vs FC Nat", targetPath: "/teams/nat-fc/matches/00000000-0000-4000-8000-000000000101", readAt: null, createdAt: "2026-10-10T08:00:00.000Z" }];
let NotificationCenter: (props: { initialNotifications: readonly TeamNotification[] }) => React.ReactNode; let act: (callback: () => void | Promise<void>) => Promise<void>; let createElement: typeof import("react").createElement; let createRoot: (container: Element) => { render(node: React.ReactNode): void; unmount(): void }; let browserWindow: Window;
const initialHandles = new Set(process._getActiveHandles());

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/teams/nat-fc/overview" });
  for (const [key, value] of Object.entries({ window: browserWindow, document: browserWindow.document, navigator: browserWindow.navigator, HTMLElement: browserWindow.HTMLElement, Node: browserWindow.Node, Event: browserWindow.Event, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const nodeEnvironment = process.env.NODE_ENV; (process.env as Record<string, string>).NODE_ENV = "test";
  const result = await build({ configFile: false, mode: "test", build: { lib: { entry: resolve("tests/fixtures/notification-mounted-entry.ts"), formats: ["cjs"], fileName: "notification-mounted" }, write: false } });
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnvironment;
  const code = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output).find((output) => output.type === "chunk" && output.isEntry)?.code; assert.ok(code); const bundleModule = { exports: {} as Record<string, unknown> }; new Function("module", "exports", code)(bundleModule, bundleModule.exports); ({ NotificationCenter, act, createElement, createRoot } = bundleModule.exports as never);
});
test.after(async () => { await browserWindow.happyDOM.abort(); browserWindow.close(); for (const handle of process._getActiveHandles()) if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") (handle as MessagePort).close(); });

async function mounted() { browserWindow.document.body.innerHTML = '<div id="root"></div>'; const container = browserWindow.document.getElementById("root"); assert.ok(container); const root = createRoot(container); await act(async () => root.render(createElement(NotificationCenter, { initialNotifications: notifications }))); return { container, root }; }

test("notification read state adopts only an authoritative timestamp", async () => {
  let attempt = 0; const calls: unknown[] = [];
  globalThis.fetch = (async (request, init) => { calls.push({ url: String(request), init }); attempt += 1; return attempt === 1 ? Response.json({ ok: true, readAt: "not-a-date" }) : Response.json({ ok: true, readAt: "2026-10-10T08:10:00.000Z" }); }) as typeof fetch;
  const view = await mounted(); const trigger = view.container.querySelector<HTMLButtonElement>('button[aria-label="Thông báo"]'); assert.ok(trigger); trigger.focus(); await act(async () => trigger.click());
  const mark = [...view.container.querySelectorAll("button")].find((button) => button.textContent?.includes("Đánh dấu đã đọc")); assert.ok(mark);
  await act(async () => { mark.click(); await new Promise((resolvePromise) => setTimeout(resolvePromise, 0)); }); assert.match(view.container.textContent ?? "", /1/u); assert.match(view.container.textContent ?? "", /Không thể cập nhật trạng thái/u);
  await act(async () => { mark.click(); await new Promise((resolvePromise) => setTimeout(resolvePromise, 0)); }); assert.equal(view.container.querySelector(".notification-badge"), null); assert.equal(calls.length, 2);
  await act(async () => document.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event)); assert.equal(view.container.querySelector(".notification-popover"), null); assert.equal(document.activeElement, trigger); await act(async () => view.root.unmount());
});
