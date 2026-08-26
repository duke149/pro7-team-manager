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
  tactics: [{ id: "00000000-0000-4000-8000-000000000201", mode: "attacking", formation: "2-3-1", instructions: "Giữ cự ly đội hình.", version: 2, pressing: "high", defensiveLine: "medium", status: "draft", updatedAt: "2026-10-02T00:00:00.000Z", appliedAt: null, slots: USER_IDS.map((userId, index) => ({ userId, slotKind: index < 7 ? "starter" : "bench", slotKey: index < 7 ? `starter-${index + 1}` : `bench-${index - 6}`, roleLabel: index === 0 ? "GK" : index < 3 ? "DEF" : index < 6 ? "MID" : "ATT", shirtNumber: index + 1, x: index === 0 ? 50 : 15 + index * 10, y: index === 0 ? 90 : 75 - index * 8 })) }],
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

test("Admin board mounts the hosted two-mode toolbar, seven accessible starters, bench, save, and apply", async () => {
  const view = await mounted();
  assert.match(view.container.textContent ?? "", /SƠ ĐỒ[\s\S]*Có bóng[\s\S]*Không bóng[\s\S]*Nhiệm vụ trận đấu[\s\S]*Băng ghế/u);
  assert.doesNotMatch(view.container.textContent ?? "", /Cân bằng|Tấn công|Phòng ngự/u);
  const modes = [...view.container.querySelectorAll<HTMLButtonElement>(".mode-toggle button")];
  assert.equal(modes.length, 2);
  assert.deepEqual(modes.map((button) => button.getAttribute("aria-pressed")), ["true", "false"]);
  const starters = [...view.container.querySelectorAll<HTMLButtonElement>(".pitch-player")];
  assert.equal(starters.length, 7);
  assert.equal(starters.every((button) => !button.hasAttribute("draggable") && !button.disabled && Boolean(button.getAttribute("aria-label")) && button.hasAttribute("aria-pressed")), true);
  assert.match(view.container.textContent ?? "", /Cầu thủ 8[\s\S]*Cầu thủ 9/u);
  assert.equal(view.container.querySelectorAll<HTMLButtonElement>(".bench-player").length, 2);
  assert.ok([...view.container.querySelectorAll("button")].some((button) => button.textContent?.includes("Lưu bản nháp")));
  assert.ok([...view.container.querySelectorAll("button")].some((button) => button.textContent?.includes("Áp dụng cho đội")));
  await act(async () => view.root.unmount());
});

test("arrow keys and captured pointer movement update coordinates and clean up after release", async () => {
  const calls: unknown[] = [];
  globalThis.fetch = (async (...args: unknown[]) => { calls.push(args); return Response.json({ ok: true }); }) as typeof fetch;
  const view = await mounted();
  const player = view.container.querySelector<HTMLButtonElement>(".pitch-player:not(.keeper)"); assert.ok(player);
  const before = player.style.left;
  await act(async () => { player.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }) as unknown as Event); });
  assert.notEqual(player.style.left, before);
  assert.deepEqual(calls, []);

  const pitch = view.container.querySelector<HTMLElement>(".pitch"); assert.ok(pitch);
  let captures = 0; let releases = 0;
  Object.defineProperty(player, "setPointerCapture", { configurable: true, value: () => { captures += 1; } });
  Object.defineProperty(player, "releasePointerCapture", { configurable: true, value: () => { releases += 1; } });
  Object.defineProperty(pitch, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} }) });
  await act(async () => {
    player.dispatchEvent(new browserWindow.PointerEvent("pointerdown", { bubbles: true, pointerId: 7, clientX: 20, clientY: 20 }) as unknown as Event);
    pitch.dispatchEvent(new browserWindow.PointerEvent("pointermove", { bubbles: true, pointerId: 7, clientX: 80, clientY: 25 }) as unknown as Event);
    pitch.dispatchEvent(new browserWindow.PointerEvent("pointerup", { bubbles: true, pointerId: 7 }) as unknown as Event);
  });
  assert.equal(player.style.left, "80%");
  assert.equal(player.style.top, "25%");
  assert.equal(captures, 1); assert.equal(releases, 1);
  await act(async () => { pitch.dispatchEvent(new browserWindow.PointerEvent("pointermove", { bubbles: true, pointerId: 7, clientX: 10, clientY: 10 }) as unknown as Event); });
  assert.equal(player.style.left, "80%");
  assert.equal(player.style.top, "25%");
  await act(async () => {
    player.dispatchEvent(new browserWindow.PointerEvent("pointerdown", { bubbles: true, pointerId: 8, clientX: 80, clientY: 25 }) as unknown as Event);
    player.dispatchEvent(new browserWindow.PointerEvent("lostpointercapture", { bubbles: true, pointerId: 8 }) as unknown as Event);
    pitch.dispatchEvent(new browserWindow.PointerEvent("pointermove", { bubbles: true, pointerId: 8, clientX: 10, clientY: 10 }) as unknown as Event);
  });
  assert.equal(player.style.left, "80%");
  assert.equal(player.style.top, "25%");
  assert.deepEqual(calls, []);
  await act(async () => view.root.unmount());
});

