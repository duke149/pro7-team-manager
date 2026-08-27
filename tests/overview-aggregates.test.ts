import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateAttendance,
  aggregateResults,
  aggregateTopScorer,
  buildCountdown,
  selectNextMatch,
  selectUpcomingCalendar,
} from "../lib/overview/aggregates";
import type { MatchSummary } from "../lib/matches/model";

const TEAM_USER = "00000000-0000-4000-8000-000000000010";

function match(
  id: string,
  startsAt: string,
  overrides: Partial<MatchSummary> = {},
): MatchSummary {
  return {
    id,
    opponent: `Opponent ${id.slice(-1)}`,
    startsAt,
    venue: null,
    isHome: true,
    rsvpDeadline: new Date(Date.parse(startsAt) - 86_400_000).toISOString(),
    status: "scheduled",
    teamScore: null,
    opponentScore: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    attendance: { invited: 0, available: 0, unavailable: 0, pending: 0 },
    ownAttendance: null,
    ...overrides,
  };
}

test("next match and calendar exclude non-upcoming fixtures and use stable startsAt/id order", () => {
  const now = "2026-10-10T00:00:00.000Z";
  const sameTimeLaterId = match("00000000-0000-4000-8000-000000000104", "2026-10-12T12:00:00.000Z");
  const sameTimeEarlierId = match("00000000-0000-4000-8000-000000000103", "2026-10-12T12:00:00.000Z");
  const later = match("00000000-0000-4000-8000-000000000105", "2026-10-15T12:00:00.000Z");
  const past = match("00000000-0000-4000-8000-000000000101", "2026-10-09T12:00:00.000Z");
  const completed = match("00000000-0000-4000-8000-000000000102", "2026-10-11T12:00:00.000Z", {
    status: "completed",
    teamScore: 2,
    opponentScore: 1,
  });

  assert.equal(
    selectNextMatch([later, completed, sameTimeLaterId, past, sameTimeEarlierId], now)?.id,
    sameTimeEarlierId.id,
  );
  assert.deepEqual(
    selectUpcomingCalendar([later, completed, sameTimeLaterId, past, sameTimeEarlierId], now, 2).map(({ id }) => id),
    [sameTimeEarlierId.id, sameTimeLaterId.id],
  );
});

test("next match compares valid offset timestamps by instant rather than source text", () => {
  const earlierInstant = match("00000000-0000-4000-8000-000000000103", "2026-10-10T07:30:00+07:00");
  const laterInstant = match("00000000-0000-4000-8000-000000000104", "2026-10-10T01:00:00.000Z");

  assert.equal(
    selectNextMatch([laterInstant, earlierInstant], "2026-10-10T00:00:00.000Z")?.id,
    earlierInstant.id,
  );
});

test("attendance and countdown are hand-calculated from the actual next match", () => {
  const next = match("00000000-0000-4000-8000-000000000101", "2026-10-19T12:45:00.000Z", {
    attendance: { invited: 15, available: 10, unavailable: 2, pending: 3 },
    ownAttendance: { status: "pending", updatedAt: "2026-10-02T00:00:00.000Z" },
  });

  assert.deepEqual(aggregateAttendance(next), {
    invited: 15,
    available: 10,
    unavailable: 2,
    pending: 3,
    confirmedPercent: 67,
  });
  assert.deepEqual(buildCountdown(next.startsAt, "2026-10-16T10:00:00.000Z"), {
    days: 3,
    hours: 2,
    minutes: 45,
  });
  assert.equal(aggregateAttendance(null), null);
});

test("result aggregates produce W/D/L form, points, and an honest zero-match state", () => {
  const completed = [
    match("00000000-0000-4000-8000-000000000101", "2026-10-01T12:00:00.000Z", { status: "completed", teamScore: 1, opponentScore: 0 }),
    match("00000000-0000-4000-8000-000000000102", "2026-10-02T12:00:00.000Z", { status: "completed", teamScore: 2, opponentScore: 2 }),
    match("00000000-0000-4000-8000-000000000103", "2026-10-03T12:00:00.000Z", { status: "completed", teamScore: 0, opponentScore: 3 }),
    match("00000000-0000-4000-8000-000000000104", "2026-10-04T12:00:00.000Z", { status: "completed", teamScore: 4, opponentScore: 1 }),
    match("00000000-0000-4000-8000-000000000105", "2026-10-05T12:00:00.000Z", { status: "completed", teamScore: 0, opponentScore: 0 }),
    match("00000000-0000-4000-8000-000000000106", "2026-10-06T12:00:00.000Z", { status: "completed", teamScore: 2, opponentScore: 1 }),
  ];

  assert.deepEqual(aggregateResults(completed), {
    completedMatches: 6,
    wins: 3,
    draws: 2,
    losses: 1,
    winRate: 50,
    recentForm: ["W", "D", "W", "L", "D"],
    recentPoints: 8,
  });
  assert.deepEqual(aggregateResults([match("00000000-0000-4000-8000-000000000109", "2026-10-09T12:00:00.000Z")]), {
    completedMatches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    winRate: null,
    recentForm: [],
    recentPoints: 0,
  });
});

test("top scorer sums completed-match goals and resolves ties by display name then user id", () => {
  const userA = TEAM_USER;
  const userB = "00000000-0000-4000-8000-000000000011";
  const userC = "00000000-0000-4000-8000-000000000012";
  const rows = [
    { matchId: "00000000-0000-4000-8000-000000000101", userId: userA, goals: 2 },
    { matchId: "00000000-0000-4000-8000-000000000102", userId: userA, goals: 1 },
    { matchId: "00000000-0000-4000-8000-000000000101", userId: userB, goals: 3 },
    { matchId: "00000000-0000-4000-8000-000000000101", userId: userC, goals: 1 },
  ] as const;
  const names = new Map([[userA, "Bình"], [userB, "An"], [userC, "Cường"]]);

  assert.deepEqual(aggregateTopScorer(rows, names), { userId: userB, displayName: "An", goals: 3 });
  assert.equal(aggregateTopScorer([], new Map()), null);
  assert.equal(aggregateTopScorer([{ matchId: rows[0].matchId, userId: userA, goals: 0 }], names), null);
});
