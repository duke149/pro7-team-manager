import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type { TeamAccessContext } from "../teams/context";
import type { PermissionCode } from "../teams/permissions";
import { isUuid } from "../matches/model";
import { isIsoTimestamp } from "../matches/validation";
import { validateTacticsPayload, type SaveTacticPayload } from "./validation";

const MAX_REQUEST_BYTES = 16 * 1024;
type Guard = (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
export type TacticsActionDependencies = {
  requireTeamPermission: Guard;
  supabase: Pick<SupabaseClient<Database>, "from" | "rpc">;
};

function failure(status: number, code: string, message: string, fieldErrors?: Readonly<Record<string, string>>) {
  return Response.json({ ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) }, { status });
}

function preflight(request: Request) {
  let sameOrigin = false;
  try {
    sameOrigin = request.headers.get("origin") === new URL(request.url).origin
      || (!request.headers.get("origin") && request.headers.get("sec-fetch-site") === "same-origin");
  } catch { sameOrigin = false; }
  if (!sameOrigin) return failure(403, "forbidden", "Yêu cầu không được phép.");
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return failure(415, "content_type", "Định dạng yêu cầu không được hỗ trợ.");
  return null;
}

async function parseBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared) && Number(declared) > MAX_REQUEST_BYTES) return { ok: false, response: failure(413, "too_large", "Yêu cầu quá lớn.") };
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return { ok: false, response: failure(413, "too_large", "Yêu cầu quá lớn.") };
    return { ok: true, value: JSON.parse(text) };
  } catch { return { ok: false, response: failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.") }; }
}

async function defaults(): Promise<TacticsActionDependencies> {
  const [{ requireTeamPermission }, { createServerSupabaseClient }] = await Promise.all([import("../teams/context"), import("../supabase/server")]);
  return { requireTeamPermission, supabase: await createServerSupabaseClient() };
}

function rpcFailure(error: { code?: string }) {
  switch (error.code) {
    case "40001": return failure(409, "stale", "Chiến thuật đã thay đổi. Vui lòng tải lại.");
    case "55000": return failure(409, "lifecycle", "Trận đấu hoặc chiến thuật không còn ở trạng thái cho phép.");
    case "42501": case "28000": return failure(403, "forbidden", "Bạn không có quyền quản lý chiến thuật.");
    case "P0002": return failure(404, "not_found", "Không tìm thấy trận đấu hoặc chiến thuật.");
    case "23503": case "23514": case "22023": return failure(422, "validation", "Đội hình không còn hợp lệ.");
    default: return failure(500, "server", "Không thể cập nhật chiến thuật. Vui lòng thử lại.");
  }
}

async function allPlayersAreActive(dependencies: TacticsActionDependencies, teamId: string, payload: SaveTacticPayload) {
  const requested = [...new Set(payload.slots.map((slot) => slot.userId))].sort();
  const result = await dependencies.supabase
    .from("memberships")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("status", "active")
    .in("user_id", requested)
    .order("user_id", { ascending: true })
    .limit(requested.length + 1);
  if (result.error || !Array.isArray(result.data) || result.data.length !== requested.length) return false;
  const returned = result.data.map((row) => row.user_id).sort();
  return returned.every((userId, index) => userId === requested[index]);
}

function parseSavedTactic(value: unknown, expectedId: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 4
    || row.id !== expectedId
    || !Number.isInteger(row.version) || (row.version as number) < 1 || (row.version as number) > 32767
    || !isIsoTimestamp(row.updated_at)
    || row.status !== "draft") return null;
  return Object.freeze({ id: row.id, version: row.version as number, updatedAt: row.updated_at });
}

export async function mutateTactics(
  request: Request,
  target: Readonly<{ slug: string; matchId: string }>,
  supplied?: TacticsActionDependencies,
): Promise<Response> {
  try {
    const rejected = preflight(request);
    if (rejected) return rejected;
    const body = await parseBody(request);
    if (!body.ok) return body.response;
    if (!isUuid(target.matchId)) return failure(404, "not_found", "Không tìm thấy trận đấu.");
    const parsed = validateTacticsPayload(body.value);
    if (!parsed.ok) return parsed.kind === "malformed"
      ? failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.")
      : failure(422, "validation", "Vui lòng kiểm tra đội hình.", parsed.fieldErrors);
    const dependencies = supplied ?? await defaults();
    const context = await dependencies.requireTeamPermission(target.slug, "tactics.manage");
    if (!context) return failure(403, "forbidden", "Bạn không có quyền quản lý chiến thuật.");
    const rpc = dependencies.supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>;
    if (parsed.value.action === "apply") {
      const result = await rpc.call(dependencies.supabase, "apply_match_tactic", {
        p_team_id: context.team.id,
        p_tactic_id: parsed.value.tacticId,
        p_expected_updated_at: parsed.value.expectedUpdatedAt,
      });
      return result.error ? rpcFailure(result.error) : Response.json({ ok: true });
    }
    if (!await allPlayersAreActive(dependencies, context.team.id, parsed.value)) return failure(422, "validation", "Đội hình có cầu thủ không còn hoạt động trong đội.");
    const result = await rpc.call(dependencies.supabase, "save_match_tactic", {
      p_team_id: context.team.id,
      p_match_id: target.matchId,
      p_tactic_id: parsed.value.tacticId,
      p_mode: parsed.value.mode,
      p_formation: parsed.value.formation,
      p_instructions: parsed.value.instructions,
      p_version: parsed.value.version,
      p_pressing: parsed.value.pressing,
      p_defensive_line: parsed.value.defensiveLine,
      p_slots: parsed.value.slots.map((slot) => ({
        user_id: slot.userId, slot_kind: slot.slotKind, slot_key: slot.slotKey,
        role_label: slot.roleLabel, shirt_number: slot.shirtNumber, x: slot.x, y: slot.y,
      })),
      p_expected_updated_at: parsed.value.expectedUpdatedAt,
    });
    if (result.error) return rpcFailure(result.error);
    if (!isUuid(result.data)) return failure(500, "server", "Không thể cập nhật chiến thuật. Vui lòng thử lại.");
    const saved = await dependencies.supabase
      .from("match_tactics")
      .select("id,version,updated_at,status")
      .eq("team_id", context.team.id)
      .eq("match_id", target.matchId)
      .eq("id", result.data)
      .limit(1)
      .maybeSingle();
    const tactic = saved.error ? null : parseSavedTactic(saved.data, result.data);
    if (!tactic) return failure(500, "server", "Không thể lưu chiến thuật lúc này.");
    return Response.json({ ok: true, tactic });
  } catch {
    return failure(500, "server", "Không thể cập nhật chiến thuật. Vui lòng thử lại.");
  }
}
