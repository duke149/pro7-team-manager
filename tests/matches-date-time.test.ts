import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatVietnamDate,
  formatVietnamMatchDateTime,
  formatVietnamShortDateTime,
  fromVietnamDateTimeInput,
  toVietnamDateTimeInput,
} from "../lib/matches/date-time";

test("match date text is deterministic across server and browser locale implementations", () => {
  assert.equal(
    formatVietnamMatchDateTime("2026-09-05T19:00:00.000Z"),
    "02:00 · CHỦ NHẬT, 06/09/2026",
  );
  assert.equal(
    formatVietnamMatchDateTime("2026-08-28T09:15:00+07:00"),
    "09:15 · THỨ SÁU, 28/08/2026",
  );
});

test("match datetime-local values always round-trip through Asia/Ho_Chi_Minh", () => {
  assert.equal(
    toVietnamDateTimeInput("2026-09-05T19:00:00.000Z"),
    "2026-09-06T02:00",
  );
  assert.equal(
    fromVietnamDateTimeInput("2026-09-06T02:00"),
    "2026-09-05T19:00:00.000Z",
  );
  assert.equal(fromVietnamDateTimeInput("2026-02-31T02:00"), null);
});

test("shared Vietnam date labels stay deterministic for client-rendered finance, settings, and notifications", () => {
  assert.equal(formatVietnamShortDateTime("2026-09-05T19:00:00.000Z"), "02:00 · 06/09/2026");
  assert.equal(formatVietnamDate("2026-09-06"), "06/09");
  assert.equal(formatVietnamDate("2026-09-05T19:00:00.000Z"), "06/09");
  assert.equal(formatVietnamDate("not-a-date"), "NGÀY KHÔNG HỢP LỆ");
});

test("Overview reuses deterministic Vietnam date parts instead of browser locale formatting", async () => {
  const source = await readFile(new URL("../app/teams/[slug]/overview/overview-view.tsx", import.meta.url), "utf8");
  assert.match(source, /getVietnamDateTimeParts/u);
  assert.match(source, /formatVietnamMatchDateTime/u);
  assert.doesNotMatch(source, /Intl\.DateTimeFormat/u);
});

test("client-rendered date surfaces reuse the deterministic Vietnam formatter", async () => {
  const [notifications, funds, settings] = await Promise.all([
    readFile(new URL("../app/components/notification-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/funds/funds-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/teams/[slug]/admin/settings/settings-view.tsx", import.meta.url), "utf8"),
  ]);
  for (const source of [notifications, funds, settings]) assert.doesNotMatch(source, /Intl\.DateTimeFormat/u);
  assert.match(notifications, /formatVietnamShortDateTime/u);
  assert.match(funds, /formatVietnamDate/u);
  assert.match(settings, /formatVietnamShortDateTime/u);
});
