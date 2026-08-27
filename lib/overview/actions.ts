import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "../matches/model";
import type { Database } from "../supabase/database.types";
import type { TeamAccessContext } from "../teams/context";
import type { PermissionCode } from "../teams/permissions";
import "../matches/server-only";

const MAX_REQUEST_BYTES = 256;

type Target = Readonly<{ slug: string; matchId: string }>;
type Guard = (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;

export type OverviewActionDependencies = {
  requireTeamPermission: Guard;
  supabase: Pick<SupabaseClient<Database>, "rpc">;
};

function failure(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, code, message }, { status });
}

function preflight(request: Request): Response | null {
  let sameOrigin = false;
  try {
    sameOrigin = request.headers.get("origin") === new URL(request.url).origin
      || (!request.headers.get("origin") && request.headers.get("sec-fetch-site") === "same-origin");
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) return failure(403, "forbidden", "Yêu cầu không được phép.");
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return failure(415, "content_type", "Định dạng yêu cầu không được hỗ trợ.");
  }
  return null;
}

async function validateEmptyBody(request: Request): Promise<Response | null> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared) && Number(declared) > MAX_REQUEST_BYTES) {
    return failure(413, "too_large", "Yêu cầu quá lớn.");
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
      return failure(413, "too_large", "Yêu cầu quá lớn.");
    }
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length !== 0) {
      return failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.");
    }
    return null;
  } catch {
    return failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.");
  }
}

async function defaults(): Promise<OverviewActionDependencies> {
  const [{ requireTeamPermission }, { createServerSupabaseClient }] = await Promise.all([
    import("../teams/context"),
    import("../supabase/server"),
  ]);
  return { requireTeamPermission, supabase: await createServerSupabaseClient() };
}

function rpcFailure(error: { code?: string }): Response {
  switch (error.code) {
    case "42501": case "28000":
      return failure(403, "forbidden", "Bạn không có quyền nhắc thành viên.");
    case "P0002":
      return failure(404, "not_found", "Không tìm thấy trận đấu.");
    case "55000": case "23503": case "22023":
      return failure(409, "lifecycle", "Danh sách chờ đã thay đổi. Vui lòng tải lại.");
    default:
      return failure(500, "server", "Không thể gửi lời nhắc. Vui lòng thử lại.");
  }
}

export async function remindPendingAttendance(
  request: Request,
  target: Target,
  supplied?: OverviewActionDependencies,
): Promise<Response> {
  try {
    const rejected = preflight(request);
    if (rejected) return rejected;
    const invalidBody = await validateEmptyBody(request);
    if (invalidBody) return invalidBody;
    if (!isUuid(target.matchId)) return failure(404, "not_found", "Không tìm thấy trận đấu.");

    const dependencies = supplied ?? await defaults();
    const context = await dependencies.requireTeamPermission(target.slug, "matches.manage");
    if (!context) return failure(403, "forbidden", "Bạn không có quyền nhắc thành viên.");

    const result = await dependencies.supabase.rpc("remind_match_attendance", {
      p_team_id: context.team.id,
      p_match_id: target.matchId,
    });
    if (result.error) return rpcFailure(result.error);
    if (!Number.isInteger(result.data) || result.data < 0) {
      return failure(500, "server", "Không thể xác nhận toàn bộ lời nhắc.");
    }
    return Response.json({ ok: true, reminded: result.data });
  } catch {
    return failure(500, "server", "Không thể gửi lời nhắc. Vui lòng thử lại.");
  }
}
