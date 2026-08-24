import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("https://pro7.example/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the PRO7 application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /PRO7 Team Manager/);
  assert.match(html, /Quản lý đội bóng 7 người/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("includes the five core surfaces and social metadata", async () => {
  const [source, layout] = await Promise.all([
    readFile(new URL("../app/pro7-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  for (const label of ["Tổng quan", "Đội hình", "Trận đấu", "Chiến thuật", "Quỹ đội"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  assert.doesNotMatch(layout, /og\.png/);
});
