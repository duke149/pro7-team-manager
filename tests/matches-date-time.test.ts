import assert from "node:assert/strict";
import test from "node:test";

import {
  formatVietnamMatchDateTime,
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
