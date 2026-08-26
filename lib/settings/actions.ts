import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type { TeamAccessContext } from "../teams/context";
import type { PermissionCode } from "../teams/permissions";
import { validateSettingsMutation } from "./validation";

type Guard = (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
export type SettingsActionDependencies = { requireTeamPermission: Guard; supabase: SupabaseClient<Database> };
function failure(status: number, code: string, message: string, fieldErrors?: Readonly<Record<string, string>>) { return Response.json({ ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) }, { status }); }
function sameOrigin(request: Request) { try { return request.headers.get("origin") === new URL(request.url).origin || (!request.headers.get("origin") && request.headers.get("sec-fetch-site") === "same-origin"); } catch { return false; } }
async function defaults(): Promise<SettingsActionDependencies> { const [{ requireTeamPermission }, { createServerSupabaseClient }] = await Promise.all([import("../teams/context"), import("../supabase/server")]); return { requireTeamPermission, supabase: await createServerSupabaseClient() }; }

export async function mutateAdminSettings(request: Request, slug: string, supplied?: SettingsActionDependencies): Promise<Response> {
  try {
    if (!sameOrigin(request)) return failure(403, "forbidden", "Yêu cầu không được phép.");
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return failure(415, "content_type", "Định dạng yêu cầu không được hỗ trợ.");
    const text = await request.text(); if (new TextEncoder().encode(text).byteLength > 16 * 1024) return failure(413, "too_large", "Yêu cầu quá lớn.");
    let body: unknown; try { body = JSON.parse(text); } catch { return failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ."); }
    const parsed = validateSettingsMutation(body); if (!parsed.ok) return failure(422, "validation", "Vui lòng kiểm tra dữ liệu.", parsed.fieldErrors);
    const permission: PermissionCode = parsed.value.action === "team" ? "team.update" : parsed.value.action === "notifications" ? "settings.update" : "team.delete";
    const dependencies = supplied ?? await defaults(); const context = await dependencies.requireTeamPermission(slug, permission); if (!context) return failure(403, "forbidden", "Bạn không có quyền cập nhật cài đặt.");
    if (parsed.value.action === "team") {
      const result = await dependencies.supabase.from("teams").update({ name: parsed.value.name, slug: parsed.value.slug }).eq("id", context.team.id).select("id,name,slug").maybeSingle();
      return !result.error && result.data?.id === context.team.id ? Response.json({ ok: true, team: result.data }) : failure(result.error?.code === "23505" ? 409 : 500, result.error?.code === "23505" ? "conflict" : "server", result.error?.code === "23505" ? "Slug đã được sử dụng." : "Không thể cập nhật đội.");
    }
    if (parsed.value.action === "notifications") {
      const settings = { notifications: { matchInvitations: parsed.value.matchInvitations, matchReminders: parsed.value.matchReminders, reminderHoursBefore: parsed.value.reminderHoursBefore } };
      const result = await dependencies.supabase.from("team_settings").update({ settings }).eq("team_id", context.team.id).select("team_id").maybeSingle();
      return !result.error && result.data?.team_id === context.team.id ? Response.json({ ok: true }) : failure(500, "server", "Không thể cập nhật thông báo.");
    }
    if (parsed.value.confirmation !== context.team.name || parsed.value.slugConfirmation !== context.team.slug) return failure(422, "confirmation", "Xác nhận không khớp tên và slug đội.");
    const result = await dependencies.supabase.from("teams").delete().eq("id", context.team.id).select("id").maybeSingle();
    return !result.error && result.data?.id === context.team.id ? Response.json({ ok: true, redirectTo: "/" }) : failure(500, "server", "Không thể xóa đội.");
  } catch { return failure(500, "server", "Không thể cập nhật cài đặt."); }
}
