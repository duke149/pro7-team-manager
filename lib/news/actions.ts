import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type { TeamAccessContext } from "../teams/context";
import type { PermissionCode } from "../teams/permissions";
import { parseManagedTeamNewsPost } from "./model";
import { validateNewsMutation } from "./validation";

const MAX_REQUEST_BYTES = 24 * 1024;
type Guard = (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
export type NewsActionDependencies = { requireTeamPermission: Guard; supabase: Pick<SupabaseClient<Database>, "rpc"> };

function failure(status: number, code: string, message: string, fieldErrors?: Readonly<Record<string, string>>) { return Response.json({ ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) }, { status }); }
function sameOrigin(request: Request) { try { return request.headers.get("origin") === new URL(request.url).origin || (!request.headers.get("origin") && request.headers.get("sec-fetch-site") === "same-origin"); } catch { return false; } }

async function defaults(): Promise<NewsActionDependencies> {
  const [{ requireTeamPermission }, { createServerSupabaseClient }] = await Promise.all([import("../teams/context"), import("../supabase/server")]);
  return { requireTeamPermission, supabase: await createServerSupabaseClient() };
}

function databaseFailure(code?: string) {
  switch (code) {
    case "40001": return failure(409, "stale", "Tin đội đã thay đổi. Hãy tải lại và thử lại.");
    case "55000": case "23514": return failure(409, "lifecycle", "Trạng thái tin đội không còn phù hợp.");
    case "P0002": return failure(404, "not_found", "Không tìm thấy tin đội.");
    case "42501": case "28000": return failure(403, "forbidden", "Bạn không có quyền quản lý tin đội.");
    case "22023": return failure(422, "validation", "Vui lòng kiểm tra nội dung tin đội.");
    default: return failure(500, "server", "Không thể cập nhật tin đội.");
  }
}

export async function mutateTeamNews(request: Request, slug: string, supplied?: NewsActionDependencies): Promise<Response> {
  try {
    if (!sameOrigin(request)) return failure(403, "forbidden", "Yêu cầu không được phép.");
    if (request.method !== "POST" && request.method !== "PATCH") return failure(405, "method", "Phương thức không được hỗ trợ.");
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return failure(415, "content_type", "Định dạng yêu cầu không được hỗ trợ.");
    const declared = request.headers.get("content-length");
    if (declared && /^\d+$/u.test(declared) && Number(declared) > MAX_REQUEST_BYTES) return failure(413, "too_large", "Yêu cầu quá lớn.");
    const text = await request.text(); if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return failure(413, "too_large", "Yêu cầu quá lớn.");
    let body: unknown; try { body = JSON.parse(text); } catch { return failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ."); }
    const parsed = validateNewsMutation(body); if (!parsed.ok) return failure(422, "validation", "Vui lòng kiểm tra nội dung tin đội.", parsed.fieldErrors);
    if ((request.method === "POST") !== (parsed.value.action === "create")) return failure(405, "method", "Phương thức không phù hợp với thao tác.");
    const dependencies = supplied ?? await defaults(); const context = await dependencies.requireTeamPermission(slug, "news.manage");
    if (!context) return failure(403, "forbidden", "Bạn không có quyền quản lý tin đội.");
    const value = parsed.value;
    const result = await dependencies.supabase.rpc("manage_team_news", {
      p_team_id: context.team.id,
      p_action: value.action,
      p_news_id: value.action === "create" ? null : value.id,
      p_title: value.action === "create" || value.action === "update" ? value.title : null,
      p_body: value.action === "create" || value.action === "update" ? value.body : null,
      p_expected_updated_at: value.action === "create" ? null : value.expectedUpdatedAt,
    } as never);
    if (result.error) return databaseFailure(result.error.code);
    if (!Array.isArray(result.data) || result.data.length !== 1) return failure(500, "server", "Không thể xác nhận tin đội mới.");
    const post = parseManagedTeamNewsPost(result.data[0]); if (!post) return failure(500, "server", "Không thể xác nhận tin đội mới.");
    return Response.json({ ok: true, post }, { status: value.action === "create" ? 201 : 200 });
  } catch { return failure(500, "server", "Không thể cập nhật tin đội."); }
}
