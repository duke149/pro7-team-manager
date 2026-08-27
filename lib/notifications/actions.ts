import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "../matches/model";
import { isIsoTimestamp } from "../matches/validation";
import type { Database } from "../supabase/database.types";

export type NotificationActionDependencies = {
  getCurrentUser: () => Promise<{ id: string } | null>;
  updateReadAt: (id: string, userId: string) => Promise<{ ok: true; readAt: string } | { ok: false }>;
};

function failure(status: number, code: string, message: string) { return Response.json({ ok: false, code, message }, { status }); }
function sameOrigin(request: Request) { try { return request.headers.get("origin") === new URL(request.url).origin || (!request.headers.get("origin") && request.headers.get("sec-fetch-site") === "same-origin"); } catch { return false; } }

async function defaults(): Promise<NotificationActionDependencies> {
  const [{ getCurrentUser }, { createServerSupabaseClient }] = await Promise.all([import("../supabase/auth"), import("../supabase/server")]);
  const supabase = await createServerSupabaseClient();
  return { getCurrentUser, updateReadAt: async (id, userId) => updateReadAt(supabase, id, userId) };
}

async function updateReadAt(supabase: SupabaseClient<Database>, id: string, userId: string): Promise<{ ok: true; readAt: string } | { ok: false }> {
  const readAt = new Date().toISOString();
  const result = await supabase.from("notifications").update({ read_at: readAt }).eq("id", id).eq("user_id", userId).select("id,read_at").maybeSingle();
  return !result.error && result.data?.id === id && isIsoTimestamp(result.data.read_at) ? { ok: true, readAt: result.data.read_at } : { ok: false };
}

export async function markNotificationRead(request: Request, notificationId: string, supplied?: NotificationActionDependencies): Promise<Response> {
  try {
    if (!sameOrigin(request)) return failure(403, "forbidden", "Yêu cầu không được phép.");
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return failure(415, "content_type", "Định dạng yêu cầu không được hỗ trợ.");
    if (!isUuid(notificationId)) return failure(404, "not_found", "Không tìm thấy thông báo.");
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 0) return failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.");
    const dependencies = supplied ?? await defaults();
    const user = await dependencies.getCurrentUser();
    if (!user) return failure(401, "unauthenticated", "Vui lòng đăng nhập lại.");
    const result = await dependencies.updateReadAt(notificationId, user.id);
    return result.ok ? Response.json({ ok: true, readAt: result.readAt }) : failure(404, "not_found", "Không tìm thấy thông báo.");
  } catch { return failure(500, "server", "Không thể cập nhật thông báo."); }
}
