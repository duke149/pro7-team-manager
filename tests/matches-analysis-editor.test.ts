import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

import type { MatchAnalysisCandidate, MatchEvent, MatchPlayerStat, MatchTeamMetrics } from "../lib/matches/model";

const MATCH_ID = "00000000-0000-4000-8000-000000000101";
const PLAYER_A = "00000000-0000-4000-8000-000000000010";
const PLAYER_B = "00000000-0000-4000-8000-000000000011";
const UPDATED_AT = "2026-10-01T00:00:00.000Z";
const NEXT_UPDATED_AT = "2026-10-01T00:00:00.000001Z";
const EVENTS: readonly MatchEvent[] = [
  { id: "00000000-0000-4000-8000-000000000201", minute: 12, sequenceNo: 1, eventType: "goal", teamSide: "team", playerUserId: PLAYER_A, playerDisplayName: "Nguyễn An", secondaryUserId: PLAYER_B, secondaryDisplayName: "Bình", note: "Mở tỉ số" },
];
const STATS: readonly MatchPlayerStat[] = [
  { userId: PLAYER_A, displayName: "Nguyễn An", minutesPlayed: 90, goals: 1, assists: 0, rating: 8.5, isMvp: true },
  { userId: PLAYER_B, displayName: "Bình", minutesPlayed: 75, goals: 0, assists: 1, rating: 7.5, isMvp: false },
];
const METRICS: MatchTeamMetrics = { possession: { team: 55, opponent: 45 }, shots: { team: 8, opponent: 4 }, shotsOnTarget: { team: 4, opponent: 2 } };
const CANDIDATES: readonly MatchAnalysisCandidate[] = [
  { userId: PLAYER_B, displayName: "Bình" },
  { userId: PLAYER_A, displayName: "Nguyễn An" },
];

type EditorProps = {
  slug: string;
  matchId: string;
  expectedUpdatedAt: string;
  events: readonly MatchEvent[];
  playerStats: readonly MatchPlayerStat[];
  teamMetrics: MatchTeamMetrics | null;
  candidates: readonly MatchAnalysisCandidate[];
};
let MatchAnalysisEditor: (props: EditorProps) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => { render(node: React.ReactNode): void; unmount(): void };
let browserWindow: Window;
type ActiveHandle = { constructor: { name: string }; close?: () => void };
const activeHandles = () => (process as unknown as { _getActiveHandles(): ActiveHandle[] })._getActiveHandles();
const initialHandles = new Set(activeHandles());

