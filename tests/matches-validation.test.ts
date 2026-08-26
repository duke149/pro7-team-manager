import assert from "node:assert/strict";
import test from "node:test";

import {
  validateAttendancePayload,
  validateCreateMatchPayload,
  validateMatchMutationPayload,
} from "../lib/matches/validation";

const CREATE = Object.freeze({
  opponent: "Metro City",
  startsAt: "2026-10-19T12:30:00.000Z",
  venue: "Riverside Turf, Sân 3",
  isHome: true,
  rsvpDeadline: "2026-10-18T12:30:00.000Z",
});

test("create validation accepts only the exact normalized match contract", () => {
  assert.deepEqual(validateCreateMatchPayload({ ...CREATE, opponent: " Metro City ", venue: "  Riverside  " }), {
    ok: true,
    value: { ...CREATE, opponent: "Metro City", venue: "Riverside" },
  });
  assert.deepEqual(validateCreateMatchPayload({ ...CREATE, injected: true }), {
    ok: false,
    kind: "malformed",
  });
});

test("create validation bounds opponent and venue and requires ordered canonical ISO timestamps", () => {
  for (const [field, value] of [
    ["opponent", "x".repeat(121)],
    ["venue", "x".repeat(201)],
    ["startsAt", "2026-10-19 12:30"],
    ["rsvpDeadline", "2026-10-20T12:30:00.000Z"],
  ] as const) {
    const result = validateCreateMatchPayload({ ...CREATE, [field]: value });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.kind === "validation" && field in result.fieldErrors);
  }
});

test("timestamp validation rejects impossible calendar dates instead of JavaScript normalization", () => {
  for (const [field, value] of [
    ["startsAt", "2026-02-31T12:30:00.000Z"],
    ["startsAt", "2025-02-29T12:30:00+07:00"],
    ["rsvpDeadline", "2026-13-01T12:30:00.000Z"],
    ["rsvpDeadline", "2026-10-18T24:00:00.000Z"],
  ] as const) {
    const result = validateCreateMatchPayload({ ...CREATE, [field]: value });
    assert.equal(result.ok, false, `${field}: ${value}`);
    assert.ok(!result.ok && result.kind === "validation" && field in result.fieldErrors);
  }
});

test("match mutation validation enforces action-specific keys and score/status consistency", () => {
  assert.deepEqual(validateMatchMutationPayload({
    action: "complete",
    teamScore: 3,
    opponentScore: 1,
    expectedUpdatedAt: "2026-10-19T14:30:00.000Z",
  }), {
    ok: true,
    value: {
      action: "complete",
      teamScore: 3,
      opponentScore: 1,
      expectedUpdatedAt: "2026-10-19T14:30:00.000Z",
    },
  });
  assert.deepEqual(validateMatchMutationPayload({
    action: "cancel",
    teamScore: 0,
    expectedUpdatedAt: "2026-10-19T14:30:00.000Z",
  }), { ok: false, kind: "malformed" });
  const invalidScore = validateMatchMutationPayload({
    action: "complete",
    teamScore: -1,
    opponentScore: 1,
    expectedUpdatedAt: "2026-10-19T14:30:00.000Z",
  });
  assert.equal(invalidScore.ok, false);
  assert.ok(!invalidScore.ok && invalidScore.kind === "validation" && "teamScore" in invalidScore.fieldErrors);
});

test("attendance validation bounds notes and permits only invite or own response payloads", () => {
  const userId = "00000000-0000-4000-8000-000000000010";
  assert.deepEqual(validateAttendancePayload({ action: "invite", userIds: [userId, userId] }), {
    ok: true,
    value: { action: "invite", userIds: [userId] },
  });
  assert.deepEqual(validateAttendancePayload({
    action: "respond",
    status: "available",
    note: "  Có mặt sớm  ",
    expectedUpdatedAt: "2026-10-18T08:00:00.000Z",
  }), {
    ok: true,
    value: {
      action: "respond",
      status: "available",
      note: "Có mặt sớm",
      expectedUpdatedAt: "2026-10-18T08:00:00.000Z",
    },
  });
  const invalid = validateAttendancePayload({
    action: "respond",
    status: "pending",
    note: "x".repeat(301),
    expectedUpdatedAt: "stale",
  });
  assert.equal(invalid.ok, false);
  assert.ok(!invalid.ok && invalid.kind === "validation");
  assert.deepEqual(!invalid.ok && invalid.kind === "validation" ? Object.keys(invalid.fieldErrors).sort() : [], [
    "expectedUpdatedAt",
    "note",
    "status",
  ]);
});

test("attendance validation accepts more than one RPC batch without exceeding the safe request cap", () => {
  const userIds = Array.from({ length: 201 }, (_, index) => `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`);
  const result = validateAttendancePayload({ action: "invite", userIds });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.action === "invite" ? result.value.userIds.length : 0, 201);
  const overflow = validateAttendancePayload({ action: "invite", userIds: Array.from({ length: 401 }, (_, index) => `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`) });
  assert.equal(overflow.ok, false);
});

test("mutation validation accepts the offset ISO stale tokens emitted by Supabase", () => {
  assert.deepEqual(validateAttendancePayload({
    action: "respond",
    status: "available",
    note: null,
    expectedUpdatedAt: "2026-10-18T08:00:00+00:00",
  }), {
    ok: true,
    value: {
      action: "respond",
      status: "available",
      note: null,
      expectedUpdatedAt: "2026-10-18T08:00:00+00:00",
    },
  });
});
