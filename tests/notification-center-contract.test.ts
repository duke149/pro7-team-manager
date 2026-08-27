import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("header renders the real notification center instead of a decorative bell", async () => {
  const source = await readFile(new URL("../app/components/pro7-route-header.tsx", import.meta.url), "utf8");
  assert.match(source, /NotificationCenter/u);
  assert.doesNotMatch(source, /<button className="icon-button notification"[^>]*><Bell/u);
});

test("notification center exposes unread badge, list, safe links, and mark-read", async () => {
  const source = await readFile(new URL("../app/components/notification-center.tsx", import.meta.url), "utf8");
  assert.match(source, /aria-label="Thông báo"/u);
  assert.match(source, /notification-badge/u);
  assert.match(source, /markRead/u);
  assert.match(source, /notification\.targetPath/u);
});
