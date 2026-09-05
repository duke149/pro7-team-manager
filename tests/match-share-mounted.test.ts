import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";

const MATCH_ID = "00000000-0000-4000-8000-000000000101";
let MatchShareButton: (props: Record<string, unknown>) => React.ReactNode;
let act: (callback: () => void | Promise<void>) => Promise<void>;
let createElement: typeof import("react").createElement;
let createRoot: (container: Element) => { render(node: React.ReactNode): void; unmount(): void };
let browserWindow: Window & typeof globalThis;
type ActiveHandle = { constructor: { name: string }; close?: () => void };
const activeHandles = () => (process as unknown as { _getActiveHandles(): ActiveHandle[] })._getActiveHandles();
const initialHandles = new Set(activeHandles());

test.before(async () => {
  browserWindow = new Window({ url: "https://pro7.example/teams/nat-fc/matches" }) as unknown as Window & typeof globalThis;
  for (const [key, value] of Object.entries({ window: browserWindow, document: browserWindow.document, navigator: browserWindow.navigator, HTMLElement: browserWindow.HTMLElement, Node: browserWindow.Node, Event: browserWindow.Event, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const nodeEnvironment = process.env.NODE_ENV;
  const result = await build({ configFile: false, build: { lib: { entry: resolve("tests/fixtures/match-rsvp-mounted-entry.ts"), formats: ["cjs"], fileName: "match-rsvp-mounted" }, write: false } });
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnvironment ?? "test";
  const bundles = (Array.isArray(result) ? result : [result]) as unknown as readonly { output: readonly { type: string; isEntry?: boolean; code?: string }[] }[];
  const code = bundles.flatMap((entry) => entry.output).find((entry) => entry.type === "chunk" && entry.isEntry)?.code;
  assert.ok(code);
  const bundleModule = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", code)(bundleModule, bundleModule.exports);
  ({ MatchShareButton, act, createElement, createRoot } = bundleModule.exports as never);
});
test.after(async () => { await browserWindow.happyDOM.abort(); browserWindow.close(); for (const handle of activeHandles()) if (!initialHandles.has(handle) && handle.constructor.name === "MessagePort") handle.close?.(); });

async function mount() {
  document.body.innerHTML = '<div id="root"></div>';
  const container = document.getElementById("root"); assert.ok(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(MatchShareButton, { slug: "nat-fc", matchId: MATCH_ID, teamName: "FC NÁT", opponent: "FC NAT", startsAt: "2026-09-06T02:00:00.000Z", venue: "Sân CK2" })));
  return { container, root };
}

test("copy URL remains usable while native sharing is pending", async () => {
  Object.defineProperty(browserWindow.navigator, "share", { configurable: true, value: () => new Promise(() => {}) });
  const writes: string[] = [];
  Object.defineProperty(browserWindow.navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { writes.push(value); } } });
  const view = await mount();
  await act(async () => { view.container.querySelector<HTMLButtonElement>('button[aria-label="Chia sẻ lời mời trận đấu"]')!.click(); });
  const copy = view.container.querySelector<HTMLButtonElement>('button[aria-label="Sao chép link lời mời"]');
  assert.ok(copy, "Independent copy action must be available");
  assert.equal(copy.disabled, false);
  await act(async () => { copy.click(); });
  assert.equal(writes[0], `https://pro7.example/teams/nat-fc/matches/${MATCH_ID}/rsvp`);
  assert.equal(view.container.querySelector<HTMLInputElement>('input[readonly]')?.value, writes[0]);
  await act(async () => view.root.unmount());
});

test("share control uses the native share sheet with the one generic RSVP URL", async () => {
  const calls: ShareData[] = [];
  Object.defineProperty(browserWindow.navigator, "share", { configurable: true, value: async (payload: ShareData) => { calls.push(payload); } });
  const view = await mount();
  const button = view.container.querySelector<HTMLButtonElement>('button[aria-label="Chia sẻ lời mời trận đấu"]'); assert.ok(button);
  await act(async () => { button.click(); await Promise.resolve(); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, `https://pro7.example/teams/nat-fc/matches/${MATCH_ID}/rsvp`);
  assert.doesNotMatch(JSON.stringify(calls[0]), /userId|email|token/u);
  await act(async () => view.root.unmount());
});

test("share control copies the same text and exposes a selectable URL if clipboard is blocked", async () => {
  Object.defineProperty(browserWindow.navigator, "share", { configurable: true, value: undefined });
  const writes: string[] = [];
  Object.defineProperty(browserWindow.navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { writes.push(value); } } });
  let view = await mount();
  await act(async () => { view.container.querySelector<HTMLButtonElement>("button")?.click(); await Promise.resolve(); });
  assert.equal(writes.length, 1);
  assert.match(writes[0] ?? "", new RegExp(`${MATCH_ID}/rsvp`, "u"));
  assert.match(view.container.textContent ?? "", /Đã sao chép link/u);
  await act(async () => view.root.unmount());

  Object.defineProperty(browserWindow.navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } });
  view = await mount();
  await act(async () => { view.container.querySelector<HTMLButtonElement>("button")?.click(); await Promise.resolve(); });
  const fallback = view.container.querySelector<HTMLInputElement>('input[readonly]'); assert.ok(fallback);
  assert.equal(fallback.value, `https://pro7.example/teams/nat-fc/matches/${MATCH_ID}/rsvp`);
  await act(async () => view.root.unmount());
});
