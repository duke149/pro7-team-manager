import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type { TeamAccessContext } from "../teams/context";
import type { PermissionCode } from "../teams/permissions";
import { isUuid } from "./model";
import { INVITE_RPC_BATCH_SIZE, validateAttendancePayload, validateCreateMatchPayload, validateMatchMutationPayload, type CreateMatchPayload, type MatchMutationPayload } from "./validation";
import "./server-only";

const MAX_REQUEST_BYTES = 16 * 1024;
type Target = Readonly<{ slug: string; matchId?: string }>;
type Guard = (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
export type MatchActionDependencies = { requireTeamPermission: Guard; supabase: Pick<SupabaseClient<Database>, "rpc"> };

function failure(status: number, code: string, message: string, fieldErrors?: Readonly<Record<string, string>>) { return Response.json({ ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) }, { status }); }
function preflight(request: Request): Response | null {
  let sameOrigin = false;
  try { sameOrigin = request.headers.get("origin") === new URL(request.url).origin || (!request.headers.get("origin") && request.headers.get("sec-fetch-site") === "same-origin"); } catch { sameOrigin = false; }
  if (!sameOrigin) return failure(403, "forbidden", "Yêu cầu không được phép.");
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return failure(415, "content_type", "Định dạng yêu cầu không được hỗ trợ.");
  return null;
}
async function body(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared) && Number(declared) > MAX_REQUEST_BYTES) return { ok: false, status: 413 };
  try { const text = await request.text(); if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return { ok: false, status: 413 }; return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false, status: 400 }; }
}
async function defaults(): Promise<MatchActionDependencies> { const [{ requireTeamPermission }, { createServerSupabaseClient }] = await Promise.all([import("../teams/context"), import("../supabase/server")]); return { requireTeamPermission, supabase: await createServerSupabaseClient() }; }
function rpcFailure(error: { code?: string }) {
  switch (error.code) {
    case "40001": return failure(409, "stale", "Dữ liệu đã thay đổi. Vui lòng tải lại.");
    case "55000": return failure(409, "lifecycle", "Trận đấu không còn ở trạng thái cho phép.");
    case "42501": case "28000": return failure(403, "forbidden", "Bạn không có quyền thực hiện thao tác này.");
    case "P0002": return failure(404, "not_found", "Không tìm thấy trận đấu hoặc lời mời.");
    case "23503": return failure(422, "validation", "Thành viên được mời không còn hoạt động.");
    case "22023": return failure(422, "validation", "Dữ liệu trận đấu không hợp lệ.");
    default: return failure(500, "server", "Không thể cập nhật trận đấu. Vui lòng thử lại.");
  }
}
async function authorize(slug: string, permission: PermissionCode, supplied?: MatchActionDependencies) { const dependencies = supplied ?? await defaults(); return { dependencies, context: await dependencies.requireTeamPermission(slug, permission) }; }
async function invoke(dependencies: MatchActionDependencies, name: string, arguments_: Record<string, unknown>, successStatus = 200) { const rpc = dependencies.supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>; const result = await rpc.call(dependencies.supabase, name, arguments_); return result.error ? rpcFailure(result.error) : Response.json({ ok: true, ...(name === "manage_match" && typeof result.data === "string" ? { matchId: result.data } : name === "invite_match_attendance" && typeof result.data === "number" ? { invited: result.data } : {}) }, { status: successStatus }); }
async function inviteInBatches(dependencies: MatchActionDependencies, teamId: string, matchId: string, userIds: readonly string[]) {
  const rpc = dependencies.supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;
  let invited = 0;
  for (let offset = 0; offset < userIds.length; offset += INVITE_RPC_BATCH_SIZE) {
    const batch = userIds.slice(offset, offset + INVITE_RPC_BATCH_SIZE);
    const result = await rpc.call(dependencies.supabase, "invite_match_attendance", { p_team_id: teamId, p_match_id: matchId, p_user_ids: batch });
    if (result.error) return rpcFailure(result.error);
    if (!Number.isInteger(result.data) || result.data !== batch.length) return failure(500, "server", "Không thể cập nhật trận đấu. Vui lòng thử lại.");
    invited += result.data;
  }
  return Response.json({ ok: true, invited });
}
function manageArguments(teamId: string, matchId: string | null, payload: CreateMatchPayload | MatchMutationPayload) {
  return { p_action: "action" in payload ? payload.action : "create", p_team_id: teamId, p_match_id: matchId, p_opponent: "opponent" in payload ? payload.opponent : null, p_starts_at: "startsAt" in payload ? payload.startsAt : null, p_venue: "venue" in payload ? payload.venue : null, p_is_home: "isHome" in payload ? payload.isHome : null, p_rsvp_deadline: "rsvpDeadline" in payload ? payload.rsvpDeadline : null, p_team_score: "teamScore" in payload ? payload.teamScore : null, p_opponent_score: "opponentScore" in payload ? payload.opponentScore : null, p_expected_updated_at: "expectedUpdatedAt" in payload ? payload.expectedUpdatedAt : null };
}
type RequestPayload =
  | { response: Response; value?: never }
  | { value: unknown; response?: never };

