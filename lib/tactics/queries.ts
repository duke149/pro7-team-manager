import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid, type MatchListResult } from "../matches/model";
import { listMatches } from "../matches/queries";
import { isIsoTimestamp } from "../matches/validation";
import type { Database } from "../supabase/database.types";
import { TACTIC_FORMATIONS, TACTIC_LEVELS, TACTIC_MODES, TACTIC_ROLES, type MatchTactic, type TacticFormation, type TacticLevel, type TacticMode, type TacticRole, type TacticSlot, type TacticsDetailResult, type TacticsMatchesResult, type TacticsPlayer } from "./model";

const TACTICS_SELECT = "id,mode,formation,instructions,version,pressing,defensive_line,status,updated_at,applied_at,slots:lineup_slots(user_id,slot_kind,slot_key,role_label,shirt_number,x,y)";
const PLAYER_PAGE_SIZE = 100;
const MAX_ACTIVE_PLAYERS = 1_000;
const MAX_HISTORICAL_PLAYERS = 1_000;
const MEMBERSHIP_SELECT = "user_id,player:team_player_profiles!team_player_profiles_membership_fkey(shirt_number,official_position,player_status)";
const HISTORICAL_MEMBERSHIP_SELECT = "user_id,status,player:team_player_profiles!team_player_profiles_membership_fkey(shirt_number,official_position,player_status)";
type Dependencies = { supabase?: Pick<SupabaseClient<Database>, "from">; listMatches?: (teamId: string, userId: string) => Promise<MatchListResult> };
type SlotRow = { user_id: string; slot_kind: "starter" | "bench"; slot_key: string; role_label: TacticRole; shirt_number: number | null; x: number; y: number };
type TacticRow = { id: string; mode: TacticMode; formation: TacticFormation; instructions: string | null; version: number; pressing: TacticLevel; defensive_line: TacticLevel; status: "draft" | "applied"; updated_at: string; applied_at: string | null; slots: SlotRow[] };
type ActiveMembershipRow = { user_id: string; player: { shirt_number: number | null; official_position: TacticRole | null; player_status: "available" | "injured" | "unavailable" } };
type HistoricalMembershipRow = ActiveMembershipRow & { status: "active" | "inactive" };
type ProfileRow = { id: string; display_name: string | null };

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function oneOf(value: unknown, values: readonly string[]): value is string { return typeof value === "string" && values.includes(value); }
function bounded(value: unknown, min: number, max: number) { return typeof value === "string" && value === value.trim() && Array.from(value).length >= min && Array.from(value).length <= max; }
function slotRow(value: unknown): value is SlotRow { return record(value) && isUuid(value.user_id) && (value.slot_kind === "starter" || value.slot_kind === "bench") && bounded(value.slot_key, 1, 40) && oneOf(value.role_label, TACTIC_ROLES) && (value.shirt_number === null || (Number.isInteger(value.shirt_number) && (value.shirt_number as number) >= 1 && (value.shirt_number as number) <= 99)) && typeof value.x === "number" && Number.isFinite(value.x) && value.x >= 0 && value.x <= 100 && typeof value.y === "number" && Number.isFinite(value.y) && value.y >= 0 && value.y <= 100; }
function tacticRow(value: unknown): value is TacticRow {
  if (!record(value) || !isUuid(value.id) || !oneOf(value.mode, TACTIC_MODES) || !oneOf(value.formation, TACTIC_FORMATIONS) || !(value.instructions === null || bounded(value.instructions, 1, 2000)) || !Number.isInteger(value.version) || (value.version as number) < 1 || !oneOf(value.pressing, TACTIC_LEVELS) || !oneOf(value.defensive_line, TACTIC_LEVELS) || (value.status !== "draft" && value.status !== "applied") || !isIsoTimestamp(value.updated_at) || !(value.applied_at === null || isIsoTimestamp(value.applied_at)) || !Array.isArray(value.slots) || value.slots.length > 30 || !value.slots.every(slotRow)) return false;
  const slots = value.slots as SlotRow[];
  if (new Set(slots.map((slot) => slot.user_id)).size !== slots.length || new Set(slots.map((slot) => slot.slot_key)).size !== slots.length) return false;
  if (value.status === "applied") { const starters = slots.filter((slot) => slot.slot_kind === "starter"); if (value.applied_at === null || starters.length !== 7 || starters.filter((slot) => slot.role_label === "GK").length !== 1) return false; }
  return value.status !== "draft" || value.applied_at === null;
}
function activeMembershipRow(value: unknown): value is ActiveMembershipRow {
  if (!record(value) || !isUuid(value.user_id) || !record(value.player)) return false;
  return (value.player.shirt_number === null || (Number.isInteger(value.player.shirt_number) && (value.player.shirt_number as number) >= 1 && (value.player.shirt_number as number) <= 99))
    && (value.player.official_position === null || oneOf(value.player.official_position, TACTIC_ROLES))
    && oneOf(value.player.player_status, ["available", "injured", "unavailable"]);
}
function historicalMembershipRow(value: unknown): value is HistoricalMembershipRow {
  return activeMembershipRow(value) && record(value)
    && (value.status === "active" || value.status === "inactive");
}
function profileRow(value: unknown): value is ProfileRow {
  return record(value) && isUuid(value.id)
    && (value.display_name === null || bounded(value.display_name, 1, 100));
}
async function client(supplied?: Pick<SupabaseClient<Database>, "from">) { if (supplied) return supplied; const { createServerSupabaseClient } = await import("../supabase/server"); return createServerSupabaseClient(); }

