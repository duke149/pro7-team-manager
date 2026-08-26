import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid, type MatchListResult } from "../matches/model";
import { listMatches } from "../matches/queries";
import { isIsoTimestamp } from "../matches/validation";
import type { SquadFilters } from "../squad/filters";
import type { SquadListResult } from "../squad/model";
import { listSquadPlayers } from "../squad/queries";
import type { Database } from "../supabase/database.types";
import { TACTIC_FORMATIONS, TACTIC_LEVELS, TACTIC_MODES, TACTIC_ROLES, type MatchTactic, type TacticFormation, type TacticLevel, type TacticMode, type TacticRole, type TacticSlot, type TacticsDetailResult, type TacticsMatchesResult, type TacticsPlayer } from "./model";

const TACTICS_SELECT = "id,mode,formation,instructions,version,pressing,defensive_line,status,updated_at,applied_at,slots:lineup_slots(user_id,slot_kind,slot_key,role_label,shirt_number,x,y)";
const ACTIVE_FILTERS: SquadFilters = Object.freeze({ q: "", searchPattern: null, position: "all", status: "active", sort: "name", direction: "asc" });
type Dependencies = { supabase?: Pick<SupabaseClient<Database>, "from">; listMatches?: (teamId: string, userId: string) => Promise<MatchListResult>; listSquadPlayers?: (teamId: string, filters: SquadFilters) => Promise<SquadListResult> };
type SlotRow = { user_id: string; slot_kind: "starter" | "bench"; slot_key: string; role_label: TacticRole; shirt_number: number | null; x: number; y: number };
type TacticRow = { id: string; mode: TacticMode; formation: TacticFormation; instructions: string | null; version: number; pressing: TacticLevel; defensive_line: TacticLevel; status: "draft" | "applied"; updated_at: string; applied_at: string | null; slots: SlotRow[] };

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
async function client(supplied?: Pick<SupabaseClient<Database>, "from">) { if (supplied) return supplied; const { createServerSupabaseClient } = await import("../supabase/server"); return createServerSupabaseClient(); }

export async function listScheduledTacticsMatches(teamId: string, userId: string, dependencies: Dependencies = {}): Promise<TacticsMatchesResult> {
  const result = await (dependencies.listMatches ?? listMatches)(teamId, userId);
  if (!result.ok) return result;
  return { ok: true, matches: Object.freeze(result.matches.filter((match) => match.status === "scheduled").sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id))) };
}

export async function getTacticsDetail(teamId: string, matchId: string, userId: string, canManage: boolean, dependencies: Dependencies = {}): Promise<TacticsDetailResult> {
  if (!isUuid(matchId)) return { ok: false, error: "not_found" };
  try {
    const [matches, squad] = await Promise.all([(dependencies.listMatches ?? listMatches)(teamId, userId), (dependencies.listSquadPlayers ?? listSquadPlayers)(teamId, ACTIVE_FILTERS)]);
    if (!matches.ok || !squad.ok) return { ok: false, error: "server" };
    const match = matches.matches.find((candidate) => candidate.id === matchId && candidate.status === "scheduled");
    if (!match) return { ok: false, error: "not_found" };
    const supabase = await client(dependencies.supabase);
    let query = supabase.from("match_tactics").select(TACTICS_SELECT).eq("team_id", teamId).eq("match_id", matchId);
    if (!canManage) query = query.eq("status", "applied");
    const result = await query.order("updated_at", { ascending: false }).order("id", { ascending: true }).limit(100);
    if (result.error || !Array.isArray(result.data) || result.data.length > 100 || !result.data.every(tacticRow)) return { ok: false, error: "server" };
    const rows = result.data as unknown as TacticRow[];
    if (!canManage && rows.some((row) => row.status !== "applied")) return { ok: false, error: "server" };
    if (new Set(rows.map((row) => row.id)).size !== rows.length || new Set(rows.map((row) => `${row.mode}:${row.version}`)).size !== rows.length) return { ok: false, error: "server" };
    const players: TacticsPlayer[] = squad.players.map((player) => Object.freeze({ userId: player.userId, displayName: player.displayName, shirtNumber: player.shirtNumber, officialPosition: player.officialPosition }));
    const active = new Set(players.map((player) => player.userId));
    if (rows.some((row) => row.slots.some((slot) => !active.has(slot.user_id)))) return { ok: false, error: "server" };
    const tactics: MatchTactic[] = rows.map((row) => Object.freeze({ id: row.id, mode: row.mode, formation: row.formation, instructions: row.instructions, version: row.version, pressing: row.pressing, defensiveLine: row.defensive_line, status: row.status, updatedAt: row.updated_at, appliedAt: row.applied_at, slots: Object.freeze(row.slots.map((slot): TacticSlot => Object.freeze({ userId: slot.user_id, slotKind: slot.slot_kind, slotKey: slot.slot_key, roleLabel: slot.role_label, shirtNumber: slot.shirt_number, x: slot.x, y: slot.y }))) }));
    return { ok: true, detail: Object.freeze({ match, players: Object.freeze(players), tactics: Object.freeze(tactics) }) };
  } catch { return { ok: false, error: "server" }; }
}
