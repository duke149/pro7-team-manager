import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { TacticsDetail } from "../lib/tactics/model";

const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const USER_IDS = Array.from({ length: 9 }, (_, index) => `00000000-0000-4000-8000-${(index + 10).toString().padStart(12, "0")}`);
const DETAIL: TacticsDetail = {
  match: { id: MATCH_ID, opponent: "Metro City", startsAt: "2026-10-19T12:30:00.000Z", venue: "Riverside", isHome: true, rsvpDeadline: "2026-10-18T12:30:00.000Z", status: "scheduled", teamScore: null, opponentScore: null, updatedAt: "2026-10-01T00:00:00.000Z", attendance: { invited: 0, available: 0, unavailable: 0, pending: 0 }, ownAttendance: null },
  players: USER_IDS.map((userId, index) => ({ userId, displayName: `Cầu thủ ${index + 1}`, shirtNumber: index + 1, officialPosition: index === 0 ? "GK" : index < 3 ? "DEF" : index < 6 ? "MID" : "ATT" })),
  tactics: [{ id: "00000000-0000-4000-8000-000000000201", mode: "balanced", formation: "2-3-1", instructions: "Giữ cự ly đội hình.", version: 2, pressing: "high", defensiveLine: "medium", status: "draft", updatedAt: "2026-10-02T00:00:00.000Z", appliedAt: null, slots: USER_IDS.map((userId, index) => ({ userId, slotKind: index < 7 ? "starter" : "bench", slotKey: index < 7 ? `starter-${index + 1}` : `bench-${index - 6}`, roleLabel: index === 0 ? "GK" : index < 3 ? "DEF" : index < 6 ? "MID" : "ATT", shirtNumber: index + 1, x: index === 0 ? 50 : 15 + index * 10, y: index === 0 ? 90 : 75 - index * 8 })) }],
};

let TacticsBoard: (props: { slug: string; teamName: string; detail: TacticsDetail; canManage: boolean }) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => { render(node: React.ReactNode): void; unmount(): void };
let browserWindow: Window;
type ActiveHandle = { constructor: { name: string }; close?: () => void };
const activeHandles = () => (process as unknown as { _getActiveHandles(): ActiveHandle[] })._getActiveHandles();
const initialHandles = new Set(activeHandles());

test.before(async () => {
  browserWindow = new Window({ url: `https://pro7.example/teams/pro7-fc/tactics/${MATCH_ID}` });
  for (const [key, value] of Object.entries({ window: browserWindow, document: browserWindow.document, navigator: browserWindow.navigator, HTMLElement: browserWindow.HTMLElement, Node: browserWindow.Node, Event: browserWindow.Event, PointerEvent: browserWindow.PointerEvent, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({ configFile: false, plugins: [{ name: "tactics-mounted-navigation", enforce: "pre", resolveId(id) { return id === "next/navigation" ? resolve("tests/fixtures/tactics-navigation.ts") : null; } }], build: { lib: { entry: resolve("tests/fixtures/tactics-mounted-entry.ts"), formats: ["cjs"], fileName: "tactics-mounted" }, write: false } });
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnvironment ?? "test";
  const bundles = (Array.isArray(result) ? result : [result]) as unknown as readonly { output: readonly { type: string; code?: string }[] }[];
  const code = bundles.flatMap((bundle) => bundle.output).find((output) => output.type === "chunk")?.code; assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> }; new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ TacticsBoard, act, createElement, createRoot } = bundleModule.exports as never);
});
test.after(async () => { await browserWindow.happyDOM.abort(); browserWindow.close(); for (const handle of activeHandles()) if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") handle.close?.(); });

async function mounted(canManage = true, detail: TacticsDetail = DETAIL) {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root"); assert.ok(container);
  const root = createRoot(container as unknown as Element); globalThis.__tacticsRefreshes = 0;
  await act(async () => root.render(createElement(TacticsBoard, { slug: "pro7-fc", teamName: "PRO7 FC", detail, canManage })));
  return { container: container as unknown as HTMLElement, root };
}

test("Admin board mounts hosted toolbar, exactly seven draggable starters, bench, instructions, save, and apply", async () => {
  const view = await mounted();
  assert.match(view.container.textContent ?? "", /SƠ ĐỒ[\s\S]*Cân bằng[\s\S]*Tấn công[\s\S]*Phòng ngự[\s\S]*Nhiệm vụ trận đấu[\s\S]*Băng ghế/u);
  const starters = [...view.container.querySelectorAll<HTMLButtonElement>(".pitch-player")];
  assert.equal(starters.length, 7);
  assert.equal(starters.every((button) => button.getAttribute("draggable") === "true" && !button.disabled && Boolean(button.getAttribute("aria-label"))), true);
  assert.match(view.container.textContent ?? "", /Cầu thủ 8[\s\S]*Cầu thủ 9/u);
  assert.ok([...view.container.querySelectorAll("button")].some((button) => button.textContent?.includes("Lưu bản nháp")));
  assert.ok([...view.container.querySelectorAll("button")].some((button) => button.textContent?.includes("Áp dụng cho đội")));
  await act(async () => view.root.unmount());
});

test("arrow keys and pointer movement update local coordinates without persistence", async () => {
  const calls: unknown[] = [];
  globalThis.fetch = (async (...args: unknown[]) => { calls.push(args); return Response.json({ ok: true }); }) as typeof fetch;
  const view = await mounted();
  const player = view.container.querySelector<HTMLButtonElement>(".pitch-player:not(.keeper)"); assert.ok(player);
  const before = player.style.left;
  await act(async () => { player.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }) as unknown as Event); });
  assert.notEqual(player.style.left, before);
  assert.deepEqual(calls, []);

  const pitch = view.container.querySelector<HTMLElement>(".pitch"); assert.ok(pitch);
  Object.defineProperty(pitch, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} }) });
  await act(async () => {
    player.dispatchEvent(new browserWindow.PointerEvent("pointerdown", { bubbles: true, clientX: 20, clientY: 20 }) as unknown as Event);
    pitch.dispatchEvent(new browserWindow.PointerEvent("pointermove", { bubbles: true, clientX: 80, clientY: 25 }) as unknown as Event);
    pitch.dispatchEvent(new browserWindow.PointerEvent("pointerup", { bubbles: true }) as unknown as Event);
  });
  assert.equal(player.style.left, "80%");
  assert.equal(player.style.top, "25%");
  assert.deepEqual(calls, []);
  await act(async () => view.root.unmount());
});

