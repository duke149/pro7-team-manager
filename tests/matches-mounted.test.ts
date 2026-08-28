import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { MatchDetail as MatchDetailModel, MatchListResult } from "../lib/matches/model";
import type { PermissionCode } from "../lib/teams/permissions";

const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const USER_ID = "00000000-0000-4000-8000-000000000010";
const DETAIL: MatchDetailModel = {
  match: { id: MATCH_ID, opponent: "Metro City", startsAt: "2026-10-19T12:30:00.000Z", venue: "Riverside", isHome: true, rsvpDeadline: "2026-10-18T12:30:00.000Z", status: "scheduled", teamScore: null, opponentScore: null, updatedAt: "2026-10-01T00:00:00.000Z", attendance: { invited: 1, available: 0, unavailable: 0, pending: 1 }, ownAttendance: { status: "pending", updatedAt: "2026-10-02T00:00:00.000Z" } },
  attendance: [{ userId: USER_ID, displayName: "Nguyễn An", status: "pending", note: null, respondedAt: null, updatedAt: "2026-10-02T00:00:00.000Z" }],
  events: [], playerStats: [], teamMetrics: null, inviteCandidates: [], analysisCandidates: [],
};

let MatchDetail: (props: { slug: string; teamName: string; userId: string; detail: MatchDetailModel; canManage: boolean; canRespond: boolean; now?: string }) => React.ReactNode;
let MatchesView: (props: { team: { id: string; name: string; slug: string }; userId: string; permissions: readonly PermissionCode[]; result: MatchListResult; now: string }) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => { render(node: React.ReactNode): void; unmount(): void };
let browserWindow: Window;
type ActiveHandle = { constructor: { name: string }; close?: () => void };
const activeHandles = () => (process as unknown as { _getActiveHandles(): ActiveHandle[] })._getActiveHandles();
const initialHandles = new Set(activeHandles());

test.before(async () => {
  browserWindow = new Window({ url: `https://pro7.example/teams/pro7-fc/matches/${MATCH_ID}` });
  for (const [key, value] of Object.entries({ window: browserWindow, document: browserWindow.document, navigator: browserWindow.navigator, HTMLElement: browserWindow.HTMLElement, Node: browserWindow.Node, Event: browserWindow.Event, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({ configFile: false, plugins: [{
    name: "matches-mounted-navigation",
    enforce: "pre",
    resolveId(id) {
      if (id === "next/navigation") return resolve("tests/fixtures/matches-navigation.ts");
      if (id.endsWith("authoritative-refresh")) return "\0matches-authoritative-refresh";
      return null;
    },
    load(id) {
      return id === "\0matches-authoritative-refresh"
        ? "export function reloadAuthoritativeRoute(){globalThis.__matchesReloads=(globalThis.__matchesReloads??0)+1}"
        : null;
    },
  }], build: { lib: { entry: resolve("tests/fixtures/matches-mounted-entry.ts"), formats: ["cjs"], fileName: "matches-mounted" }, write: false } });
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnvironment ?? "test";
  const bundles = (Array.isArray(result) ? result : [result]) as unknown as readonly { output: readonly { type: string; code?: string }[] }[];
  const code = bundles.flatMap((bundle) => bundle.output).find((output) => output.type === "chunk")?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ MatchDetail, MatchesView, act, createElement, createRoot } = bundleModule.exports as never);
});
test.after(async () => { await browserWindow.happyDOM.abort(); browserWindow.close(); for (const handle of activeHandles()) if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") handle.close?.(); });

async function mounted(canManage = false, now = "2026-10-10T00:00:00.000Z") {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root"); assert.ok(container);
  const root = createRoot(container as unknown as Element); globalThis.__matchesRefreshes = 0; globalThis.__matchesReloads = 0;
  await act(async () => root.render(createElement(MatchDetail, { slug: "pro7-fc", teamName: "PRO7 FC", userId: USER_ID, detail: DETAIL, canManage, canRespond: true, now })));
  return { container: container as unknown as HTMLElement, root };
}

async function mountedList(permissions: readonly PermissionCode[], now = "2026-10-10T00:00:00.000Z") {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root"); assert.ok(container);
  const root = createRoot(container as unknown as Element); globalThis.__matchesRefreshes = 0; globalThis.__matchesReloads = 0;
  await act(async () => root.render(createElement(MatchesView, { team: { id: "team-1", name: "PRO7 FC", slug: "pro7-fc" }, userId: USER_ID, permissions, result: { ok: true, matches: [DETAIL.match] }, now })));
  return { container: container as unknown as HTMLElement, root };
}

test("own RSVP sends same-origin JSON then hard-reloads authoritative server props", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(input), init }); return Response.json({ ok: true }); }) as typeof fetch;
  const view = await mounted();
  const button = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "Có"); assert.ok(button);
  await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.deepEqual(calls, [{ url: `/api/teams/pro7-fc/matches/${MATCH_ID}/attendance`, init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "respond", status: "available", note: null, expectedUpdatedAt: "2026-10-02T00:00:00.000Z" }) } }]);
  assert.equal(globalThis.__matchesRefreshes, 0);
  assert.equal(globalThis.__matchesReloads, 1);
  await act(async () => view.root.unmount());
});