async function requestPayload(request: Request): Promise<RequestPayload> {
  const rejected = preflight(request);
  if (rejected) return { response: rejected };
  const parsed = await body(request);
  if (!parsed.ok) {
    return {
      response: parsed.status === 413
        ? failure(413, "too_large", "Yêu cầu quá lớn.")
        : failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ."),
    };
  }
  return { value: parsed.value };
}

export async function createMatch(request: Request, target: Readonly<{ slug: string }>, supplied?: MatchActionDependencies): Promise<Response> {
  try { const input = await requestPayload(request); if (input.response) return input.response; const parsed = validateCreateMatchPayload(input.value); if (!parsed.ok) return parsed.kind === "malformed" ? failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.") : failure(422, "validation", "Vui lòng kiểm tra thông tin trận đấu.", parsed.fieldErrors); const { dependencies, context } = await authorize(target.slug, "matches.manage", supplied); if (!context) return failure(403, "forbidden", "Bạn không có quyền quản lý trận đấu."); return invoke(dependencies, "manage_match", manageArguments(context.team.id, null, parsed.value), 201); } catch { return failure(500, "server", "Không thể tạo trận đấu. Vui lòng thử lại."); }
}
export async function mutateMatch(request: Request, target: Required<Target>, supplied?: MatchActionDependencies): Promise<Response> {
  try { const input = await requestPayload(request); if (input.response) return input.response; if (!isUuid(target.matchId)) return failure(404, "not_found", "Không tìm thấy trận đấu."); const parsed = validateMatchMutationPayload(input.value); if (!parsed.ok) return parsed.kind === "malformed" ? failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.") : failure(422, "validation", "Vui lòng kiểm tra thông tin trận đấu.", parsed.fieldErrors); const { dependencies, context } = await authorize(target.slug, "matches.manage", supplied); if (!context) return failure(403, "forbidden", "Bạn không có quyền quản lý trận đấu."); return invoke(dependencies, "manage_match", manageArguments(context.team.id, target.matchId, parsed.value)); } catch { return failure(500, "server", "Không thể cập nhật trận đấu. Vui lòng thử lại."); }
}
export async function mutateMatchAttendance(request: Request, target: Required<Target>, supplied?: MatchActionDependencies): Promise<Response> {
  try { const input = await requestPayload(request); if (input.response) return input.response; if (!isUuid(target.matchId)) return failure(404, "not_found", "Không tìm thấy trận đấu."); const parsed = validateAttendancePayload(input.value); if (!parsed.ok) return parsed.kind === "malformed" ? failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.") : failure(422, "validation", "Vui lòng kiểm tra phản hồi tham gia.", parsed.fieldErrors); const permission = parsed.value.action === "invite" ? "matches.manage" : "matches.respond"; const { dependencies, context } = await authorize(target.slug, permission, supplied); if (!context) return failure(403, "forbidden", "Bạn không có quyền cập nhật danh sách tham gia."); return parsed.value.action === "invite" ? inviteInBatches(dependencies, context.team.id, target.matchId, parsed.value.userIds) : invoke(dependencies, "respond_match_attendance", { p_team_id: context.team.id, p_match_id: target.matchId, p_user_id: context.userId, p_status: parsed.value.status, p_note: parsed.value.note, p_expected_updated_at: parsed.value.expectedUpdatedAt }); } catch { return failure(500, "server", "Không thể cập nhật danh sách tham gia. Vui lòng thử lại."); }
}
