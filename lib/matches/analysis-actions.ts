import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type { TeamAccessContext } from "../teams/context";
import type { PermissionCode } from "../teams/permissions";
import { validateMatchAnalysisPayload } from "./analysis-validation";
import { isUuid } from "./model";
import { isIsoTimestamp } from "./validation";
import "./server-only";

// Supports the documented 200 events even when every 500-code-point note uses
// four-byte UTF-8 characters, while still placing a strict cap on the route.
const MAX_ANALYSIS_REQUEST_BYTES = 512 * 1024;

type Guard = (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
export type MatchAnalysisActionDependencies = {
  requireTeamPermission: Guard;
  supabase: Pick<SupabaseClient<Database>, "rpc">;
};

function failure(status: number, code: string, message: string, fieldErrors?: Readonly<Record<string, string>>) {
  return Response.json({ ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) }, { status });
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

async function parseBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared) && Number(declared) > MAX_ANALYSIS_REQUEST_BYTES) {
    return { ok: false, response: failure(413, "too_large", "Yêu cầu quá lớn.") };
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_ANALYSIS_REQUEST_BYTES) {
      return { ok: false, response: failure(413, "too_large", "Yêu cầu quá lớn.") };
    }
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.") };
  }
}

async function defaults(): Promise<MatchAnalysisActionDependencies> {
  const [{ requireTeamPermission }, { createServerSupabaseClient }] = await Promise.all([
    import("../teams/context"),
    import("../supabase/server"),
  ]);
  return { requireTeamPermission, supabase: await createServerSupabaseClient() };
}

function rpcFailure(error: { code?: string }): Response {
  switch (error.code) {
    case "40001": return failure(409, "stale", "Dữ liệu đã thay đổi. Bản nháp của bạn vẫn được giữ lại; hãy tải lại trước khi lưu tiếp.");
    case "55000": return failure(409, "lifecycle", "Chỉ có thể lưu phân tích cho trận đấu đã hoàn tất.");
    case "42501":
    case "28000": return failure(403, "forbidden", "Bạn không có quyền lưu phân tích trận đấu.");
    case "P0002": return failure(404, "not_found", "Không tìm thấy trận đấu.");
    case "22023":
    case "23503":
    case "23505":
    case "23514": return failure(422, "validation", "Dữ liệu phân tích trận đấu không hợp lệ.");
    default: return failure(500, "server", "Không thể lưu phân tích trận đấu. Vui lòng thử lại.");
  }
}

export async function saveMatchAnalysis(
  request: Request,
  target: Readonly<{ slug: string; matchId: string }>,
  supplied?: MatchAnalysisActionDependencies,
): Promise<Response> {
  try {
    const rejected = preflight(request);
    if (rejected) return rejected;
    if (!isUuid(target.matchId)) return failure(404, "not_found", "Không tìm thấy trận đấu.");
    const body = await parseBody(request);
    if (!body.ok) return body.response;
    const parsed = validateMatchAnalysisPayload(body.value);
    if (!parsed.ok) {
      return parsed.kind === "malformed"
        ? failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.")
        : failure(422, "validation", "Vui lòng kiểm tra dữ liệu phân tích.", parsed.fieldErrors);
    }
    const dependencies = supplied ?? await defaults();
    const context = await dependencies.requireTeamPermission(target.slug, "matches.manage");
    if (!context) return failure(403, "forbidden", "Bạn không có quyền lưu phân tích trận đấu.");
    const rpc = dependencies.supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string } | null }>;
    const result = await rpc.call(dependencies.supabase, "manage_match_analysis", {
      p_team_id: context.team.id,
      p_match_id: target.matchId,
      p_events: parsed.value.events,
      p_player_stats: parsed.value.playerStats,
      p_team_metrics: parsed.value.teamMetrics,
      p_expected_updated_at: parsed.value.expectedUpdatedAt,
    });
    if (result.error) return rpcFailure(result.error);
    if (!isIsoTimestamp(result.data)) return failure(500, "server", "Không thể lưu phân tích trận đấu. Vui lòng thử lại.");
    return Response.json({ ok: true, updatedAt: result.data });
  } catch {
    return failure(500, "server", "Không thể lưu phân tích trận đấu. Vui lòng thử lại.");
  }
}
