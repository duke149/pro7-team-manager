import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { MatchDetail } from "../lib/matches/model";

const USER_ID = "00000000-0000-4000-8000-000000000010";
const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const UNCERTAIN_NOTE = "Có thể tham gia — chưa chắc chắn.";
const DETAIL: MatchDetail = { match: { id: MATCH_ID, opponent: "FC NAT", startsAt: "2026-09-06T02:00:00.000Z", venue: "Sân CK2", isHome: true, rsvpDeadline: "2026-09-05T12:00:00.000Z", status: "scheduled", teamScore: null, opponentScore: null, updatedAt: "2026-08-28T00:00:00.000Z", attendance: { invited: 1, available: 0, unavailable: 0, pending: 1 }, ownAttendance: { status: "pending", updatedAt: "2026-08-28T00:00:00.000Z" } }, attendance: [{ userId: USER_ID, status: "pending", note: null, respondedAt: null, updatedAt: "2026-08-28T00:00:00.000Z", displayName: "Nguyễn Hùng" }], events: [], playerStats: [], teamMetrics: null, inviteCandidates: [], analysisCandidates: [] };
let RsvpView: (props: Record<string, unknown>) => React.ReactNode; let act: (callback: () => void | Promise<void>) => Promise<void>; let createElement: typeof import("react").createElement; let createRoot: (container: Element) => { render(node: React.ReactNode): void; unmount(): void }; let browserWindow: Window & typeof globalThis;
type ActiveHandle = { constructor: { name: string }; close?: () => void };
const activeHandles = () => (process as unknown as { _getActiveHandles(): ActiveHandle[] })._getActiveHandles();
const initialHandles = new Set(activeHandles());

test.before(async () => {
  browserWindow = new Window({ url: `https://pro7.example/teams/nat-fc/matches/${MATCH_ID}/rsvp` }) as unknown as Window & typeof globalThis;
  for (const [key, value] of Object.entries({ window: browserWindow, document: browserWindow.document, navigator: browserWindow.navigator, HTMLElement: browserWindow.HTMLElement, Node: browserWindow.Node, Event: browserWindow.Event, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({ configFile: false, build: { lib: { entry: resolve("tests/fixtures/match-rsvp-mounted-entry.ts"), formats: ["cjs"], fileName: "match-rsvp-mounted" }, write: false } });
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnvironment ?? "test";
  const bundles = (Array.isArray(result) ? result : [result]) as unknown as readonly { output: readonly { type: string; isEntry?: boolean; code?: string }[] }[];
  const code = bundles.flatMap((entry) => entry.output).find((entry) => entry.type === "chunk" && entry.isEntry)?.code; assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> }; new Function("module", "exports", code)(bundleModule, bundleModule.exports); ({ RsvpView, act, createElement, createRoot } = bundleModule.exports as never);
});
test.after(async () => { await browserWindow.happyDOM.abort(); browserWindow.close(); for (const handle of activeHandles()) if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") handle.close?.(); });

async function mount(now = "2026-08-28T00:00:00.000Z") {
  document.body.innerHTML = '<div id="root"></div>'; const container = document.getElementById("root"); assert.ok(container); const root = createRoot(container);
  await act(async () => root.render(createElement(RsvpView, { slug: "nat-fc", teamName: "FC NÁT", detail: DETAIL, canRespond: true, now })));
  return { container, root };
}

test("three RSVP choices map exactly and never send a caller identity", async () => {
  for (const fixture of [{ label: "Có", status: "available", note: null }, { label: "Có thể", status: "available", note: UNCERTAIN_NOTE }, { label: "Không", status: "unavailable", note: null }]) {
    const calls: { url: string; body: unknown }[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json({ ok: true }); }) as typeof fetch;
    const view = await mount();
    const button = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent?.trim() === fixture.label); assert.ok(button);
    await act(async () => { button.click(); await new Promise((resolvePromise) => setTimeout(resolvePromise, 0)); });
    assert.deepEqual(calls, [{ url: `/api/teams/nat-fc/matches/${MATCH_ID}/attendance`, body: { action: "respond", status: fixture.status, note: fixture.note, expectedUpdatedAt: "2026-08-28T00:00:00.000Z" } }]);
    assert.doesNotMatch(JSON.stringify(calls), /userId|p_user_id/u);
    assert.equal(browserWindow.location.pathname, `/teams/nat-fc/matches/${MATCH_ID}`);
    browserWindow.location.replace(`/teams/nat-fc/matches/${MATCH_ID}/rsvp`);
    await act(async () => view.root.unmount());
  }
});

test("failed response stays on RSVP and a live deadline disables all choices", async (context) => {
  globalThis.fetch = (async () => Response.json({ message: "Phản hồi đã thay đổi." }, { status: 409 })) as typeof fetch;
  let view = await mount();
  await act(async () => { view.container.querySelector<HTMLButtonElement>('[data-rsvp-choice="available"]')?.click(); await new Promise((resolvePromise) => setTimeout(resolvePromise, 0)); });
  assert.match(view.container.textContent ?? "", /Phản hồi đã thay đổi/u);
  assert.match(browserWindow.location.pathname, /\/rsvp$/u);
  await act(async () => view.root.unmount());

  const deadline = Date.parse(DETAIL.match.rsvpDeadline); context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: deadline - 2 });
  view = await mount(new Date(deadline - 2).toISOString());
  try {
    assert.ok([...view.container.querySelectorAll<HTMLButtonElement>("[data-rsvp-choice]")].every((button) => !button.disabled));
    await act(async () => context.mock.timers.tick(3));
    assert.match(view.container.textContent ?? "", /Đã hết hạn xác nhận/u);
    assert.ok([...view.container.querySelectorAll<HTMLButtonElement>("[data-rsvp-choice]")].every((button) => button.disabled));
  } finally { await act(async () => view.root.unmount()); }
});