test("formation changes apply the literal seven-slot role and coordinate template while retaining the goalkeeper", async () => {
  const view = await mounted();
  const select = view.container.querySelector<HTMLSelectElement>('select[aria-label="Sơ đồ"]'); assert.ok(select);
  const setter = Object.getOwnPropertyDescriptor(browserWindow.HTMLSelectElement.prototype, "value")?.set; assert.ok(setter);
  await act(async () => { setter.call(select, "3-2-1"); select.dispatchEvent(new browserWindow.Event("change", { bubbles: true })); });
  const starters = [...view.container.querySelectorAll<HTMLButtonElement>(".pitch-player")];
  assert.deepEqual(starters.map((button) => [button.textContent?.match(/• (GK|DEF|MID|ATT)/u)?.[1], button.style.left, button.style.top]), [
    ["GK", "50%", "90%"], ["DEF", "22%", "69%"], ["DEF", "50%", "73%"], ["DEF", "78%", "69%"],
    ["MID", "35%", "43%"], ["MID", "65%", "43%"], ["ATT", "50%", "18%"],
  ]);
  assert.match(starters[0].textContent ?? "", /Cầu thủ 1/u);
  assert.equal(select.querySelector('option[value="3-2-1"]')?.getAttribute("aria-selected"), "true");
  await act(async () => view.root.unmount());
});

