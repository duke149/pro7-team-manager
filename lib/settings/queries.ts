import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "../matches/model";
import { isIsoTimestamp } from "../matches/validation";
import type { Database, Json } from "../supabase/database.types";
import { isPermissionCode, type PermissionCode } from "../teams/permissions";
import type { AdminSettingsResult, AuditEvent, SettingsRole, TeamNotificationSettings } from "./model";

type Client = SupabaseClient<Database>;
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function notificationSettings(value: Json): TeamNotificationSettings | null {
  if (!record(value)) return null;
  const source = record(value.notifications) ? value.notifications : {};
  const invitations = source.matchInvitations ?? true;
  const reminders = source.matchReminders ?? true;
  const hours = source.reminderHoursBefore ?? 24;
  return typeof invitations === "boolean" && typeof reminders === "boolean" && Number.isInteger(hours) && Number(hours) >= 1 && Number(hours) <= 168 ? { matchInvitations: invitations, matchReminders: reminders, reminderHoursBefore: Number(hours) } : null;
}

export async function loadAdminSettings(teamId: string, supplied?: Client): Promise<AdminSettingsResult> {
  try {
    const supabase = supplied ?? await (await import("../supabase/server")).createServerSupabaseClient();
    const auditRpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    const [settings, roles, permissions, memberships, audit] = await Promise.all([
      supabase.from("team_settings").select("team_id,settings").eq("team_id", teamId).maybeSingle(),
      supabase.from("roles").select("id,name,slug,is_system").eq("team_id", teamId).order("slug", { ascending: true }).limit(101),
      supabase.from("role_permissions").select("role_id,permission_code").order("role_id", { ascending: true }).order("permission_code", { ascending: true }).limit(1001),
      supabase.from("memberships").select("user_id,status").eq("team_id", teamId).limit(1001),
      auditRpc.call(supabase, "get_team_audit_events", { p_team_id: teamId, p_limit: 50 }),
    ]);
    if (settings.error || !settings.data || settings.data.team_id !== teamId || roles.error || permissions.error || memberships.error || audit.error || !Array.isArray(roles.data) || roles.data.length > 100 || !Array.isArray(permissions.data) || permissions.data.length > 1000 || !Array.isArray(memberships.data) || memberships.data.length > 1000 || !Array.isArray(audit.data) || audit.data.length > 50) return { ok: false, error: "server" };
    const parsedSettings = notificationSettings(settings.data.settings);
    if (!parsedSettings) return { ok: false, error: "server" };
    const roleIds = new Set<string>();
    const permissionMap = new Map<string, PermissionCode[]>();
    for (const item of permissions.data) { if (!isUuid(item.role_id) || !isPermissionCode(item.permission_code)) return { ok: false, error: "server" }; (permissionMap.get(item.role_id) ?? (permissionMap.set(item.role_id, []), permissionMap.get(item.role_id)!)).push(item.permission_code); }
    const parsedRoles: SettingsRole[] = [];
    for (const role of roles.data) { if (!isUuid(role.id) || roleIds.has(role.id) || typeof role.name !== "string" || !role.name.trim() || typeof role.slug !== "string" || typeof role.is_system !== "boolean") return { ok: false, error: "server" }; roleIds.add(role.id); parsedRoles.push({ id: role.id, name: role.name, slug: role.slug, isSystem: role.is_system, permissions: Object.freeze(permissionMap.get(role.id) ?? []) }); }
    const audits: AuditEvent[] = [];
    for (const value of audit.data) { if (!record(value) || !Number.isSafeInteger(value.event_id) || !isIsoTimestamp(value.occurred_at) || !(value.actor_user_id === null || isUuid(value.actor_user_id)) || !(value.actor_display_name === null || typeof value.actor_display_name === "string") || typeof value.table_name !== "string" || !["INSERT", "UPDATE", "DELETE"].includes(String(value.action)) || !record(value.row_key)) return { ok: false, error: "server" }; audits.push({ id: Number(value.event_id), occurredAt: String(value.occurred_at), actorUserId: value.actor_user_id as string | null, actorDisplayName: value.actor_display_name as string | null, tableName: value.table_name, action: value.action as AuditEvent["action"], rowKey: Object.freeze({ ...value.row_key }) }); }
    let activeMembers = 0; let inactiveMembers = 0; const memberIds = new Set<string>();
    for (const member of memberships.data) { if (!isUuid(member.user_id) || memberIds.has(member.user_id) || (member.status !== "active" && member.status !== "inactive")) return { ok: false, error: "server" }; memberIds.add(member.user_id); if (member.status === "active") activeMembers += 1; else inactiveMembers += 1; }
    return { ok: true, data: Object.freeze({ notificationSettings: Object.freeze(parsedSettings), activeMembers, inactiveMembers, roles: Object.freeze(parsedRoles), auditEvents: Object.freeze(audits) }) };
  } catch { return { ok: false, error: "server" }; }
}
