import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { OverviewResult } from "../lib/overview/model";
import type { TeamAccessContext } from "../lib/teams/context";

const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const USER_ID = "00000000-0000-4000-8000-000000000010";
const DEADLINE = "2026-10-18T12:30:00.000Z";
const ADMIN: TeamAccessContext = {
  team: { id: "team-1", name: "PRO7 FC", slug: "pro7-fc" },
  userId: USER_ID,
  membership: { roleId: "role-admin", roleSlug: "admin", roleName: "Admin" },
  permissions: ["team.read", "matches.read", "matches.manage", "matches.respond", "tactics.read", "news.read"],
};
const MEMBER: TeamAccessContext = {
  ...ADMIN,
  membership: { roleId: "role-member", roleSlug: "member", roleName: "Thành viên" },
  permissions: ["team.read", "matches.read", "matches.respond", "tactics.read", "news.read"],
};
const RESULT: OverviewResult = {
  ok: true,
  data: {
    nextMatch: {
      id: MATCH_ID, opponent: "Metro City", startsAt: "2026-10-19T12:30:00.000Z", venue: "Riverside", isHome: true,
      rsvpDeadline: DEADLINE, status: "scheduled", teamScore: null, opponentScore: null, updatedAt: "2026-10-01T00:00:00.000Z",
      attendance: { invited: 4, available: 1, unavailable: 0, pending: 3 }, ownAttendance: { status: "pending", updatedAt: "2026-10-02T00:00:00.000Z" },
    },
    countdown: { days: 9, hours: 12, minutes: 30 },
    attendance: { invited: 4, available: 1, unavailable: 0, pending: 3, confirmedPercent: 25 },
    statistics: { completedMatches: 0, wins: 0, draws: 0, losses: 0, winRate: null, recentForm: [], recentPoints: 0, topScorer: null },
    news: Array.from({ length: 4 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${(index + 201).toString(16).padStart(12, "0")}`,
      title: `Tin đội ${index + 1}`,
      body: `Nội dung ${index + 1}`,
      publishedAt: new Date(Date.UTC(2026, 9, 9 - index, 9)).toISOString(),
    })),
    calendar: [],
  },
};

let OverviewView: (props: { context: TeamAccessContext; result: OverviewResult; serverNow: string }) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => { render(node: React.ReactNode): void; unmount(): void };
let browserWindow: Window;
type ActiveHandle = { constructor: { name: string }; close?: () => void };
const activeHandles = () => (process as unknown as { _getActiveHandles(): ActiveHandle[] })._getActiveHandles();
const initialHandles = new Set(activeHandles());

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/teams/pro7-fc/overview" });
  for (const [key, value] of Object.entries({ window: browserWindow, document: browserWindow.document, navigator: browserWindow.navigator, HTMLElement: browserWindow.HTMLElement, Node: browserWindow.Node, Event: browserWindow.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({
    configFile: false,
    plugins: [{ name: "overview-mounted-navigation", enforce: "pre", resolveId(id) { return id === "next/navigation" ? resolve("tests/fixtures/overview-navigation.ts") : null; } }],
    build: { lib: { entry: resolve("tests/fixtures/overview-mounted-entry.ts"), formats: ["cjs"], fileName: "overview-mounted" }, write: false },
  });
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnvironment ?? "test";
  const bundles = (Array.isArray(result) ? result : [result]) as unknown as readonly { output: readonly { type: string; code?: string }[] }[];
  const code = bundles.flatMap((bundle) => bundle.output).find((output) => output.type === "chunk")?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ OverviewView, act, createElement, createRoot } = bundleModule.exports as never);
});

test.after(async () => {
  await browserWindow.happyDOM.abort();
  browserWindow.close();
  for (const handle of activeHandles()) if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") handle.close?.();
});

async function mounted(context = ADMIN, serverNow = "2026-10-10T00:00:00.000Z", result = RESULT) {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root"); assert.ok(container);
  const root = createRoot(container as unknown as Element); globalThis.__overviewRefreshes = 0;
  await act(async () => root.render(createElement(OverviewView, { context, result, serverNow })));
  return { container: container as unknown as HTMLElement, root };
}

test("Admin reminder sends only match identity, shows pending/success, and refreshes", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  let resolveResponse: ((response: Response) => void) | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Promise<Response>((resolvePromise) => { resolveResponse = resolvePromise; });
  }) as typeof fetch;
  const view = await mounted();
  const button = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Nhắc người chưa trả lời")); assert.ok(button);
  await act(async () => { button.click(); await Promise.resolve(); });
  assert.equal(button.disabled, true);
  assert.match(button.textContent ?? "", /Đang gửi/u);
  assert.deepEqual(calls, [{
    url: `/api/teams/pro7-fc/matches/${MATCH_ID}/remind`,
    init: { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
  }]);
  await act(async () => { resolveResponse?.(Response.json({ ok: true, reminded: 3 })); await new Promise((resolvePromise) => setTimeout(resolvePromise, 0)); });
  assert.match(view.container.textContent ?? "", /Đã gửi lời nhắc đến 3 cầu thủ/u);
  assert.equal(globalThis.__overviewRefreshes, 1);
  await act(async () => view.root.unmount());
});

test("Admin reminder shows bounded errors without refreshing", async () => {
  globalThis.fetch = (async () => Response.json({ ok: false, code: "lifecycle", message: "Danh sách chờ đã thay đổi. Vui lòng tải lại." }, { status: 409 })) as typeof fetch;
  const view = await mounted();
  const button = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Nhắc người chưa trả lời")); assert.ok(button);
  await act(async () => { button.click(); await new Promise((resolvePromise) => setTimeout(resolvePromise, 0)); });
  assert.match(view.container.textContent ?? "", /Danh sách chờ đã thay đổi/u);
  assert.equal(globalThis.__overviewRefreshes, 0);
  await act(async () => view.root.unmount());
});

test("Admin reminder is an honest no-op when nobody is pending", async () => {
  const noPending: OverviewResult = {
    ok: true,
    data: {
      ...RESULT.data,
      nextMatch: {
        ...RESULT.data.nextMatch!,
        attendance: { invited: 1, available: 1, unavailable: 0, pending: 0 },
      },
      attendance: { invited: 1, available: 1, unavailable: 0, pending: 0, confirmedPercent: 100 },
    },
  };
  const view = await mounted(ADMIN, "2026-10-10T00:00:00.000Z", noPending);
  assert.ok(![...view.container.querySelectorAll("button")].some((candidate) => candidate.textContent?.includes("Nhắc người chưa trả lời")));
  assert.match(view.container.textContent ?? "", /Không còn người chờ trả lời/u);
  await act(async () => view.root.unmount());
});

test("Member RSVP affordance closes live at the deadline without a refresh", async (context) => {
  const deadline = Date.parse(DEADLINE);
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: deadline - 2 });
  const view = await mounted(MEMBER, new Date(deadline - 2).toISOString());
  try {
    assert.ok([...view.container.querySelectorAll("a")].some((link) => link.textContent?.includes("Xác nhận tham gia")));
    await act(async () => { context.mock.timers.tick(3); });
    assert.ok(![...view.container.querySelectorAll("a")].some((link) => link.textContent?.includes("Xác nhận tham gia")));
    assert.match(view.container.textContent ?? "", /Đã hết hạn xác nhận/u);
    assert.equal(globalThis.__overviewRefreshes, 0);
  } finally {
    await act(async () => view.root.unmount());
  }
});

test("Member RSVP affordance requires a scheduled match", async () => {
  const completed: OverviewResult = {
    ok: true,
    data: {
      ...RESULT.data,
      nextMatch: {
        ...RESULT.data.nextMatch!,
        status: "completed",
        teamScore: 1,
        opponentScore: 0,
      },
    },
  };
  const view = await mounted(MEMBER, "2026-10-10T00:00:00.000Z", completed);
  assert.ok(![...view.container.querySelectorAll("a")].some((link) => link.textContent?.includes("Xác nhận tham gia")));
  await act(async () => view.root.unmount());
});

test("Xem tất cả reveals every bounded news item in place and can collapse", async () => {
  const view = await mounted();
  assert.doesNotMatch(view.container.textContent ?? "", /Tin đội 4/u);
  const expand = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Xem tất cả")); assert.ok(expand);
  await act(async () => expand.click());
  assert.match(view.container.textContent ?? "", /Tin đội 4/u);
  const collapse = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Thu gọn")); assert.ok(collapse);
  await act(async () => collapse.click());
  assert.doesNotMatch(view.container.textContent ?? "", /Tin đội 4/u);
  await act(async () => view.root.unmount());
});

declare global { var __overviewRefreshes: number | undefined; }