test("keyboard selection swaps a starter with the bench and persists exactly seven unique starters", async () => {
  const calls: { body?: BodyInit | null }[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => { calls.push({ body: init?.body }); return Response.json({ ok: true, tactic: { id: DETAIL.tactics[0].id, version: 3, updatedAt: "2026-10-03T00:00:00.000Z" } }); }) as typeof fetch;
  const view = await mounted();
  const starter = view.container.querySelector<HTMLButtonElement>('.pitch-player:not(.keeper)');
  const substitute = view.container.querySelector<HTMLButtonElement>('.bench-player');
  assert.ok(starter); assert.ok(substitute);
  const starterName = starter.textContent; const benchName = substitute.textContent;
  await act(async () => { starter.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  await act(async () => { substitute.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  assert.equal([...view.container.querySelectorAll(".pitch-player")].some((button) => button.textContent?.includes("Cầu thủ 8")), true);
  assert.equal([...view.container.querySelectorAll(".bench-player")].some((button) => button.textContent?.includes("Cầu thủ 2")), true);
  assert.notEqual(benchName, starterName);
  const save = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Lưu bản nháp")); assert.ok(save);
  await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  const payload = JSON.parse(String(calls[0].body));
  const starters = payload.slots.filter((slot: { slotKind: string }) => slot.slotKind === "starter");
  assert.equal(starters.length, 7); assert.equal(new Set(payload.slots.map((slot: { userId: string }) => slot.userId)).size, payload.slots.length);
  assert.equal(starters.some((slot: { userId: string }) => slot.userId === USER_IDS[7]), true);
  await act(async () => view.root.unmount());
});

test("pointer drop swaps bench to starter and starter back to bench", async () => {
  const view = await mounted();
  let dropTarget: Element | null = null;
  Object.defineProperty(browserWindow.document, "elementFromPoint", { configurable: true, value: () => dropTarget });
  let starter = view.container.querySelector<HTMLButtonElement>('.pitch-player:not(.keeper)');
  let bench = view.container.querySelector<HTMLButtonElement>('.bench-player');
  assert.ok(starter); assert.ok(bench);
  dropTarget = starter;
  await act(async () => {
    bench.dispatchEvent(new browserWindow.PointerEvent("pointerdown", { bubbles: true, pointerId: 11, clientX: 5, clientY: 5 }));
    bench.dispatchEvent(new browserWindow.PointerEvent("pointerup", { bubbles: true, pointerId: 11, clientX: 20, clientY: 20 }));
  });
  assert.equal([...view.container.querySelectorAll(".pitch-player")].some((button) => button.textContent?.includes("Cầu thủ 8")), true);
  starter = [...view.container.querySelectorAll<HTMLButtonElement>('.pitch-player')].find((button) => button.textContent?.includes("Cầu thủ 8")) ?? null;
  bench = [...view.container.querySelectorAll<HTMLButtonElement>('.bench-player')].find((button) => button.textContent?.includes("Cầu thủ 2")) ?? null;
  assert.ok(starter); assert.ok(bench); dropTarget = bench;
  await act(async () => {
    starter.dispatchEvent(new browserWindow.PointerEvent("pointerdown", { bubbles: true, pointerId: 12, clientX: 20, clientY: 20 }));
    starter.dispatchEvent(new browserWindow.PointerEvent("pointerup", { bubbles: true, pointerId: 12, clientX: 5, clientY: 5 }));
  });
  assert.equal([...view.container.querySelectorAll(".pitch-player")].some((button) => button.textContent?.includes("Cầu thủ 2")), true);
  assert.equal([...view.container.querySelectorAll(".bench-player")].some((button) => button.textContent?.includes("Cầu thủ 8")), true);
  await act(async () => view.root.unmount());
});

test("the native click after coordinate drag or bench drop is consumed exactly once", async () => {
  const view = await mounted();
  const pitch = view.container.querySelector<HTMLElement>(".pitch");
  const player = view.container.querySelector<HTMLButtonElement>('.pitch-player:not(.keeper)');
  assert.ok(pitch); assert.ok(player);
  Object.defineProperty(pitch, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} }) });
  Object.defineProperty(browserWindow.document, "elementFromPoint", { configurable: true, value: () => player });
  await act(async () => {
    player.dispatchEvent(new browserWindow.PointerEvent("pointerdown", { bubbles: true, pointerId: 21, clientX: 25, clientY: 67 }));
    pitch.dispatchEvent(new browserWindow.PointerEvent("pointermove", { bubbles: true, pointerId: 21, clientX: 40, clientY: 55 }));
    pitch.dispatchEvent(new browserWindow.PointerEvent("pointerup", { bubbles: true, pointerId: 21, clientX: 40, clientY: 55 }));
    player.click();
  });
  assert.equal(player.getAttribute("aria-pressed"), "false");
  await act(async () => { player.click(); });
  assert.equal(player.getAttribute("aria-pressed"), "true");
  await act(async () => { player.click(); });

  let bench = view.container.querySelector<HTMLButtonElement>(".bench-player"); assert.ok(bench);
  const starter = view.container.querySelector<HTMLButtonElement>('.pitch-player:not(.keeper)'); assert.ok(starter);
  Object.defineProperty(browserWindow.document, "elementFromPoint", { configurable: true, value: () => starter });
  await act(async () => {
    bench.dispatchEvent(new browserWindow.PointerEvent("pointerdown", { bubbles: true, pointerId: 22, clientX: 5, clientY: 5 }));
    bench.dispatchEvent(new browserWindow.PointerEvent("pointerup", { bubbles: true, pointerId: 22, clientX: 25, clientY: 67 }));
    bench.click();
  });
  bench = view.container.querySelector<HTMLButtonElement>(`[data-slot-key="${bench.dataset.slotKey}"]`); assert.ok(bench);
  assert.equal(bench.getAttribute("aria-pressed"), "false");
  await act(async () => { bench.click(); });
  assert.equal(bench.getAttribute("aria-pressed"), "true");
  await act(async () => view.root.unmount());
});

