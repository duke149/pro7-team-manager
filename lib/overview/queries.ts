import type { SupabaseClient } from "@supabase/supabase-js";

import type { MatchListResult } from "../matches/model";
import { isUuid } from "../matches/model";
import { listMatches as defaultListMatches } from "../matches/queries";
import { isIsoTimestamp } from "../matches/validation";
import type { Database } from "../supabase/database.types";
import type { ManagedTeamNewsPost, TeamNewsStatus } from "../news/model";
import {
  aggregateAttendance,
  aggregateResults,
  aggregateTopScorer,
  buildCountdown,
  selectNextMatch,
  selectUpcomingCalendar,
} from "./aggregates";
import type { OverviewAccess, OverviewGoalRow, OverviewNewsPost, OverviewResult } from "./model";
import "../matches/server-only";

const MAX_STAT_ROWS = 1000;
const NEWS_LIMIT = 25;
const MANAGED_NEWS_LIMIT = 50;
const PROFILE_PAGE_SIZE = 100;

type Dependencies = {
  supabase?: SupabaseClient<Database>;
  listMatches?: (teamId: string, userId: string) => Promise<MatchListResult>;
};

type GoalRow = { match_id: string; user_id: string; goals: number };
type NewsRow = { id: string; title: string; body: string; status: TeamNewsStatus; published_at: string | null; updated_at: string };
type ProfileRow = { id: string; display_name: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value === value.trim()
    && Array.from(value).length >= 1
    && Array.from(value).length <= maximum;
}

function goalRow(value: unknown): value is GoalRow {
  return isRecord(value)
    && isUuid(value.match_id)
    && isUuid(value.user_id)
    && Number.isInteger(value.goals)
    && (value.goals as number) >= 0
    && (value.goals as number) <= 32_767;
}

function newsRow(value: unknown, now: string, allowFuturePublished: boolean): value is NewsRow {
  if (!(isRecord(value)
    && isUuid(value.id)
    && boundedText(value.title, 160)
    && boundedText(value.body, 5000)
    && (value.status === "draft" || value.status === "published" || value.status === "archived")
    && (value.published_at === null || isIsoTimestamp(value.published_at))
    && isIsoTimestamp(value.updated_at))) return false;
  if (value.status === "draft" && value.published_at !== null) return false;
  if (value.status === "published" && value.published_at === null) return false;
  return allowFuturePublished || value.published_at === null || Date.parse(value.published_at) <= Date.parse(now);
}

function profileRow(value: unknown): value is ProfileRow {
  return isRecord(value)
    && isUuid(value.id)
    && (value.display_name === null || boundedText(value.display_name, 100));
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

async function resolveClient(supplied?: SupabaseClient<Database>): Promise<SupabaseClient<Database>> {
  if (supplied) return supplied;
  const { createServerSupabaseClient } = await import("../supabase/server");
  return createServerSupabaseClient();
}

function scorerCandidateIds(rows: readonly OverviewGoalRow[]): string[] {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.goals);
  const highest = Math.max(0, ...totals.values());
  return highest === 0
    ? []
    : [...totals].filter(([, goals]) => goals === highest).map(([userId]) => userId).sort();
}

async function loadDisplayNames(
  supabase: SupabaseClient<Database>,
  userIds: readonly string[],
): Promise<Map<string, string | null> | null> {
  const names = new Map<string, string | null>();
  for (let offset = 0; offset < userIds.length; offset += PROFILE_PAGE_SIZE) {
    const requested = userIds.slice(offset, offset + PROFILE_PAGE_SIZE);
    const response = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", requested)
      .order("id", { ascending: true })
      .limit(PROFILE_PAGE_SIZE);
    if (response.error
      || !Array.isArray(response.data)
      || response.data.length > PROFILE_PAGE_SIZE
      || !response.data.every(profileRow)) return null;
    const rows = response.data as unknown as ProfileRow[];
    const requestedIds = new Set(requested);
    if (!unique(rows.map(({ id }) => id)) || rows.some(({ id }) => !requestedIds.has(id))) return null;
    for (const row of rows) names.set(row.id, row.display_name);
  }
  return names;
}

