import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import { isIsoTimestamp } from "../matches/validation";
import type {
  SquadFormResult,
  SquadPerformanceResult,
  SquadPlayerPerformance,
} from "./model";
import { isUuid } from "./model";
import "./server-only";

const MATCH_PAGE_SIZE = 50;
const MAX_COMPLETED_MATCHES = 200;
const MATCH_CHUNK_SIZE = 20;
const MAX_VISIBLE_PLAYERS = 48;

type Dependencies = { supabase?: SupabaseClient<Database> };
type MatchRow = {
  id: string;
  starts_at: string;
  team_score: number;
  opponent_score: number;
};
type StatRow = {
  match_id: string;
  user_id: string;
  minutes_played: number;
  goals: number;
  assists: number;
  rating: number | null;
  is_mvp: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function isMatchRow(value: unknown): value is MatchRow {
  return isRecord(value)
    && isUuid(String(value.id))
    && isIsoTimestamp(value.starts_at)
    && integerBetween(value.team_score, 0, 32767)
    && integerBetween(value.opponent_score, 0, 32767);
}

function isStatRow(value: unknown): value is StatRow {
  if (!isRecord(value)
    || !isUuid(String(value.match_id))
    || !isUuid(String(value.user_id))
    || !integerBetween(value.minutes_played, 0, 120)
    || !integerBetween(value.goals, 0, 32767)
    || !integerBetween(value.assists, 0, 32767)
    || typeof value.is_mvp !== "boolean") return false;
  const rating = value.rating;
  if (rating !== null && !(typeof rating === "number" && Number.isFinite(rating)
    && rating >= 0 && rating <= 10
    && Math.abs(rating * 10 - Math.round(rating * 10)) < 1e-9)) return false;
  return value.minutes_played !== 0
    || (value.goals === 0 && value.assists === 0 && rating === null && value.is_mvp === false);
}

async function resolveClient(supplied?: SupabaseClient<Database>): Promise<SupabaseClient<Database>> {
  if (supplied) return supplied;
  const { createServerSupabaseClient } = await import("../supabase/server");
  return createServerSupabaseClient();
}

async function loadCompletedMatches(client: SupabaseClient<Database>, teamId: string): Promise<MatchRow[] | null> {
  const matches: MatchRow[] = [];
  let cursor: string | null = null;
  while (true) {
    let query = client
      .from("matches")
      .select("id,starts_at,team_score,opponent_score")
      .eq("team_id", teamId)
      .eq("status", "completed")
      .order("id", { ascending: true });
    if (cursor) query = query.gt("id", cursor);
    const result = await query.limit(MATCH_PAGE_SIZE);
    if (result.error || !Array.isArray(result.data) || result.data.length > MATCH_PAGE_SIZE
      || !result.data.every(isMatchRow)) return null;
    const rows = result.data as unknown as MatchRow[];
    if (rows.some((row, index) => row.id <= (index === 0 ? cursor ?? "" : rows[index - 1]!.id))) return null;
    if (matches.length + rows.length > MAX_COMPLETED_MATCHES) return null;
    matches.push(...rows);
    if (rows.length < MATCH_PAGE_SIZE) return matches;
    cursor = rows.at(-1)!.id;
  }
}

async function loadStats(
  client: SupabaseClient<Database>,
  teamId: string,
  matches: readonly MatchRow[],
  userIds: readonly string[],
): Promise<StatRow[] | null> {
  const stats: StatRow[] = [];
  const userSet = new Set(userIds);
  for (let offset = 0; offset < matches.length; offset += MATCH_CHUNK_SIZE) {
    const matchIds = matches.slice(offset, offset + MATCH_CHUNK_SIZE).map((match) => match.id);
    const matchSet = new Set(matchIds);
    const maximumRows = matchIds.length * Math.min(100, userIds.length);
    const result = await client
      .from("match_player_stats")
      .select("match_id,user_id,minutes_played,goals,assists,rating,is_mvp")
      .eq("team_id", teamId)
      .in("match_id", matchIds)
      .in("user_id", [...userIds])
      .order("match_id", { ascending: true })
      .order("user_id", { ascending: true })
      .limit(maximumRows + 1);
    if (result.error || !Array.isArray(result.data) || result.data.length > maximumRows
      || !result.data.every(isStatRow)) return null;
    const rows = result.data as unknown as StatRow[];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.match_id}:${row.user_id}`;
      if (!matchSet.has(row.match_id) || !userSet.has(row.user_id) || seen.has(key)) return null;
      seen.add(key);
    }
    stats.push(...rows);
  }
  return stats;
}

function resultForPlayer(userId: string, matches: ReadonlyMap<string, MatchRow>, stats: readonly StatRow[]): SquadPlayerPerformance {
  const rows = stats.filter((row) => row.user_id === userId);
  const appearances = rows
    .filter((row) => row.minutes_played > 0)
    .map((row) => ({ row, match: matches.get(row.match_id)! }))
    .sort((left, right) => right.match.starts_at.localeCompare(left.match.starts_at)
      || right.match.id.localeCompare(left.match.id));
  const rated = appearances.map(({ row }) => row.rating).filter((rating): rating is number => rating !== null);
  const recentForm: SquadFormResult[] = appearances.slice(0, 5).map(({ match }) => (
    match.team_score > match.opponent_score ? "W" : match.team_score === match.opponent_score ? "D" : "L"
  ));
  return Object.freeze({
    userId,
    recorded: rows.length > 0,
    appearances: appearances.length,
    recentForm: Object.freeze(recentForm),
    minutes: rows.reduce((total, row) => total + row.minutes_played, 0),
    goals: rows.reduce((total, row) => total + row.goals, 0),
    assists: rows.reduce((total, row) => total + row.assists, 0),
    mvpCount: rows.reduce((total, row) => total + Number(row.is_mvp), 0),
    averageRating: rated.length === 0
      ? null
      : Math.round((rated.reduce((total, rating) => total + rating, 0) / rated.length) * 10) / 10,
  });
}

export async function listSquadPerformance(
  teamId: string,
  userIds: readonly string[],
  dependencies: Dependencies = {},
): Promise<SquadPerformanceResult> {
  if (userIds.length > MAX_VISIBLE_PLAYERS || !userIds.every(isUuid) || new Set(userIds).size !== userIds.length) {
    return { ok: false, error: "server" };
  }
  if (userIds.length === 0) return Object.freeze({ ok: true, players: Object.freeze([]) });
  try {
    const client = await resolveClient(dependencies.supabase);
    const matches = await loadCompletedMatches(client, teamId);
    if (!matches) return { ok: false, error: "server" };
    if (matches.length === 0) {
      return Object.freeze({
        ok: true,
        players: Object.freeze(userIds.map((userId) => resultForPlayer(userId, new Map(), []))),
      });
    }
    const stats = await loadStats(client, teamId, matches, userIds);
    if (!stats) return { ok: false, error: "server" };
    const matchById = new Map(matches.map((match) => [match.id, match]));
    return Object.freeze({
      ok: true,
      players: Object.freeze(userIds.map((userId) => resultForPlayer(userId, matchById, stats))),
    });
  } catch {
    return { ok: false, error: "server" };
  }
}