test("save sends same-origin JSON with changed coordinates and refreshes authoritative route data", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(input), init }); return Response.json({ ok: true, tactic: { id: DETAIL.tactics[0].id, version: 3, updatedAt: "2026-10-03T00:00:00.000Z" } }); }) as typeof fetch;
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

test("a newly saved draft reconciles before apply and the post-apply fork adopts its own create token", async () => {
  const calls: { body?: BodyInit | null }[] = [];
  const createdId = "00000000-0000-4000-8000-000000000301";
  const forkId = "00000000-0000-4000-8000-000000000302";
  let saveCount = 0;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push({ body: init?.body });
    const body = JSON.parse(String(init?.body));
    if (body.action === "save") {
      saveCount += 1;
      return Response.json({ ok: true, tactic: { id: saveCount === 1 ? createdId : forkId, version: saveCount, updatedAt: `2026-10-0${saveCount + 2}T00:00:00.000Z` } });
    }
    return Response.json({ ok: true });
  }) as typeof fetch;
  const view = await mounted(true, { ...DETAIL, tactics: [] });
  const find = (text: string) => [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(text));
  await act(async () => { find("Lưu bản nháp")?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(find("Áp dụng cho đội")?.disabled, false);
  await act(async () => { find("Áp dụng cho đội")?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  const player = view.container.querySelector<HTMLButtonElement>(".pitch-player:not(.keeper)"); assert.ok(player);
  await act(async () => { player.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); });
  await act(async () => { find("Lưu bản nháp")?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  await act(async () => { find("Áp dụng cho đội")?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.deepEqual(calls.map((call) => JSON.parse(String(call.body))).map((body) => body.action), ["save", "apply", "save", "apply"]);
  assert.equal(JSON.parse(String(calls[0].body)).mode, "attacking");
  assert.equal(JSON.parse(String(calls[0].body)).version, 1);
  assert.deepEqual(JSON.parse(String(calls[1].body)), { action: "apply", tacticId: createdId, expectedUpdatedAt: "2026-10-03T00:00:00.000Z" });
  assert.equal(JSON.parse(String(calls[2].body)).version, 2);
  assert.equal(JSON.parse(String(calls[2].body)).tacticId, null);
  assert.equal(JSON.parse(String(calls[2].body)).expectedUpdatedAt, null);
  assert.deepEqual(JSON.parse(String(calls[3].body)), { action: "apply", tacticId: forkId, expectedUpdatedAt: "2026-10-04T00:00:00.000Z" });
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

test("apply forks an unsaved editable draft so duplicate apply stays disabled and the next save creates", async () => {
  const calls: { body?: BodyInit | null }[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push({ body: init?.body });
    const body = JSON.parse(String(init?.body));
    return body.action === "save"
      ? Response.json({ ok: true, tactic: { id: "00000000-0000-4000-8000-000000000401", version: 3, updatedAt: "2026-10-04T00:00:00.000Z" } })
      : Response.json({ ok: true });
  }) as typeof fetch;
  const view = await mounted();
  const find = (text: string) => [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(text));
  await act(async () => { find("Áp dụng cho đội")?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(find("Áp dụng cho đội")?.disabled, true);
  const player = view.container.querySelector<HTMLButtonElement>(".pitch-player:not(.keeper)"); assert.ok(player);
  await act(async () => { player.dispatchEvent(new browserWindow.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); });
  await act(async () => { find("Lưu bản nháp")?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.deepEqual(calls.map((call) => JSON.parse(String(call.body))).map((body) => body.action), ["apply", "save"]);
  const saved = JSON.parse(String(calls[1].body));
  assert.equal(saved.tacticId, null);
  assert.equal(saved.version, 3);
  assert.equal(saved.expectedUpdatedAt, null);
  assert.equal(saved.slots.find((slot: { userId: string }) => slot.userId === USER_IDS[1]).x, 27);
  await act(async () => view.root.unmount());
});

test("an Admin reload with only applied version N seeds proposed version N plus one", async () => {
  const calls: { body?: BodyInit | null }[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => { calls.push({ body: init?.body }); return Response.json({ ok: true, tactic: { id: "00000000-0000-4000-8000-000000000402", version: 3, updatedAt: "2026-10-04T00:00:00.000Z" } }); }) as typeof fetch;
  const applied: TacticsDetail = { ...DETAIL, tactics: DETAIL.tactics.map((tactic) => ({ ...tactic, status: "applied", appliedAt: "2026-10-03T00:00:00.000Z" })) };
  const view = await mounted(true, applied);
  const save = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Lưu bản nháp")); assert.ok(save);
  await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  const payload = JSON.parse(String(calls[0].body));
  assert.deepEqual({ tacticId: payload.tacticId, version: payload.version, expectedUpdatedAt: payload.expectedUpdatedAt }, { tacticId: null, version: 3, expectedUpdatedAt: null });
  await act(async () => view.root.unmount());
});

test("an applied maximum version fails closed instead of allocating an overflowing draft", async () => {
  const overflow: TacticsDetail = { ...DETAIL, tactics: DETAIL.tactics.map((tactic) => ({ ...tactic, version: 32767, status: "applied", appliedAt: "2026-10-03T00:00:00.000Z" })) };
  const view = await mounted(true, overflow);
  assert.match(view.container.textContent ?? "", /Không thể tạo phiên bản chiến thuật mới/u);
  assert.equal([...view.container.querySelectorAll<HTMLButtonElement>("button")].some((button) => /Lưu bản nháp|Áp dụng cho đội/u.test(button.textContent ?? "")), false);
  await act(async () => view.root.unmount());
});

test("Member sees applied tactics as read-only with no draft mutation surface", async () => {
  const applied: TacticsDetail = { ...DETAIL, tactics: DETAIL.tactics.map((tactic) => ({ ...tactic, status: "applied", appliedAt: "2026-10-03T00:00:00.000Z" })) };
  const view = await mounted(false, applied);
  assert.match(view.container.textContent ?? "", /Chỉ đọc[\s\S]*Đã áp dụng/u);
  assert.equal([...view.container.querySelectorAll("button")].some((button) => /Lưu bản nháp|Áp dụng cho đội/u.test(button.textContent ?? "")), false);
  assert.equal([...view.container.querySelectorAll<HTMLButtonElement>(".pitch-player")].every((button) => button.disabled && !button.draggable), true);
  assert.equal(view.container.querySelector("textarea")?.hasAttribute("readonly"), true);
  const unavailableModes = [...view.container.querySelectorAll<HTMLButtonElement>(".mode-toggle button")].filter((button) => button.textContent !== "Có bóng");
  assert.equal(unavailableModes.length, 1);
  assert.equal(unavailableModes.every((button) => button.disabled), true);
  assert.deepEqual([...view.container.querySelectorAll<HTMLButtonElement>(".segmented button")].map((button) => button.getAttribute("aria-pressed")), ["false", "true", "false"]);
  await act(async () => view.root.unmount());
});

test("Member can read a legacy applied record through Có bóng without exposing legacy or draft controls", async () => {
  const legacy: TacticsDetail = { ...DETAIL, tactics: DETAIL.tactics.map((tactic) => ({ ...tactic, mode: "balanced", status: "applied", appliedAt: "2026-10-03T00:00:00.000Z" })) };
  const view = await mounted(false, legacy);
  assert.match(view.container.textContent ?? "", /Có bóng[\s\S]*Chế độ dữ liệu cũ/u);
  assert.doesNotMatch(view.container.textContent ?? "", /Cân bằng|Tấn công|Phòng ngự|Lưu bản nháp/u);
  assert.equal(view.container.querySelectorAll(".pitch-player").length, 7);
  await act(async () => view.root.unmount());
});

declare global { var __tacticsRefreshes: number | undefined; }
