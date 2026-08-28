import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type {
  AttendanceCounts,
  AttendanceStatus,
  InviteCandidate,
  MatchAnalysisCandidate,
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
import { isUuid } from "./model";
import { isIsoTimestamp, MAX_INVITE_USER_IDS } from "./validation";
import "./server-only";

const LIST_SELECT = "id,opponent,starts_at,venue,is_home,rsvp_deadline,status,team_score,opponent_score,cancelled_at,updated_at,attendance:match_attendance(user_id,status,updated_at)";
const DETAIL_SELECT = "id,opponent,starts_at,venue,is_home,rsvp_deadline,status,team_score,opponent_score,cancelled_at,updated_at,attendance:match_attendance(user_id,status,note,responded_at,updated_at)";
const PAGE_SIZE = 100;
const MAX_LIST_MATCHES = 1000;

type Dependencies = { supabase?: SupabaseClient<Database> };
type ListAttendanceRow = { user_id: string; status: AttendanceStatus; updated_at: string };
type DetailAttendanceRow = ListAttendanceRow & { note: string | null; responded_at: string | null };
type MatchRow = {
  id: string; opponent: string; starts_at: string; venue: string | null; is_home: boolean;
  rsvp_deadline: string; status: MatchStatus; team_score: number | null; opponent_score: number | null;
  cancelled_at: string | null; updated_at: string; attendance: ListAttendanceRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nullableString(value: unknown): value is string | null { return value === null || typeof value === "string"; }
function boundedText(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value === value.trim() && Array.from(value).length >= min && Array.from(value).length <= max; }
function nullableBoundedText(value: unknown, min: number, max: number): value is string | null { return value === null || boundedText(value, min, max); }
function smallint(value: unknown, min = -32768, max = 32767): value is number { return Number.isInteger(value) && (value as number) >= min && (value as number) <= max; }
function nullableUuid(value: unknown): value is string | null { return value === null || isUuid(value); }
function unique<T>(values: readonly T[]): boolean { return new Set(values).size === values.length; }
function attendanceStatus(value: unknown): value is AttendanceStatus { return value === "pending" || value === "available" || value === "unavailable"; }
function matchStatus(value: unknown): value is MatchStatus { return value === "scheduled" || value === "completed" || value === "cancelled"; }
function listAttendanceRow(value: unknown): value is ListAttendanceRow {
  return isRecord(value) && isUuid(value.user_id) && attendanceStatus(value.status) && isIsoTimestamp(value.updated_at);
}
function detailAttendanceRow(value: unknown): value is DetailAttendanceRow {
  if (!listAttendanceRow(value)) return false;
  const row = value as ListAttendanceRow & Record<string, unknown>;
  return nullableBoundedText(row.note, 1, 300) && (row.status === "pending" ? row.responded_at === null : isIsoTimestamp(row.responded_at));
}
function matchRow(value: unknown, detail = false): value is MatchRow {
  if (!isRecord(value) || !isUuid(value.id) || !boundedText(value.opponent, 1, 120) || !isIsoTimestamp(value.starts_at)
    || !nullableBoundedText(value.venue, 1, 200) || typeof value.is_home !== "boolean" || !isIsoTimestamp(value.rsvp_deadline)
    || Date.parse(value.rsvp_deadline) > Date.parse(value.starts_at) || !matchStatus(value.status)
    || !(value.team_score === null || smallint(value.team_score, 0)) || !(value.opponent_score === null || smallint(value.opponent_score, 0))
    || !(value.cancelled_at === null || isIsoTimestamp(value.cancelled_at))
    || !isIsoTimestamp(value.updated_at) || !Array.isArray(value.attendance)
    || !value.attendance.every(detail ? detailAttendanceRow : listAttendanceRow)
    || !unique(value.attendance.map((row) => (row as ListAttendanceRow).user_id))) return false;
  if (value.status === "completed") return value.team_score !== null && value.opponent_score !== null && value.cancelled_at === null;
  if (value.status === "cancelled") return value.team_score === null && value.opponent_score === null && value.cancelled_at !== null;
  return value.team_score === null && value.opponent_score === null && value.cancelled_at === null;
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
    const supabase = await client(dependencies.supabase);
    const rows: MatchRow[] = [];
    let cursor: string | null = null;
    while (true) {
      let query = supabase.from("matches").select(LIST_SELECT).eq("team_id", teamId).order("id", { ascending: true });
      if (cursor) query = query.gt("id", cursor);
      const result = await query.limit(PAGE_SIZE);
      if (result.error || !Array.isArray(result.data) || result.data.length > PAGE_SIZE || !result.data.every((row: unknown) => matchRow(row))) return { ok: false, error: "server" };
      const page = result.data as unknown as MatchRow[];
      if (page.some((row, index) => (index === 0 ? cursor !== null && row.id <= cursor : row.id <= page[index - 1]!.id))) return { ok: false, error: "server" };
      if (rows.length + page.length > MAX_LIST_MATCHES) return { ok: false, error: "server" };
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      cursor = page.at(-1)!.id;
    }
    return { ok: true, matches: Object.freeze(rows.map((row) => summary(row, userId)).sort((a, b) => compareText(a.startsAt, b.startsAt) || compareText(a.id, b.id))) };
  } catch { return { ok: false, error: "server" }; }
}

type EventRow = { id: string; minute: number; sequence_no: number; event_type: MatchEvent["eventType"]; team_side: MatchEvent["teamSide"]; player_user_id: string | null; secondary_user_id: string | null; note: string | null };
type PlayerStatRow = { user_id: string; minutes_played: number; goals: number; assists: number; rating: number | null; is_mvp: boolean };
type ProfileRow = { id: string; display_name: string | null };
function eventRow(value: unknown): value is EventRow {
  if (!isRecord(value) || !isUuid(value.id) || !smallint(value.minute, 0, 120) || !smallint(value.sequence_no, 1, 100)
    || !["goal", "yellow_card", "red_card", "substitution", "note"].includes(String(value.event_type))
    || (value.team_side !== "team" && value.team_side !== "opponent") || !nullableUuid(value.player_user_id)
    || !nullableUuid(value.secondary_user_id) || !nullableBoundedText(value.note, 1, 500)) return false;
  if (value.team_side === "opponent") {
    return value.player_user_id === null && value.secondary_user_id === null
      && (!(value.event_type === "substitution" || value.event_type === "note") || value.note !== null);
  }
  if (value.event_type === "goal") return value.player_user_id !== null && value.secondary_user_id !== value.player_user_id;
  if (value.event_type === "yellow_card" || value.event_type === "red_card") return value.player_user_id !== null && value.secondary_user_id === null;
  if (value.event_type === "substitution") return value.player_user_id !== null && value.secondary_user_id !== null && value.secondary_user_id !== value.player_user_id;
  return value.secondary_user_id === null && value.note !== null;
}
function statRow(value: unknown): value is PlayerStatRow { return isRecord(value) && isUuid(value.user_id) && smallint(value.minutes_played, 0, 120) && smallint(value.goals, 0) && smallint(value.assists, 0) && (value.rating === null || (typeof value.rating === "number" && Number.isFinite(value.rating) && value.rating >= 0 && value.rating <= 10 && Math.abs(value.rating * 10 - Math.round(value.rating * 10)) < Number.EPSILON * 100)) && typeof value.is_mvp === "boolean"; }
function profileRow(value: unknown): value is ProfileRow { return isRecord(value) && isUuid(value.id) && nullableString(value.display_name); }
function metric(value: unknown, maximum: number): value is TeamMetric {
  return isRecord(value) && Object.keys(value).length === 2 && "team" in value && "opponent" in value
    && smallint(value.team, 0, maximum) && smallint(value.opponent, 0, maximum);
}
function metrics(value: unknown): MatchTeamMetrics | null {
  if (!isRecord(value)) return null;
  const allowed = ["possession", "shots", "shots_on_target", "corners"];
  if (!Object.keys(value).every((key) => allowed.includes(key))) return null;
  if (value.possession !== undefined && !metric(value.possession, 100)) return null;
  if (value.shots !== undefined && !metric(value.shots, 32767)) return null;
  if (value.shots_on_target !== undefined && !metric(value.shots_on_target, 32767)) return null;
  if (value.corners !== undefined && !metric(value.corners, 32767)) return null;
  const possession = value.possession as TeamMetric | undefined;
  const shots = value.shots as TeamMetric | undefined;
  const shotsOnTarget = value.shots_on_target as TeamMetric | undefined;
  const corners = value.corners as TeamMetric | undefined;
  if (possession && possession.team + possession.opponent !== 100) return null;
  if (shots && shotsOnTarget && (shotsOnTarget.team > shots.team || shotsOnTarget.opponent > shots.opponent)) return null;
  return Object.freeze({ ...(possession ? { possession: Object.freeze(possession) } : {}), ...(shots ? { shots: Object.freeze(shots) } : {}), ...(shotsOnTarget ? { shotsOnTarget: Object.freeze(shotsOnTarget) } : {}), ...(corners ? { corners: Object.freeze(corners) } : {}) });
}

export async function getMatchDetail(teamId: string, matchId: string, userId: string, includeInviteCandidates: boolean, dependencies: Dependencies = {}): Promise<MatchDetailResult> {
  try {
    const supabase = await client(dependencies.supabase);
    const matchResult = await supabase.from("matches").select(DETAIL_SELECT).eq("team_id", teamId).eq("id", matchId).maybeSingle();
    if (matchResult.error) return { ok: false, error: "server" };
    if (matchResult.data === null) return { ok: false, error: "not_found" };
    if (!matchRow(matchResult.data, true)) return { ok: false, error: "server" };

    const [eventsResult, statsResult, teamStatsResult] = await Promise.all([
      supabase.from("match_events").select("id,minute,sequence_no,event_type,team_side,player_user_id,secondary_user_id,note").eq("team_id", teamId).eq("match_id", matchId).order("minute", { ascending: true }).order("sequence_no", { ascending: true }).limit(201),
      supabase.from("match_player_stats").select("user_id,minutes_played,goals,assists,rating,is_mvp").eq("team_id", teamId).eq("match_id", matchId).order("user_id", { ascending: true }).limit(101),
      supabase.from("match_team_stats").select("schema_version,metrics").eq("team_id", teamId).eq("match_id", matchId).maybeSingle(),
    ]);
    if (eventsResult.error || statsResult.error || teamStatsResult.error || !Array.isArray(eventsResult.data) || eventsResult.data.length > 200 || !eventsResult.data.every(eventRow) || !Array.isArray(statsResult.data) || statsResult.data.length > 100 || !statsResult.data.every(statRow)) return { ok: false, error: "server" };
    const eventRows = eventsResult.data as unknown as EventRow[];
    const statRows = statsResult.data as unknown as PlayerStatRow[];
    if (!unique(eventRows.map((row) => row.id)) || !unique(eventRows.map((row) => `${row.minute}:${row.sequence_no}`)) || !unique(statRows.map((row) => row.user_id)) || statRows.filter((row) => row.is_mvp).length > 1) return { ok: false, error: "server" };
    if (teamStatsResult.data !== null && (!isRecord(teamStatsResult.data) || teamStatsResult.data.schema_version !== 1 || metrics(teamStatsResult.data.metrics) === null)) return { ok: false, error: "server" };

    const memberIds: string[] = [];
    if (includeInviteCandidates) {
      let cursor: string | null = null;
      while (true) {
        let query = supabase.from("memberships").select("user_id").eq("team_id", teamId).eq("status", "active").order("user_id", { ascending: true });
        if (cursor) query = query.gt("user_id", cursor);
        const memberships = await query.limit(PAGE_SIZE);
        if (memberships.error || !Array.isArray(memberships.data) || memberships.data.length > PAGE_SIZE || !memberships.data.every((row: unknown) => isRecord(row) && isUuid(row.user_id))) return { ok: false, error: "server" };
        const page = (memberships.data as unknown as { user_id: string }[]).map((row) => row.user_id);
        if (page.some((id, index) => (index === 0 ? cursor !== null && id <= cursor : id <= page[index - 1]!))) return { ok: false, error: "server" };
        if (memberIds.length + page.length > MAX_INVITE_USER_IDS) return { ok: false, error: "server" };
        memberIds.push(...page);
        if (page.length < PAGE_SIZE) break;
        cursor = page.at(-1)!;
      }
    }
    const referencedEventIds = eventRows.flatMap((row) => [row.player_user_id, row.secondary_user_id]).filter((id): id is string => id !== null);
    const attendanceRows = matchResult.data.attendance as DetailAttendanceRow[];
    const historicalIds = [...new Set([...statRows.map((row) => row.user_id), ...attendanceRows.map((row) => row.user_id), ...referencedEventIds])];
    const profileIds = [...new Set([...memberIds, ...historicalIds])].sort();
    const profiles: ProfileRow[] = [];
    for (let offset = 0; offset < profileIds.length; offset += PAGE_SIZE) {
      const requested = profileIds.slice(offset, offset + PAGE_SIZE);
      const profilesResult = await supabase.from("profiles").select("id,display_name").in("id", requested).order("id", { ascending: true }).limit(PAGE_SIZE);
      if (profilesResult.error || !Array.isArray(profilesResult.data) || profilesResult.data.length > PAGE_SIZE || !profilesResult.data.every(profileRow)) return { ok: false, error: "server" };
      const page = profilesResult.data as unknown as ProfileRow[];
      const requestedSet = new Set(requested);
      if (page.some((profile, index) => !requestedSet.has(profile.id) || (index > 0 && profile.id <= page[index - 1]!.id))) return { ok: false, error: "server" };
      profiles.push(...page);
    }
    const names = new Map<string, string | null>(profiles.map((profile) => [profile.id, profile.display_name]));
    const attendance: MatchAttendance[] = attendanceRows.map((row) => Object.freeze({ userId: row.user_id, status: row.status, note: row.note, respondedAt: row.responded_at, updatedAt: row.updated_at, displayName: names.get(row.user_id) ?? null })).sort((a, b) => compareText(a.displayName, b.displayName) || compareText(a.userId, b.userId));
    const events: MatchEvent[] = eventRows.map((row) => Object.freeze({ id: row.id, minute: row.minute, sequenceNo: row.sequence_no, eventType: row.event_type, teamSide: row.team_side, playerUserId: row.player_user_id, playerDisplayName: row.player_user_id ? names.get(row.player_user_id) ?? null : null, secondaryUserId: row.secondary_user_id, secondaryDisplayName: row.secondary_user_id ? names.get(row.secondary_user_id) ?? null : null, note: row.note }));
    const playerStats: MatchPlayerStat[] = statRows.map((row) => Object.freeze({ userId: row.user_id, displayName: names.get(row.user_id) ?? null, minutesPlayed: row.minutes_played, goals: row.goals, assists: row.assists, rating: row.rating, isMvp: row.is_mvp })).sort((a, b) => Number(b.isMvp) - Number(a.isMvp) || b.goals - a.goals || compareText(a.displayName, b.displayName) || compareText(a.userId, b.userId));
    const invited = new Set(attendanceRows.map((row) => row.user_id));
    const inviteCandidates: InviteCandidate[] = memberIds.map((candidateUserId) => Object.freeze({ userId: candidateUserId, displayName: names.get(candidateUserId) ?? null, invited: invited.has(candidateUserId) })).sort((a, b) => compareText(a.displayName, b.displayName) || compareText(a.userId, b.userId));
    const analysisIds = includeInviteCandidates ? [...new Set([...memberIds, ...historicalIds])] : [];
    const analysisCandidates: MatchAnalysisCandidate[] = analysisIds.map((candidateUserId) => Object.freeze({ userId: candidateUserId, displayName: names.get(candidateUserId) ?? null })).sort((a, b) => compareText(a.displayName, b.displayName) || compareText(a.userId, b.userId));
    return { ok: true, detail: Object.freeze({ match: summary(matchResult.data as unknown as MatchRow, userId), attendance: Object.freeze(attendance), events: Object.freeze(events), playerStats: Object.freeze(playerStats), teamMetrics: teamStatsResult.data === null ? null : metrics(teamStatsResult.data.metrics), inviteCandidates: Object.freeze(inviteCandidates), analysisCandidates: Object.freeze(analysisCandidates) }) };
  } catch { return { ok: false, error: "server" }; }
}