test("save sends same-origin JSON with changed coordinates and refreshes authoritative route data", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(input), init }); return Response.json({ ok: true, tacticId: DETAIL.tactics[0].id }); }) as typeof fetch;
  const view = await mounted();
  const player = view.container.querySelector<HTMLButtonElement>(".pitch-player:not(.keeper)"); assert.ok(player);
  await act(async () => { player.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }) as unknown as Event); });
  const instructions = view.container.querySelector<HTMLTextAreaElement>("textarea"); assert.ok(instructions);
  const valueSetter = Object.getOwnPropertyDescriptor(browserWindow.HTMLTextAreaElement.prototype, "value")?.set; assert.ok(valueSetter);
  await act(async () => { valueSetter.call(instructions, "  Giữ khối hẹp.  "); instructions.dispatchEvent(new browserWindow.InputEvent("input", { bubbles: true }) as unknown as Event); });
  const save = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Lưu bản nháp")); assert.ok(save);
  await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `/api/teams/pro7-fc/tactics/${MATCH_ID}`);
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(calls[0].init?.headers, { "content-type": "application/json" });
  const sent = JSON.parse(String(calls[0].init?.body));
  assert.equal(sent.action, "save");
  assert.equal(sent.slots.filter((slot: { slotKind: string }) => slot.slotKind === "starter").length, 7);
  assert.equal(sent.slots.filter((slot: { slotKind: string; roleLabel: string }) => slot.slotKind === "starter" && slot.roleLabel === "GK").length, 1);
  assert.equal(sent.instructions, "Giữ khối hẹp.");
  assert.equal(globalThis.__tacticsRefreshes, 1);
  await act(async () => view.root.unmount());
});

test("apply sends only draft identity and stale token, while failed mutations stay mounted with an error", async () => {
  const calls: { body?: BodyInit | null }[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => { calls.push({ body: init?.body }); return Response.json({ ok: true }); }) as typeof fetch;
  const view = await mounted();
  const apply = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Áp dụng cho đội")); assert.ok(apply);
  await act(async () => { apply.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.deepEqual(JSON.parse(String(calls[0].body)), { action: "apply", tacticId: DETAIL.tactics[0].id, expectedUpdatedAt: DETAIL.tactics[0].updatedAt });
  assert.equal(globalThis.__tacticsRefreshes, 1);
  await act(async () => view.root.unmount());

  globalThis.fetch = (async () => Response.json({ ok: false, message: "Chiến thuật đã thay đổi." }, { status: 409 })) as typeof fetch;
  const failed = await mounted();
  const failedApply = [...failed.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Áp dụng cho đội")); assert.ok(failedApply);
  await act(async () => { failedApply.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.match(failed.container.textContent ?? "", /Chiến thuật đã thay đổi/u);
  assert.equal(globalThis.__tacticsRefreshes, 0);
  await act(async () => failed.root.unmount());
});

test("Member sees applied tactics as read-only with no draft mutation surface", async () => {
  const applied: TacticsDetail = { ...DETAIL, tactics: DETAIL.tactics.map((tactic) => ({ ...tactic, status: "applied", appliedAt: "2026-10-03T00:00:00.000Z" })) };
  const view = await mounted(false, applied);
  assert.match(view.container.textContent ?? "", /Chỉ đọc[\s\S]*Đã áp dụng/u);
  assert.equal([...view.container.querySelectorAll("button")].some((button) => /Lưu bản nháp|Áp dụng cho đội/u.test(button.textContent ?? "")), false);
  assert.equal([...view.container.querySelectorAll<HTMLButtonElement>(".pitch-player")].every((button) => button.disabled && !button.draggable), true);
  assert.equal(view.container.querySelector("textarea")?.hasAttribute("readonly"), true);
  const unavailableModes = [...view.container.querySelectorAll<HTMLButtonElement>(".mode-toggle button")].filter((button) => button.textContent !== "Cân bằng");
  assert.equal(unavailableModes.length, 2);
  assert.equal(unavailableModes.every((button) => button.disabled), true);
  await act(async () => view.root.unmount());
});

declare global { var __tacticsRefreshes: number | undefined; }
