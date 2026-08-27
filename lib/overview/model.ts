import type { AttendanceCounts, MatchSummary } from "../matches/model";

export type OverviewAttendance = AttendanceCounts & Readonly<{
  confirmedPercent: number;
}>;

export type OverviewCountdown = Readonly<{
  days: number;
  hours: number;
  minutes: number;
}>;

export type OverviewFormResult = "W" | "D" | "L";

export type OverviewTopScorer = Readonly<{
  userId: string;
  displayName: string | null;
  goals: number;
}>;

export type OverviewResultStatistics = Readonly<{
  completedMatches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number | null;
  recentForm: readonly OverviewFormResult[];
  recentPoints: number;
}>;

export type OverviewStatistics = OverviewResultStatistics & Readonly<{
  topScorer: OverviewTopScorer | null;
}>;

export type OverviewGoalRow = Readonly<{
  matchId: string;
  userId: string;
  goals: number;
}>;

export type OverviewNewsPost = Readonly<{
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}>;

export type OverviewData = Readonly<{
  nextMatch: MatchSummary | null;
  countdown: OverviewCountdown | null;
  attendance: OverviewAttendance | null;
  statistics: OverviewStatistics;
  news: readonly OverviewNewsPost[];
  calendar: readonly MatchSummary[];
}>;

export type OverviewResult =
  | Readonly<{ ok: true; data: OverviewData }>
  | Readonly<{ ok: false; error: "server" }>;
