import assert from "node:assert/strict";
import test from "node:test";

import { validateMatchAnalysisPayload } from "../lib/matches/analysis-validation";

const PLAYER_A = "00000000-0000-4000-8000-000000000010";
const PLAYER_B = "00000000-0000-4000-8000-000000000011";
const UPDATED_AT = "2026-10-20T12:30:00.123456+00:00";

function validPayload() {
  return {
    events: [
      { minute: 12, sequenceNo: 1, eventType: "goal", teamSide: "team", playerUserId: PLAYER_A, secondaryUserId: PLAYER_B, note: "  Phối hợp   trung lộ  " },
      { minute: 34, sequenceNo: 1, eventType: "yellow_card", teamSide: "opponent", playerUserId: null, secondaryUserId: null, note: "Phạm lỗi" },
    ],
    playerStats: [
      { userId: PLAYER_A, minutesPlayed: 90, goals: 1, assists: 0, rating: 8.5, isMvp: true },
      { userId: PLAYER_B, minutesPlayed: 75, goals: 0, assists: 1, rating: null, isMvp: false },
    ],
    teamMetrics: {
      possession: { team: 58, opponent: 42 },
      shots: { team: 14, opponent: 6 },
      shotsOnTarget: { team: 8, opponent: 3 },
      corners: { team: 6, opponent: 2 },
    },
    expectedUpdatedAt: UPDATED_AT,
  };
}

test("accepts, normalizes, freezes, and maps a complete analysis snapshot to RPC JSON", () => {
  const input = validPayload();
  const result = validateMatchAnalysisPayload(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    events: [
      { minute: 12, sequence_no: 1, event_type: "goal", team_side: "team", player_user_id: PLAYER_A, secondary_user_id: PLAYER_B, note: "Phối hợp trung lộ" },
      { minute: 34, sequence_no: 1, event_type: "yellow_card", team_side: "opponent", player_user_id: null, secondary_user_id: null, note: "Phạm lỗi" },
    ],
    playerStats: [
      { user_id: PLAYER_A, minutes_played: 90, goals: 1, assists: 0, rating: 8.5, is_mvp: true },
      { user_id: PLAYER_B, minutes_played: 75, goals: 0, assists: 1, rating: null, is_mvp: false },
    ],
    teamMetrics: {
      possession: { team: 58, opponent: 42 },
      shots: { team: 14, opponent: 6 },
      shots_on_target: { team: 8, opponent: 3 },
      corners: { team: 6, opponent: 2 },
    },
    expectedUpdatedAt: UPDATED_AT,
  });
  assert.notEqual(result.value.events, input.events);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.events), true);
  assert.equal(Object.isFrozen(result.value.events[0]), true);
});

test("accepts an intentionally empty snapshot", () => {
  const result = validateMatchAnalysisPayload({ events: [], playerStats: [], teamMetrics: {}, expectedUpdatedAt: UPDATED_AT });
  assert.deepEqual(result, {
    ok: true,
    value: {
      events: [],
      playerStats: [],
      teamMetrics: {},
      expectedUpdatedAt: UPDATED_AT,
    },
  });
});

test("rejects malformed exact-key shapes", () => {
  const cases: unknown[] = [
    null,
    [],
    { ...validPayload(), surprise: true },
    { events: [], playerStats: [], teamMetrics: {} },
    { ...validPayload(), events: [{ ...validPayload().events[0], id: "client-id" }] },
    { ...validPayload(), playerStats: [{ ...validPayload().playerStats[0], displayName: "Không được gửi" }] },
    { ...validPayload(), teamMetrics: { passes: { team: 1, opponent: 2 } } },
    { ...validPayload(), teamMetrics: { shots: { team: 1, opponent: 2, total: 3 } } },
  ];
  for (const value of cases) assert.deepEqual(validateMatchAnalysisPayload(value), { ok: false, kind: "malformed" });
});