export async function loadOverview(
  teamId: string,
  userId: string,
  now: string,
  access: OverviewAccess,
  dependencies: Dependencies = {},
): Promise<OverviewResult> {
  try {
    if (!isIsoTimestamp(now)) return { ok: false, error: "server" };
    const matchesResult: MatchListResult = access.matches
      ? await (dependencies.listMatches ?? defaultListMatches)(teamId, userId)
      : { ok: true, matches: [] };
    if (!matchesResult.ok) return { ok: false, error: "server" };

    const supabase = await resolveClient(dependencies.supabase);
    const statsPromise = access.matches
      ? supabase
        .from("match_player_stats")
        .select("match_id,user_id,goals")
        .eq("team_id", teamId)
        .order("match_id", { ascending: true })
        .order("user_id", { ascending: true })
        .limit(MAX_STAT_ROWS + 1)
      : Promise.resolve({ data: [], error: null });
    const newsPromise = access.news || access.manageNews
      ? (() => {
        let query = supabase
        .from("team_news")
          .select("id,title,body,status,published_at,updated_at")
          .eq("team_id", teamId);
        if (!access.manageNews) query = query.eq("status", "published").lte("published_at", now);
        return query
          .order(access.manageNews ? "updated_at" : "published_at", { ascending: false })
          .order("id", { ascending: false })
          .limit((access.manageNews ? MANAGED_NEWS_LIMIT : NEWS_LIMIT) + 1);
      })()
      : Promise.resolve({ data: [], error: null });
    const [statsResult, newsResult] = await Promise.all([statsPromise, newsPromise]);

    if (statsResult.error
      || newsResult.error
      || !Array.isArray(statsResult.data)
      || statsResult.data.length > MAX_STAT_ROWS
      || !statsResult.data.every(goalRow)
      || !Array.isArray(newsResult.data)
      || newsResult.data.length > (access.manageNews ? MANAGED_NEWS_LIMIT : NEWS_LIMIT)
      || !newsResult.data.every((row) => newsRow(row, now, access.manageNews))) return { ok: false, error: "server" };

    const rawGoalRows = statsResult.data as unknown as GoalRow[];
    const rawNewsRows = newsResult.data as unknown as NewsRow[];
    if (!unique(rawGoalRows.map((row) => `${row.match_id}:${row.user_id}`))
      || !unique(rawNewsRows.map((row) => row.id))) return { ok: false, error: "server" };

    const completedIds = new Set(matchesResult.matches.filter(({ status }) => status === "completed").map(({ id }) => id));
    const goalRows: OverviewGoalRow[] = rawGoalRows
      .filter((row) => completedIds.has(row.match_id))
      .map((row) => Object.freeze({ matchId: row.match_id, userId: row.user_id, goals: row.goals }));
    const displayNames = await loadDisplayNames(supabase, scorerCandidateIds(goalRows));
    if (!displayNames) return { ok: false, error: "server" };

    const nextMatch = selectNextMatch(matchesResult.matches, now);
    const resultStatistics = aggregateResults(matchesResult.matches);
    const news: OverviewNewsPost[] = rawNewsRows
      .filter((row) => row.status === "published" && row.published_at !== null && Date.parse(row.published_at) <= Date.parse(now))
      .map((row) => Object.freeze({ id: row.id, title: row.title, body: row.body, publishedAt: row.published_at! }))
      .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt) || right.id.localeCompare(left.id));
    const managedNews: readonly ManagedTeamNewsPost[] | null = access.manageNews
      ? Object.freeze(rawNewsRows.map((row) => Object.freeze({ id: row.id, title: row.title, body: row.body, status: row.status, publishedAt: row.published_at, updatedAt: row.updated_at })))
      : null;

    return {
      ok: true,
      data: Object.freeze({
        nextMatch,
        countdown: nextMatch ? buildCountdown(nextMatch.startsAt, now) : null,
        attendance: aggregateAttendance(nextMatch),
        statistics: Object.freeze({ ...resultStatistics, topScorer: aggregateTopScorer(goalRows, displayNames) }),
        news: Object.freeze(news),
        managedNews,
        calendar: selectUpcomingCalendar(matchesResult.matches, now),
      }),
    };
  } catch {
    return { ok: false, error: "server" };
  }
}
