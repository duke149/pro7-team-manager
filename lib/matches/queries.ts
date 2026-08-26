import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type {
  AttendanceCounts,
  AttendanceStatus,
  InviteCandidate,
  MatchAttendance,
  MatchDetailResult,
  MatchEvent,
  MatchListResult,
  MatchPlayerStat,
  MatchStatus,
  MatchSummary,
  MatchTeamMetrics,
  TeamMetric,
} from "./model";
import "./server-only";

const LIST_SELECT = "id,opponent,starts_at,venue,is_home,rsvp_deadline,status,team_score,opponent_score,updated_at,attendance:match_attendance(user_id,status,updated_at)";
const DETAIL_SELECT = "id,opponent,starts_at,venue,is_home,rsvp_deadline,status,team_score,opponent_score,updated_at,attendance:match_attendance(user_id,status,note,responded_at,updated_at)";

type Dependencies = { supabase?: SupabaseClient<Database> };
type ListAttendanceRow = { user_id: string; status: AttendanceStatus; updated_at: string };
type DetailAttendanceRow = ListAttendanceRow & { note: string | null; responded_at: string | null };
type MatchRow = {
  id: string; opponent: string; starts_at: string; venue: string | null; is_home: boolean;
  rsvp_deadline: string; status: MatchStatus; team_score: number | null; opponent_score: number | null;
  updated_at: string; attendance: ListAttendanceRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nullableString(value: unknown): value is string | null { return value === null || typeof value === "string"; }
function nullableNumber(value: unknown): value is number | null { return value === null || (typeof value === "number" && Number.isFinite(value)); }
function attendanceStatus(value: unknown): value is AttendanceStatus { return value === "pending" || value === "available" || value === "unavailable"; }
function matchStatus(value: unknown): value is MatchStatus { return value === "scheduled" || value === "completed" || value === "cancelled"; }
function listAttendanceRow(value: unknown): value is ListAttendanceRow {
  return isRecord(value) && typeof value.user_id === "string" && attendanceStatus(value.status) && typeof value.updated_at === "string";
}
function detailAttendanceRow(value: unknown): value is DetailAttendanceRow {
  if (!listAttendanceRow(value)) return false;
  const row = value as ListAttendanceRow & Record<string, unknown>;
  return nullableString(row.note) && nullableString(row.responded_at);
}
function matchRow(value: unknown, detail = false): value is MatchRow {
  return isRecord(value) && typeof value.id === "string" && typeof value.opponent === "string" && typeof value.starts_at === "string"
    && nullableString(value.venue) && typeof value.is_home === "boolean" && typeof value.rsvp_deadline === "string"
    && matchStatus(value.status) && nullableNumber(value.team_score) && nullableNumber(value.opponent_score)
    && typeof value.updated_at === "string" && Array.isArray(value.attendance)
    && value.attendance.every(detail ? detailAttendanceRow : listAttendanceRow);
}

function compareText(left: string | null, right: string | null): number { if (left === right) return 0; if (left === null) return 1; if (right === null) return -1; return left < right ? -1 : 1; }
function counts(rows: readonly ListAttendanceRow[]): AttendanceCounts {
  return Object.freeze({ invited: rows.length, available: rows.filter((row) => row.status === "available").length, unavailable: rows.filter((row) => row.status === "unavailable").length, pending: rows.filter((row) => row.status === "pending").length });
}
function summary(row: MatchRow, userId: string): MatchSummary {
  const own = row.attendance.find((attendance) => attendance.user_id === userId);
  return Object.freeze({ id: row.id, opponent: row.opponent, startsAt: row.starts_at, venue: row.venue, isHome: row.is_home, rsvpDeadline: row.rsvp_deadline, status: row.status, teamScore: row.team_score, opponentScore: row.opponent_score, updatedAt: row.updated_at, attendance: counts(row.attendance), ownAttendance: own ? Object.freeze({ status: own.status, updatedAt: own.updated_at }) : null });
}
async function client(supplied?: SupabaseClient<Database>) { if (supplied) return supplied; const { createServerSupabaseClient } = await import("../supabase/server"); return createServerSupabaseClient(); }

export async function listMatches(teamId: string, userId: string, dependencies: Dependencies = {}): Promise<MatchListResult> {
  try {
    const result = await (await client(dependencies.supabase)).from("matches").select(LIST_SELECT).eq("team_id", teamId).order("starts_at", { ascending: true }).order("id", { ascending: true }).limit(100);
    if (result.error || !Array.isArray(result.data) || !result.data.every((row: unknown) => matchRow(row))) return { ok: false, error: "server" };
    const rows = result.data as unknown as MatchRow[];
    return { ok: true, matches: Object.freeze(rows.map((row) => summary(row, userId)).sort((a, b) => compareText(a.startsAt, b.startsAt) || compareText(a.id, b.id))) };
  } catch { return { ok: false, error: "server" }; }
}

type EventRow = { id: string; minute: number; sequence_no: number; event_type: MatchEvent["eventType"]; team_side: MatchEvent["teamSide"]; player_user_id: string | null; secondary_user_id: string | null; note: string | null };
type PlayerStatRow = { user_id: string; minutes_played: number; goals: number; assists: number; rating: number | null; is_mvp: boolean };
type ProfileRow = { id: string; display_name: string | null };
function eventRow(value: unknown): value is EventRow { return isRecord(value) && typeof value.id === "string" && Number.isInteger(value.minute) && Number.isInteger(value.sequence_no) && ["goal", "yellow_card", "red_card", "substitution", "note"].includes(String(value.event_type)) && (value.team_side === "team" || value.team_side === "opponent") && nullableString(value.player_user_id) && nullableString(value.secondary_user_id) && nullableString(value.note); }
function statRow(value: unknown): value is PlayerStatRow { return isRecord(value) && typeof value.user_id === "string" && Number.isInteger(value.minutes_played) && Number.isInteger(value.goals) && Number.isInteger(value.assists) && nullableNumber(value.rating) && typeof value.is_mvp === "boolean"; }
function profileRow(value: unknown): value is ProfileRow { return isRecord(value) && typeof value.id === "string" && nullableString(value.display_name); }
function metric(value: unknown): value is TeamMetric { return isRecord(value) && typeof value.team === "number" && Number.isFinite(value.team) && typeof value.opponent === "number" && Number.isFinite(value.opponent); }
function metrics(value: unknown): MatchTeamMetrics | null {
  if (!isRecord(value)) return null;
  const allowed = ["possession", "shots", "shots_on_target", "corners"];
  if (!Object.keys(value).every((key) => allowed.includes(key)) || !Object.values(value).every(metric)) return null;
  return Object.freeze({ possession: value.possession as TeamMetric | undefined, shots: value.shots as TeamMetric | undefined, shotsOnTarget: value.shots_on_target as TeamMetric | undefined, corners: value.corners as TeamMetric | undefined });
}

export async function getMatchDetail(teamId: string, matchId: string, userId: string, includeInviteCandidates: boolean, dependencies: Dependencies = {}): Promise<MatchDetailResult> {
  try {
    const supabase = await client(dependencies.supabase);
    const matchResult = await supabase.from("matches").select(DETAIL_SELECT).eq("team_id", teamId).eq("id", matchId).maybeSingle();
    if (matchResult.error) return { ok: false, error: "server" };
    if (matchResult.data === null) return { ok: false, error: "not_found" };
    if (!matchRow(matchResult.data, true)) return { ok: false, error: "server" };

    const [eventsResult, statsResult, teamStatsResult] = await Promise.all([
      supabase.from("match_events").select("id,minute,sequence_no,event_type,team_side,player_user_id,secondary_user_id,note").eq("team_id", teamId).eq("match_id", matchId).order("minute", { ascending: true }).order("sequence_no", { ascending: true }).limit(300),
      supabase.from("match_player_stats").select("user_id,minutes_played,goals,assists,rating,is_mvp").eq("team_id", teamId).eq("match_id", matchId).order("user_id", { ascending: true }).limit(100),
      supabase.from("match_team_stats").select("schema_version,metrics").eq("team_id", teamId).eq("match_id", matchId).maybeSingle(),
    ]);
    if (eventsResult.error || statsResult.error || teamStatsResult.error || !Array.isArray(eventsResult.data) || !eventsResult.data.every(eventRow) || !Array.isArray(statsResult.data) || !statsResult.data.every(statRow)) return { ok: false, error: "server" };
    const eventRows = eventsResult.data as unknown as EventRow[];
    const statRows = statsResult.data as unknown as PlayerStatRow[];
    if (teamStatsResult.data !== null && (!isRecord(teamStatsResult.data) || teamStatsResult.data.schema_version !== 1 || metrics(teamStatsResult.data.metrics) === null)) return { ok: false, error: "server" };

    let memberIds: string[] = [];
    if (includeInviteCandidates) {
      const memberships = await supabase.from("memberships").select("user_id").eq("team_id", teamId).eq("status", "active").order("user_id", { ascending: true }).limit(200);
      if (memberships.error || !Array.isArray(memberships.data) || !memberships.data.every((row: unknown) => isRecord(row) && typeof row.user_id === "string")) return { ok: false, error: "server" };
      memberIds = (memberships.data as unknown as { user_id: string }[]).map((row) => row.user_id);
    }
    const profileIds = [...new Set([...memberIds, ...statRows.map((row) => row.user_id), ...(matchResult.data.attendance as DetailAttendanceRow[]).map((row) => row.user_id)])].sort();
    const profilesResult = profileIds.length === 0 ? { data: [] as ProfileRow[], error: null } : await supabase.from("profiles").select("id,display_name").in("id", profileIds).order("id", { ascending: true }).limit(200);
    if (profilesResult.error || !Array.isArray(profilesResult.data) || !profilesResult.data.every(profileRow)) return { ok: false, error: "server" };
    const profiles = profilesResult.data as unknown as ProfileRow[];
    const names = new Map<string, string | null>(profiles.map((profile) => [profile.id, profile.display_name]));
    const attendanceRows = matchResult.data.attendance as DetailAttendanceRow[];
    const attendance: MatchAttendance[] = attendanceRows.map((row) => Object.freeze({ userId: row.user_id, status: row.status, note: row.note, respondedAt: row.responded_at, updatedAt: row.updated_at, displayName: names.get(row.user_id) ?? null })).sort((a, b) => compareText(a.displayName, b.displayName) || compareText(a.userId, b.userId));
    const events: MatchEvent[] = eventRows.map((row) => Object.freeze({ id: row.id, minute: row.minute, sequenceNo: row.sequence_no, eventType: row.event_type, teamSide: row.team_side, playerUserId: row.player_user_id, secondaryUserId: row.secondary_user_id, note: row.note }));
    const playerStats: MatchPlayerStat[] = statRows.map((row) => Object.freeze({ userId: row.user_id, displayName: names.get(row.user_id) ?? null, minutesPlayed: row.minutes_played, goals: row.goals, assists: row.assists, rating: row.rating, isMvp: row.is_mvp })).sort((a, b) => Number(b.isMvp) - Number(a.isMvp) || b.goals - a.goals || compareText(a.displayName, b.displayName) || compareText(a.userId, b.userId));
    const invited = new Set(attendanceRows.map((row) => row.user_id));
    const inviteCandidates: InviteCandidate[] = memberIds.map((candidateUserId) => Object.freeze({ userId: candidateUserId, displayName: names.get(candidateUserId) ?? null, invited: invited.has(candidateUserId) })).sort((a, b) => compareText(a.displayName, b.displayName) || compareText(a.userId, b.userId));
    return { ok: true, detail: Object.freeze({ match: summary(matchResult.data as unknown as MatchRow, userId), attendance: Object.freeze(attendance), events: Object.freeze(events), playerStats: Object.freeze(playerStats), teamMetrics: teamStatsResult.data === null ? null : metrics(teamStatsResult.data.metrics), inviteCandidates: Object.freeze(inviteCandidates) }) };
  } catch { return { ok: false, error: "server" }; }
}