async function listActiveTacticsPlayers(supabase: Pick<SupabaseClient<Database>, "from">, teamId: string): Promise<readonly TacticsPlayer[] | null> {
  const memberships: ActiveMembershipRow[] = [];
  let cursor: string | null = null;
  while (true) {
    let query = supabase.from("memberships").select(MEMBERSHIP_SELECT).eq("team_id", teamId).eq("status", "active");
    if (cursor) query = query.gt("user_id", cursor);
    const result = await query.order("user_id", { ascending: true }).limit(PLAYER_PAGE_SIZE);
    if (result.error || !Array.isArray(result.data) || !result.data.every(activeMembershipRow)) return null;
    const page = result.data as unknown as ActiveMembershipRow[];
    if (page.some((row, index) => (index > 0 && page[index - 1].user_id >= row.user_id) || (cursor !== null && row.user_id <= cursor))) return null;
    memberships.push(...page);
    if (memberships.length > MAX_ACTIVE_PLAYERS) return null;
    if (page.length < PLAYER_PAGE_SIZE) break;
    cursor = page[page.length - 1].user_id;
  }
  const membershipIds = memberships.map((membership) => membership.user_id);
  if (new Set(membershipIds).size !== membershipIds.length) return null;
  const profiles: ProfileRow[] = [];
  for (let index = 0; index < membershipIds.length; index += PLAYER_PAGE_SIZE) {
    const ids = membershipIds.slice(index, index + PLAYER_PAGE_SIZE);
    const result = await supabase.from("profiles").select("id,display_name").in("id", ids).order("id", { ascending: true }).limit(ids.length + 1);
    if (result.error || !Array.isArray(result.data) || result.data.length !== ids.length || !result.data.every(profileRow)) return null;
    profiles.push(...result.data as unknown as ProfileRow[]);
  }
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  if (profilesById.size !== membershipIds.length) return null;
  return Object.freeze(memberships.map((membership) => {
    const profile = profilesById.get(membership.user_id);
    if (!profile) throw new Error("missing active member profile");
    return Object.freeze({ userId: membership.user_id, displayName: profile.display_name, shirtNumber: membership.player.shirt_number, officialPosition: membership.player.official_position });
  }));
}

async function listHistoricalTacticsPlayers(
  supabase: Pick<SupabaseClient<Database>, "from">,
  teamId: string,
  referencedUserIds: readonly string[],
): Promise<readonly TacticsPlayer[] | null> {
  const userIds = [...referencedUserIds].sort();
  if (userIds.length > MAX_HISTORICAL_PLAYERS || new Set(userIds).size !== userIds.length
    || !userIds.every(isUuid)) return null;
  if (userIds.length === 0) return Object.freeze([]);

  const memberships: HistoricalMembershipRow[] = [];
  for (let index = 0; index < userIds.length; index += PLAYER_PAGE_SIZE) {
    const ids = userIds.slice(index, index + PLAYER_PAGE_SIZE);
    const result = await supabase
      .from("memberships")
      .select(HISTORICAL_MEMBERSHIP_SELECT)
      .eq("team_id", teamId)
      .in("user_id", ids)
      .order("user_id", { ascending: true })
      .limit(ids.length + 1);
    if (result.error || !Array.isArray(result.data) || result.data.length !== ids.length
      || !result.data.every(historicalMembershipRow)) return null;
    const rows = result.data as unknown as HistoricalMembershipRow[];
    if (rows.some((row, rowIndex) => row.user_id !== ids[rowIndex])) return null;
    memberships.push(...rows);
  }

  const profiles: ProfileRow[] = [];
  for (let index = 0; index < userIds.length; index += PLAYER_PAGE_SIZE) {
    const ids = userIds.slice(index, index + PLAYER_PAGE_SIZE);
    const result = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", ids)
      .order("id", { ascending: true })
      .limit(ids.length + 1);
    if (result.error || !Array.isArray(result.data) || result.data.length !== ids.length
      || !result.data.every(profileRow)) return null;
    const rows = result.data as unknown as ProfileRow[];
    if (rows.some((row, rowIndex) => row.id !== ids[rowIndex])) return null;
    profiles.push(...rows);
  }

  return Object.freeze(memberships.map((membership, index) => {
    const profile = profiles[index];
    if (!profile || profile.id !== membership.user_id) throw new Error("missing historical member profile");
    const fallback = `${membership.status === "inactive" ? "Cựu thành viên" : "Cầu thủ"} • ${membership.user_id.slice(0, 8)}`;
    return Object.freeze({
      userId: membership.user_id,
      displayName: profile.display_name ?? fallback,
      shirtNumber: membership.player.shirt_number,
      officialPosition: membership.player.official_position,
    });
  }));
}

