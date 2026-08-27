import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "../matches/model";
import { isIsoTimestamp } from "../matches/validation";
import type { Database } from "../supabase/database.types";
import type { NotificationListResult, TeamNotification } from "./model";

const LIMIT = 20;
type Client = Pick<SupabaseClient<Database>, "from">;
type Row = { id: string; team_id: string; user_id: string; type: "match_invitation" | "match_reminder"; source_entity: "match"; source_id: string; title: string; body: string; target_path: string; read_at: string | null; created_at: string };

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value === value.trim() && value.length >= 1 && value.length <= max; }
function row(value: unknown, teamId: string, userId: string, slug: string): value is Row {
  if (!record(value)) return false;
  const target = `/teams/${encodeURIComponent(slug)}/matches/${String(value.source_id)}`;
  return isUuid(value.id) && value.team_id === teamId && value.user_id === userId
    && (value.type === "match_invitation" || value.type === "match_reminder")
    && value.source_entity === "match" && isUuid(value.source_id)
    && text(value.title, 160) && text(value.body, 500) && value.target_path === target
    && (value.read_at === null || isIsoTimestamp(value.read_at)) && isIsoTimestamp(value.created_at);
}

export async function listTeamNotifications(teamId: string, userId: string, slug: string, supplied?: Client): Promise<NotificationListResult> {
  try {
    const supabase = supplied ?? await (await import("../supabase/server")).createServerSupabaseClient();
    const result = await supabase.from("notifications")
      .select("id,team_id,user_id,type,source_entity,source_id,title,body,target_path,read_at,created_at")
      .eq("team_id", teamId).eq("user_id", userId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(LIMIT + 1);
    if (result.error || !Array.isArray(result.data) || result.data.length > LIMIT || !result.data.every((value) => row(value, teamId, userId, slug))) return { ok: false, error: "server" };
    const rows = result.data as unknown as Row[];
    if (new Set(rows.map(({ id }) => id)).size !== rows.length) return { ok: false, error: "server" };
    const notifications: TeamNotification[] = rows.map((value) => Object.freeze({ id: value.id, type: value.type, sourceId: value.source_id, title: value.title, body: value.body, targetPath: value.target_path, readAt: value.read_at, createdAt: value.created_at }));
    return { ok: true, notifications: Object.freeze(notifications), unreadCount: notifications.filter(({ readAt }) => readAt === null).length };
  } catch { return { ok: false, error: "server" }; }
}