test.before(async () => {
  browserWindow = new Window({ url: `https://pro7.example/teams/pro7-fc/matches/${MATCH_ID}` });
  for (const [key, value] of Object.entries({ window: browserWindow, document: browserWindow.document, navigator: browserWindow.navigator, HTMLElement: browserWindow.HTMLElement, Node: browserWindow.Node, Event: browserWindow.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({ configFile: false, plugins: [{
    name: "analysis-editor-mounted",
    enforce: "pre",
    resolveId(id) { return id.endsWith("authoritative-refresh") ? "\0analysis-authoritative-refresh" : null; },
    load(id) { return id === "\0analysis-authoritative-refresh" ? "export function reloadAuthoritativeRoute(){globalThis.__analysisReloads=(globalThis.__analysisReloads??0)+1}" : null; },
  }], build: { lib: { entry: resolve("tests/fixtures/matches-mounted-entry.ts"), formats: ["cjs"], fileName: "analysis-editor-mounted" }, write: false } });
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnvironment ?? "test";
  const bundles = (Array.isArray(result) ? result : [result]) as unknown as readonly { output: readonly { type: string; code?: string }[] }[];
  const code = bundles.flatMap((bundle) => bundle.output).find((output) => output.type === "chunk")?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ MatchAnalysisEditor, act, createElement, createRoot } = bundleModule.exports as never);
});
test.after(async () => { await browserWindow.happyDOM.abort(); browserWindow.close(); for (const handle of activeHandles()) if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") handle.close?.(); });

async function mounted(overrides: Partial<EditorProps> = {}) {
  browserWindow.document.body.innerHTML = '<div id="root"></div>';
  const container = browserWindow.document.getElementById("root"); assert.ok(container);
  const root = createRoot(container as unknown as Element);
  globalThis.__analysisReloads = 0;
  await act(async () => root.render(createElement(MatchAnalysisEditor, { slug: "pro7-fc", matchId: MATCH_ID, expectedUpdatedAt: UPDATED_AT, events: EVENTS, playerStats: STATS, teamMetrics: METRICS, candidates: CANDIDATES, ...overrides })));
  return { container: container as unknown as HTMLElement, root };
}

function change(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set?.call(element, value);
  element.dispatchEvent(new browserWindow.Event(element instanceof browserWindow.HTMLInputElement ? "input" : "change", { bubbles: true }) as unknown as Event);
  element.dispatchEvent(new browserWindow.Event("change", { bubbles: true }) as unknown as Event);
}

test("editor saves one complete snapshot, adopts the returned token, and refreshes authoritative props", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Response.json({ ok: true, updatedAt: NEXT_UPDATED_AT });
  }) as typeof fetch;
  const view = await mounted();
  const note = view.container.querySelector<HTMLInputElement>('[data-analysis-event] input[maxlength="500"]'); assert.ok(note);
  await act(async () => change(note, "Mở tỉ số "));
  const save = view.container.querySelector<HTMLButtonElement>('[data-analysis-action="save"]'); assert.ok(save);
  await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, `/api/teams/pro7-fc/matches/${MATCH_ID}/analysis`);
  assert.equal(calls[0]?.init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    events: [{ minute: 12, sequenceNo: 1, eventType: "goal", teamSide: "team", playerUserId: PLAYER_A, secondaryUserId: PLAYER_B, note: "Mở tỉ số" }],
    playerStats: [
      { userId: PLAYER_A, minutesPlayed: 90, goals: 1, assists: 0, rating: 8.5, isMvp: true },
      { userId: PLAYER_B, minutesPlayed: 75, goals: 0, assists: 1, rating: 7.5, isMvp: false },
    ],
    teamMetrics: { possession: { team: 55, opponent: 45 }, shots: { team: 8, opponent: 4 }, shotsOnTarget: { team: 4, opponent: 2 } },
    expectedUpdatedAt: UPDATED_AT,
  });
  assert.equal(globalThis.__analysisReloads, 1);
  assert.match(view.container.textContent ?? "", /Đã lưu phân tích trận đấu/u);

  await act(async () => change(note, "Mở tỉ số đẹp"));
  await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(JSON.parse(String(calls[1]?.init?.body)).expectedUpdatedAt, NEXT_UPDATED_AT);
  await act(async () => view.root.unmount());
});

test("editor only enables reset and save while the snapshot is dirty", async () => {
  globalThis.fetch = (async () => Response.json({ ok: true, updatedAt: NEXT_UPDATED_AT })) as typeof fetch;
  const view = await mounted();
  const save = view.container.querySelector<HTMLButtonElement>('[data-analysis-action="save"]'); assert.ok(save);
  const reset = view.container.querySelector<HTMLButtonElement>('[data-analysis-action="reset"]'); assert.ok(reset);
  assert.equal(save.disabled, true);
  assert.equal(reset.disabled, true);

  const shots = view.container.querySelector<HTMLInputElement>('input[name="shots.team"]'); assert.ok(shots);
  await act(async () => change(shots, "9"));
  assert.equal(save.disabled, false);
  assert.equal(reset.disabled, false);

  await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(save.disabled, true);
  assert.equal(reset.disabled, true);
  await act(async () => view.root.unmount());
});

test("stale save preserves the draft and reset restores authoritative values", async () => {
  globalThis.fetch = (async () => Response.json({ ok: false, code: "stale", message: "Dữ liệu đã thay đổi. Bản nháp vẫn được giữ lại." }, { status: 409 })) as typeof fetch;
  const view = await mounted();
  const shots = view.container.querySelector<HTMLInputElement>('input[name="shots.team"]'); assert.ok(shots);
  await act(async () => change(shots, "9"));
  const save = view.container.querySelector<HTMLButtonElement>('[data-analysis-action="save"]'); assert.ok(save);
  await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(shots.value, "9");
  assert.match(view.container.textContent ?? "", /Bản nháp vẫn được giữ lại/u);
  assert.equal(globalThis.__analysisReloads, 0);
  const reset = view.container.querySelector<HTMLButtonElement>('[data-analysis-action="reset"]'); assert.ok(reset);
  await act(async () => reset.click());
  assert.equal(view.container.querySelector<HTMLInputElement>('input[name="shots.team"]')?.value, "8");
  await act(async () => view.root.unmount());
});