export async function listScheduledTacticsMatches(teamId: string, userId: string, dependencies: Dependencies = {}): Promise<TacticsMatchesResult> {
  const result = await (dependencies.listMatches ?? listMatches)(teamId, userId);
  if (!result.ok) return result;
  return { ok: true, matches: Object.freeze(result.matches.filter((match) => match.status === "scheduled").sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id))) };
}

export async function getTacticsDetail(teamId: string, matchId: string, userId: string, canManage: boolean, dependencies: Dependencies = {}): Promise<TacticsDetailResult> {
  if (!isUuid(matchId)) return { ok: false, error: "not_found" };
  try {
    const supabase = await client(dependencies.supabase);
    const matches = await (dependencies.listMatches ?? listMatches)(teamId, userId);
    if (!matches.ok) return { ok: false, error: "server" };
    const match = matches.matches.find((candidate) => candidate.id === matchId && (candidate.status === "scheduled" || candidate.status === "completed"));
    if (!match) return { ok: false, error: "not_found" };
    const canEdit = canManage && match.status === "scheduled";
    let query = supabase.from("match_tactics").select(TACTICS_SELECT).eq("team_id", teamId).eq("match_id", matchId);
    if (!canEdit) query = query.eq("status", "applied");
    const result = await query.order("updated_at", { ascending: false }).order("id", { ascending: true }).limit(100);
    if (result.error || !Array.isArray(result.data) || result.data.length > 100 || !result.data.every(tacticRow)) return { ok: false, error: "server" };
    const rows = result.data as unknown as TacticRow[];
    if (!canEdit && rows.some((row) => row.status !== "applied")) return { ok: false, error: "server" };
    if (new Set(rows.map((row) => row.id)).size !== rows.length || new Set(rows.map((row) => `${row.mode}:${row.version}`)).size !== rows.length) return { ok: false, error: "server" };
    const referencedUserIds = [...new Set(rows.flatMap((row) => row.slots.map((slot) => slot.user_id)))];
    if (referencedUserIds.length > MAX_HISTORICAL_PLAYERS) return { ok: false, error: "server" };
    const players = match.status === "scheduled"
      ? await listActiveTacticsPlayers(supabase, teamId)
      : await listHistoricalTacticsPlayers(supabase, teamId, referencedUserIds);
    if (!players) return { ok: false, error: "server" };
    if (match.status === "scheduled") {
      const active = new Set(players.map((player) => player.userId));
      if (rows.some((row) => row.slots.some((slot) => !active.has(slot.user_id)))) return { ok: false, error: "server" };
    }
    const tactics: MatchTactic[] = rows.map((row) => Object.freeze({ id: row.id, mode: row.mode, formation: row.formation, instructions: row.instructions, version: row.version, pressing: row.pressing, defensiveLine: row.defensive_line, status: row.status, updatedAt: row.updated_at, appliedAt: row.applied_at, slots: Object.freeze(row.slots.map((slot): TacticSlot => Object.freeze({ userId: slot.user_id, slotKind: slot.slot_kind, slotKey: slot.slot_key, roleLabel: slot.role_label, shirtNumber: slot.shirt_number, x: slot.x, y: slot.y }))) }));
    return { ok: true, detail: Object.freeze({ match, players: Object.freeze(players), tactics: Object.freeze(tactics) }) };
  } catch { return { ok: false, error: "server" }; }
}
