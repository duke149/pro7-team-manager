import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { MatchDetail as MatchDetailModel } from "../lib/matches/model";

const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const USER_ID = "00000000-0000-4000-8000-000000000010";
const DETAIL: MatchDetailModel = {
  match: { id: MATCH_ID, opponent: "Metro City", startsAt: "2026-10-19T12:30:00.000Z", venue: "Riverside", isHome: true, rsvpDeadline: "2026-10-18T12:30:00.000Z", status: "scheduled", teamScore: null, opponentScore: null, updatedAt: "2026-10-01T00:00:00.000Z", attendance: { invited: 1, available: 0, unavailable: 0, pending: 1 }, ownAttendance: { status: "pending", updatedAt: "2026-10-02T00:00:00.000Z" } },
  attendance: [{ userId: USER_ID, displayName: "Nguyễn An", status: "pending", note: null, respondedAt: null, updatedAt: "2026-10-02T00:00:00.000Z" }],
  events: [], playerStats: [], teamMetrics: null, inviteCandidates: [],
};

let MatchDetail: (props: { slug: string; teamName: string; userId: string; detail: MatchDetailModel; canManage: boolean; canRespond: boolean }) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => { render(node: React.ReactNode): void; unmount(): void };
let browserWindow: Window & typeof globalThis;
const initialHandles = new Set(process._getActiveHandles());

test.before(async () => {
  browserWindow = new Window({ url: `https://pro7.example/teams/pro7-fc/matches/${MATCH_ID}` }) as unknown as Window & typeof globalThis;
  for (const [key, value] of Object.entries({ window: browserWindow, document: browserWindow.document, navigator: browserWindow.navigator, HTMLElement: browserWindow.HTMLElement, Node: browserWindow.Node, Event: browserWindow.Event, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({ configFile: false, plugins: [{ name: "matches-mounted-navigation", enforce: "pre", resolveId(id) { return id === "next/navigation" ? resolve("tests/fixtures/matches-navigation.ts") : null; } }], build: { lib: { entry: resolve("tests/fixtures/matches-mounted-entry.ts"), formats: ["cjs"], fileName: "matches-mounted" }, write: false } });
  process.env.NODE_ENV = nodeEnvironment ?? "test";
  const code = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output).find((output) => output.type === "chunk")?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ MatchDetail, act, createElement, createRoot } = bundleModule.exports as never);
});
test.after(async () => { await browserWindow.happyDOM.abort(); browserWindow.close(); for (const handle of process._getActiveHandles()) if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") (handle as MessagePort).close(); });

async function mounted(canManage = false) {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root"); assert.ok(container);
  const root = createRoot(container); globalThis.__matchesRefreshes = 0;
  await act(async () => root.render(createElement(MatchDetail, { slug: "pro7-fc", teamName: "PRO7 FC", userId: USER_ID, detail: DETAIL, canManage, canRespond: true })));
  return { container, root };
}

test("own RSVP sends same-origin JSON with stale token then refreshes navigation", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(input), init }); return Response.json({ ok: true }); }) as typeof fetch;
  const view = await mounted();
  const button = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "Có"); assert.ok(button);
  await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.deepEqual(calls, [{ url: `/api/teams/pro7-fc/matches/${MATCH_ID}/attendance`, init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "respond", status: "available", note: null, expectedUpdatedAt: "2026-10-02T00:00:00.000Z" }) } }]);
  assert.equal(globalThis.__matchesRefreshes, 1);
  await act(async () => view.root.unmount());
});

test("failed RSVP reports the server message and does not refresh stale UI", async () => {
  globalThis.fetch = (async () => Response.json({ ok: false, code: "stale", message: "Dữ liệu đã thay đổi. Vui lòng tải lại." }, { status: 409 })) as typeof fetch;
  const view = await mounted();
  const button = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "Không"); assert.ok(button);
  await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.match(view.container.textContent ?? "", /Dữ liệu đã thay đổi/u);
  assert.equal(globalThis.__matchesRefreshes, 0);
  await act(async () => view.root.unmount());
});

test("Admin lifecycle mutation uses PATCH with the current match token", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(input), init }); return Response.json({ ok: true }); }) as typeof fetch;
  const view = await mounted(true);
  const button = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "Hủy trận"); assert.ok(button);
  await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.deepEqual(calls, [{
    url: `/api/teams/pro7-fc/matches/${MATCH_ID}`,
    init: {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel", expectedUpdatedAt: "2026-10-01T00:00:00.000Z" }),
    },
  }]);
  assert.equal(globalThis.__matchesRefreshes, 1);
  await act(async () => view.root.unmount());
});

declare global { var __matchesRefreshes: number | undefined; }