test("editor locks every mutable control while the authoritative save is pending", async () => {
  let resolveSave: ((response: Response) => void) | undefined;
  globalThis.fetch = (() => new Promise<Response>((resolve) => { resolveSave = resolve; })) as typeof fetch;
  const view = await mounted();
  const shots = view.container.querySelector<HTMLInputElement>('input[name="shots.team"]'); assert.ok(shots);
  await act(async () => change(shots, "9"));
  const save = view.container.querySelector<HTMLButtonElement>('[data-analysis-action="save"]'); assert.ok(save);

  await act(async () => { save.click(); await Promise.resolve(); });
  assert.equal(view.container.querySelector("section.match-analysis-editor")?.getAttribute("aria-busy"), "true");
  const mutableControls = [...view.container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")];
  assert.ok(mutableControls.length > 0);
  assert.equal(mutableControls.every((control) => control.disabled), true);

  await act(async () => {
    resolveSave?.(Response.json({ ok: true, updatedAt: NEXT_UPDATED_AT }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(view.container.querySelector("section.match-analysis-editor")?.getAttribute("aria-busy"), "false");
  assert.equal(view.container.querySelector<HTMLInputElement>('input[name="shots.team"]')?.disabled, false);
  await act(async () => view.root.unmount());
});

test("editor adds, reorders, and removes events while keeping MVP exclusive", async () => {
  const view = await mounted();
  const addEvent = view.container.querySelector<HTMLButtonElement>('[data-analysis-action="add-event"]'); assert.ok(addEvent);
  await act(async () => addEvent.click());
  assert.equal(view.container.querySelectorAll("[data-analysis-event]").length, 2);
  const moveUp = view.container.querySelector<HTMLButtonElement>('[aria-label="Đưa sự kiện 2 lên"]'); assert.ok(moveUp);
  await act(async () => moveUp.click());
  assert.equal(view.container.querySelector<HTMLInputElement>("[data-analysis-event] input[type=number]")?.value, "0");
  const removeButtons = view.container.querySelectorAll<HTMLButtonElement>('[data-analysis-action="remove-event"]');
  await act(async () => removeButtons[0]?.click());
  assert.equal(view.container.querySelectorAll("[data-analysis-event]").length, 1);

  const mvpInputs = view.container.querySelectorAll<HTMLInputElement>('input[name="analysis-mvp"]');
  assert.equal(mvpInputs.length, 2);
  assert.equal(mvpInputs[0]?.checked, true);
  await act(async () => mvpInputs[1]?.click());
  assert.equal(mvpInputs[0]?.checked, false);
  assert.equal(mvpInputs[1]?.checked, true);
  await act(async () => mvpInputs[1]?.click());
  assert.equal(mvpInputs[1]?.checked, false);
  await act(async () => view.root.unmount());
});

test("editor clears every team metric as an explicit delete operation", async () => {
  let payload: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input, init) => {
    payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ ok: true, updatedAt: NEXT_UPDATED_AT });
  }) as typeof fetch;
  const view = await mounted();
  const clear = view.container.querySelector<HTMLButtonElement>('[data-analysis-action="clear-metrics"]'); assert.ok(clear);
  await act(async () => clear.click());
  assert.ok([...view.container.querySelectorAll<HTMLInputElement>('.analysis-metric-grid input')].every((input) => input.value === ""));
  const save = view.container.querySelector<HTMLButtonElement>('[data-analysis-action="save"]'); assert.ok(save);
  assert.equal(save.disabled, false);
  await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.deepEqual(payload?.teamMetrics, {});
  await act(async () => view.root.unmount());
});

test("editor binds validation errors and never sends an incomplete metric pair", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return Response.json({ ok: true, updatedAt: NEXT_UPDATED_AT }); }) as typeof fetch;
  const view = await mounted();
  const opponent = view.container.querySelector<HTMLInputElement>('input[name="shots.opponent"]'); assert.ok(opponent);
  await act(async () => change(opponent, ""));
  const save = view.container.querySelector<HTMLButtonElement>('[data-analysis-action="save"]'); assert.ok(save);
  await act(async () => save.click());
  assert.equal(calls, 0);
  assert.match(view.container.textContent ?? "", /Nhập đủ cả hai chỉ số/u);
  assert.equal(opponent.getAttribute("aria-invalid"), "true");
  assert.equal(opponent.getAttribute("aria-describedby"), "analysis-editor-message");
  await act(async () => view.root.unmount());
});

test("analysis editor CSS keeps touch controls at least 44px and scopes responsive columns", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.match-analysis-editor button[^}]*min-height:\s*44px/u);
  assert.match(css, /\.analysis-metric-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
  assert.match(css, /\.analysis-metric-grid fieldset\s*\{[^}]*min-inline-size:\s*0/u);
  assert.match(css, /\.analysis-metric-grid legend\s*\{[^}]*white-space:\s*nowrap/u);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*\.analysis-editor-grid\s*,[\s\S]*?\{[^}]*grid-template-columns:\s*1fr/u);
});

declare global {
  var __analysisReloads: number | undefined;
}
