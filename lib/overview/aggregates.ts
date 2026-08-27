import type { MatchSummary } from "../matches/model";
import type {
  OverviewAttendance,
  OverviewCountdown,
  OverviewFormResult,
  OverviewGoalRow,
  OverviewResultStatistics,
  OverviewTopScorer,
} from "./model";

function ascendingMatch(left: MatchSummary, right: MatchSummary): number {
  return Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id);
}

function descendingMatch(left: MatchSummary, right: MatchSummary): number {
  return Date.parse(right.startsAt) - Date.parse(left.startsAt) || right.id.localeCompare(left.id);
}

function isUpcoming(match: MatchSummary, now: string): boolean {
  return match.status === "scheduled" && Date.parse(match.startsAt) >= Date.parse(now);
}

export function selectNextMatch(matches: readonly MatchSummary[], now: string): MatchSummary | null {
  return [...matches].filter((match) => isUpcoming(match, now)).sort(ascendingMatch)[0] ?? null;
}

export function selectUpcomingCalendar(
  matches: readonly MatchSummary[],
  now: string,
  limit = 3,
): readonly MatchSummary[] {
  return Object.freeze(
    [...matches]
      .filter((match) => isUpcoming(match, now))
      .sort(ascendingMatch)
      .slice(0, Math.max(0, limit)),
  );
}

export function aggregateAttendance(match: MatchSummary | null): OverviewAttendance | null {
  if (!match) return null;
  return Object.freeze({
    ...match.attendance,
    confirmedPercent: match.attendance.invited === 0
      ? 0
      : Math.round((match.attendance.available / match.attendance.invited) * 100),
  });
}

export function buildCountdown(startsAt: string, now: string): OverviewCountdown {
  const remainingMinutes = Math.max(0, Math.floor((Date.parse(startsAt) - Date.parse(now)) / 60_000));
  return Object.freeze({
    days: Math.floor(remainingMinutes / (24 * 60)),
    hours: Math.floor((remainingMinutes % (24 * 60)) / 60),
    minutes: remainingMinutes % 60,
  });
}

function result(match: MatchSummary): OverviewFormResult {
  if (match.teamScore! > match.opponentScore!) return "W";
  if (match.teamScore! < match.opponentScore!) return "L";
  return "D";
}

export function aggregateResults(matches: readonly MatchSummary[]): OverviewResultStatistics {
  const completed = matches
    .filter((match) => match.status === "completed")
    .sort(descendingMatch);
  const allResults = completed.map(result);
  const wins = allResults.filter((value) => value === "W").length;
  const draws = allResults.filter((value) => value === "D").length;
  const losses = allResults.filter((value) => value === "L").length;
  const recentForm = Object.freeze(allResults.slice(0, 5));

  return Object.freeze({
    completedMatches: completed.length,
    wins,
    draws,
    losses,
    winRate: completed.length === 0 ? null : Math.round((wins / completed.length) * 100),
    recentForm,
    recentPoints: recentForm.reduce((points, value) => points + (value === "W" ? 3 : value === "D" ? 1 : 0), 0),
  });
}

function compareNames(
  left: { userId: string; displayName: string | null },
  right: { userId: string; displayName: string | null },
): number {
  if (left.displayName !== right.displayName) {
    if (left.displayName === null) return 1;
    if (right.displayName === null) return -1;
    return left.displayName.localeCompare(right.displayName, "vi-VN");
  }
  return left.userId.localeCompare(right.userId);
}

export function aggregateTopScorer(
  rows: readonly OverviewGoalRow[],
  displayNames: ReadonlyMap<string, string | null>,
): OverviewTopScorer | null {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.goals);

  const candidates = [...totals]
    .map(([userId, goals]) => ({ userId, displayName: displayNames.get(userId) ?? null, goals }))
    .filter(({ goals }) => goals > 0)
    .sort((left, right) => right.goals - left.goals || compareNames(left, right));
  return candidates[0] ? Object.freeze(candidates[0]) : null;
}
