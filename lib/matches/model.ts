export const MATCH_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export const ATTENDANCE_STATUSES = ["pending", "available", "unavailable"] as const;
export const UNCERTAIN_ATTENDANCE_NOTE = "Có thể tham gia — chưa chắc chắn.";

export type MatchStatus = (typeof MATCH_STATUSES)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type AttendanceResponseStatus = Exclude<AttendanceStatus, "pending">;

export type AttendanceCounts = Readonly<{
  invited: number;
  available: number;
  unavailable: number;
  pending: number;
}>;

export type OwnAttendance = Readonly<{
  status: AttendanceStatus;
  updatedAt: string;
}>;

export type MatchSummary = Readonly<{
  id: string;
  opponent: string;
  startsAt: string;
  venue: string | null;
  isHome: boolean;
  rsvpDeadline: string;
  status: MatchStatus;
  teamScore: number | null;
  opponentScore: number | null;
  updatedAt: string;
  attendance: AttendanceCounts;
  ownAttendance: OwnAttendance | null;
}>;

export type MatchAttendance = Readonly<{
  userId: string;
  status: AttendanceStatus;
  note: string | null;
  respondedAt: string | null;
  updatedAt: string;
  displayName: string | null;
}>;

export type MatchEvent = Readonly<{
  id: string;
  minute: number;
  sequenceNo: number;
  eventType: "goal" | "yellow_card" | "red_card" | "substitution" | "note";
  teamSide: "team" | "opponent";
  playerUserId: string | null;
  playerDisplayName: string | null;
  secondaryUserId: string | null;
  secondaryDisplayName: string | null;
  note: string | null;
}>;

export type MatchPlayerStat = Readonly<{
  userId: string;
  displayName: string | null;
  minutesPlayed: number;
  goals: number;
  assists: number;
  rating: number | null;
  isMvp: boolean;
}>;

export type TeamMetric = Readonly<{ team: number; opponent: number }>;
export type MatchTeamMetrics = Readonly<{
  possession?: TeamMetric;
  shots?: TeamMetric;
  shotsOnTarget?: TeamMetric;
  corners?: TeamMetric;
}>;

export type InviteCandidate = Readonly<{
  userId: string;
  displayName: string | null;
  invited: boolean;
}>;

export type MatchAnalysisCandidate = Readonly<{
  userId: string;
  displayName: string | null;
}>;

export type MatchDetail = Readonly<{
  match: MatchSummary;
  attendance: readonly MatchAttendance[];
  events: readonly MatchEvent[];
  playerStats: readonly MatchPlayerStat[];
  teamMetrics: MatchTeamMetrics | null;
  inviteCandidates: readonly InviteCandidate[];
  analysisCandidates: readonly MatchAnalysisCandidate[];
}>;

export type MatchListResult =
  | Readonly<{ ok: true; matches: readonly MatchSummary[] }>
  | Readonly<{ ok: false; error: "server" }>;

export type MatchDetailResult =
  | Readonly<{ ok: true; detail: MatchDetail }>
  | Readonly<{ ok: false; error: "not_found" | "server" }>;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