test("list RSVP resets pending before hard-reloading authoritative server props", async () => {
  globalThis.fetch = (async () => Response.json({ ok: true })) as typeof fetch;
  const view = await mountedList(["matches.read", "matches.respond"]);
  const button = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "Có"); assert.ok(button);
  await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(button.disabled, false);
  assert.equal(globalThis.__matchesRefreshes, 0);
  assert.equal(globalThis.__matchesReloads, 1);
  await act(async () => view.root.unmount());
});

test("expired RSVP deadlines render an honest closed and disabled state in list and detail", async () => {
  const list = await mountedList(["matches.read", "matches.respond"], "2026-10-18T12:30:00.001Z");
  assert.match(list.container.textContent ?? "", /Đã hết hạn xác nhận/u);
  assert.ok([...list.container.querySelectorAll<HTMLButtonElement>(".rsvp-options button")].every((button) => button.disabled));
  await act(async () => list.root.unmount());

  const detail = await mounted(false, "2026-10-18T12:30:00.001Z");
  assert.match(detail.container.textContent ?? "", /Đã hết hạn xác nhận/u);
  assert.ok([...detail.container.querySelectorAll<HTMLButtonElement>(".rsvp-options button")].every((button) => button.disabled));
  await act(async () => detail.root.unmount());
});

test("mounted list closes RSVP controls exactly after the deadline without a refresh", async (context) => {
  const deadline = Date.parse(DETAIL.match.rsvpDeadline);
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: deadline - 2 });
  const view = await mountedList(["matches.read", "matches.respond"], new Date(deadline - 2).toISOString());
  try {
    assert.doesNotMatch(view.container.textContent ?? "", /Đã hết hạn xác nhận/u);
    assert.ok([...view.container.querySelectorAll<HTMLButtonElement>(".rsvp-options button")].every((button) => !button.disabled));
    await act(async () => { context.mock.timers.tick(3); });
    assert.match(view.container.textContent ?? "", /Đã hết hạn xác nhận/u);
    assert.ok([...view.container.querySelectorAll<HTMLButtonElement>(".rsvp-options button")].every((button) => button.disabled));
  } finally {
    await act(async () => view.root.unmount());
  }
});

test("mounted detail closes RSVP controls exactly after the deadline without a refresh", async (context) => {
  const deadline = Date.parse(DETAIL.match.rsvpDeadline);
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: deadline - 2 });
  const view = await mounted(false, new Date(deadline - 2).toISOString());
  try {
    assert.doesNotMatch(view.container.textContent ?? "", /Đã hết hạn xác nhận/u);
    assert.ok([...view.container.querySelectorAll<HTMLButtonElement>(".rsvp-options button")].every((button) => !button.disabled));
    await act(async () => { context.mock.timers.tick(3); });
    assert.match(view.container.textContent ?? "", /Đã hết hạn xác nhận/u);
    assert.ok([...view.container.querySelectorAll<HTMLButtonElement>(".rsvp-options button")].every((button) => button.disabled));
  } finally {
    await act(async () => view.root.unmount());
  }
});

test("create-match dialog focuses its first field, contains Tab focus, and closes on Escape", async () => {
  const view = await mountedList(["matches.read", "matches.manage"]);
  const trigger = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Xếp lịch trận đấu")); assert.ok(trigger);
  await act(async () => trigger.click());
  const dialog = view.container.querySelector<HTMLElement>('[role="dialog"]'); assert.ok(dialog);
  const opponent = dialog.querySelector<HTMLInputElement>('input[name="opponent"]'); assert.ok(opponent);
  assert.equal(document.activeElement, opponent);

  const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])')];
  const first = focusable[0]; const last = focusable.at(-1); assert.ok(first); assert.ok(last);
  last.focus();
  await act(async () => { dialog.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }) as unknown as Event); });
  assert.equal(document.activeElement, first);
  first.focus();
  await act(async () => { dialog.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }) as unknown as Event); });
  assert.equal(document.activeElement, last);
  await act(async () => { dialog.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event); });
  assert.equal(view.container.querySelector('[role="dialog"]'), null);
  await act(async () => view.root.unmount());
});

test("failed RSVP reports the server message and does not refresh stale UI", async () => {
  globalThis.fetch = (async () => Response.json({ ok: false, code: "stale", message: "Dữ liệu đã thay đổi. Vui lòng tải lại." }, { status: 409 })) as typeof fetch;
  const view = await mounted();
  const button = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "Không"); assert.ok(button);
  await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.match(view.container.textContent ?? "", /Dữ liệu đã thay đổi/u);
  assert.equal(globalThis.__matchesRefreshes, 0);
  assert.equal(globalThis.__matchesReloads, 0);
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
  assert.equal(globalThis.__matchesRefreshes, 0);
  assert.equal(globalThis.__matchesReloads, 1);
  await act(async () => view.root.unmount());
});

declare global {
  var __matchesRefreshes: number | undefined;
  var __matchesReloads: number | undefined;
}