test("rejects array bounds, duplicate ordering, duplicate players, and multiple MVPs", () => {
  const tooManyEvents = Array.from({ length: 201 }, (_, index) => ({ minute: index % 121, sequenceNo: Math.floor(index / 121) + 1, eventType: "note", teamSide: "team", playerUserId: null, secondaryUserId: null, note: `Ghi chú ${index}` }));
  const tooManyStats = Array.from({ length: 101 }, (_, index) => ({ userId: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`, minutesPlayed: 1, goals: 0, assists: 0, rating: null, isMvp: false }));
  const cases = [
    { ...validPayload(), events: tooManyEvents },
    { ...validPayload(), playerStats: tooManyStats },
    { ...validPayload(), events: [validPayload().events[0], { ...validPayload().events[0], eventType: "note", note: "Trùng" }] },
    { ...validPayload(), playerStats: [validPayload().playerStats[0], { ...validPayload().playerStats[0], isMvp: false }] },
    { ...validPayload(), playerStats: validPayload().playerStats.map((stat) => ({ ...stat, isMvp: true })) },
  ];
  for (const value of cases) {
    const result = validateMatchAnalysisPayload(value);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, "validation");
  }
});

test("rejects invalid event values and player relationships", () => {
  const base = validPayload().events[0];
  const cases = [
    { ...base, minute: -1 },
    { ...base, minute: 121 },
    { ...base, sequenceNo: 0 },
    { ...base, sequenceNo: 101 },
    { ...base, eventType: "penalty" },
    { ...base, teamSide: "neutral" },
    { ...base, playerUserId: "not-a-uuid" },
    { ...base, note: "x".repeat(501) },
    { ...base, playerUserId: null },
    { ...base, playerUserId: PLAYER_A, secondaryUserId: PLAYER_A },
    { ...base, eventType: "yellow_card", secondaryUserId: PLAYER_B },
    { ...base, eventType: "substitution", secondaryUserId: null },
    { ...base, teamSide: "opponent", playerUserId: PLAYER_A, secondaryUserId: null },
    { ...base, eventType: "note", playerUserId: null, secondaryUserId: null, note: "   " },
  ];
  for (const event of cases) {
    const result = validateMatchAnalysisPayload({ ...validPayload(), events: [event] });
    assert.equal(result.ok, false, JSON.stringify(event));
    if (!result.ok) assert.equal(result.kind, "validation");
  }
});

test("rejects invalid player statistics and concurrency tokens", () => {
  const base = validPayload().playerStats[0];
  const cases = [
    { ...base, userId: "bad" },
    { ...base, minutesPlayed: 121 },
    { ...base, minutesPlayed: 1.5 },
    { ...base, goals: -1 },
    { ...base, assists: 1.25 },
    { ...base, rating: -0.1 },
    { ...base, rating: 10.1 },
    { ...base, rating: 8.55 },
    { ...base, isMvp: "yes" },
  ];
  for (const stat of cases) {
    const result = validateMatchAnalysisPayload({ ...validPayload(), playerStats: [stat] });
    assert.equal(result.ok, false, JSON.stringify(stat));
    if (!result.ok) assert.equal(result.kind, "validation");
  }
  for (const expectedUpdatedAt of ["", "yesterday", "2026-02-31T12:00:00Z"]) {
    const result = validateMatchAnalysisPayload({ ...validPayload(), expectedUpdatedAt });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, "validation");
  }
});

test("rejects invalid and internally inconsistent team metrics", () => {
  const cases = [
    { possession: { team: 58.5, opponent: 41.5 } },
    { possession: { team: 58, opponent: 41 } },
    { possession: { team: -1, opponent: 101 } },
    { shots: { team: -1, opponent: 2 } },
    { shots: { team: 32768, opponent: 2 } },
    { shotsOnTarget: { team: 5, opponent: 3 }, shots: { team: 4, opponent: 4 } },
    { corners: { team: Number.NaN, opponent: 2 } },
  ];
  for (const teamMetrics of cases) {
    const result = validateMatchAnalysisPayload({ ...validPayload(), teamMetrics });
    assert.equal(result.ok, false, JSON.stringify(teamMetrics));
    if (!result.ok) assert.equal(result.kind, "validation");
  }
});
