import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type { TeamAccessContext } from "../teams/context";
import type { PermissionCode } from "../teams/permissions";
import { isUuid } from "../matches/model";
import { isIsoTimestamp } from "../matches/validation";
import { TACTIC_FORMATIONS, TACTIC_LEVELS, TACTIC_MODES, TACTIC_ROLES } from "./model";
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

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) { const actual = Object.keys(value); return actual.length === keys.length && keys.every((key) => actual.includes(key)); }
function oneOf(value: unknown, values: readonly string[]) { return typeof value === "string" && values.includes(value); }
function savedSlot(value: unknown) {
  return record(value) && exactKeys(value, ["user_id", "slot_kind", "slot_key", "role_label", "shirt_number", "x", "y"])
    && isUuid(value.user_id) && (value.slot_kind === "starter" || value.slot_kind === "bench")
    && typeof value.slot_key === "string" && value.slot_key === value.slot_key.trim() && value.slot_key.length >= 1 && value.slot_key.length <= 40
    && oneOf(value.role_label, TACTIC_ROLES)
    && (value.shirt_number === null || (Number.isInteger(value.shirt_number) && (value.shirt_number as number) >= 1 && (value.shirt_number as number) <= 99))
    && typeof value.x === "number" && Number.isFinite(value.x) && value.x >= 0 && value.x <= 100
    && typeof value.y === "number" && Number.isFinite(value.y) && value.y >= 0 && value.y <= 100;
}
function parseSavedTactic(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!exactKeys(row, ["id", "team_id", "match_id", "mode", "formation", "instructions", "version", "pressing", "defensive_line", "status", "updated_at", "slots"])
    || !isUuid(row.id) || !isUuid(row.team_id) || !isUuid(row.match_id)
    || !oneOf(row.mode, TACTIC_MODES) || !oneOf(row.formation, TACTIC_FORMATIONS)
    || !(row.instructions === null || (typeof row.instructions === "string" && row.instructions === row.instructions.trim() && Array.from(row.instructions).length >= 1 && Array.from(row.instructions).length <= 2000))
    || !Number.isInteger(row.version) || (row.version as number) < 1 || (row.version as number) > 32767
    || !oneOf(row.pressing, TACTIC_LEVELS) || !oneOf(row.defensive_line, TACTIC_LEVELS)
    || (row.status !== "draft" && row.status !== "applied") || !isIsoTimestamp(row.updated_at)
    || !Array.isArray(row.slots) || row.slots.length < 7 || row.slots.length > 30 || !row.slots.every(savedSlot)) return null;
  return row;
}
function savedRowMatches(row: Record<string, unknown>, expectedId: string, teamId: string, matchId: string, payload: SaveTacticPayload) {
  const expectedVersion = payload.tacticId === null ? 1 : payload.version + 1;
  if (row.id !== expectedId || row.team_id !== teamId || row.match_id !== matchId || row.mode !== payload.mode
    || row.formation !== payload.formation || row.instructions !== payload.instructions || row.version !== expectedVersion
    || row.pressing !== payload.pressing || row.defensive_line !== payload.defensiveLine || row.status !== "draft") return false;
  const returned = new Map((row.slots as Record<string, unknown>[]).map((slot) => [slot.slot_key, slot]));
  if (returned.size !== payload.slots.length) return false;
  return payload.slots.every((expected) => {
    const slot = returned.get(expected.slotKey);
    return slot?.user_id === expected.userId && slot.slot_kind === expected.slotKind && slot.role_label === expected.roleLabel
      && slot.shirt_number === expected.shirtNumber && slot.x === expected.x && slot.y === expected.y;
  });
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
      .select("id,team_id,match_id,mode,formation,instructions,version,pressing,defensive_line,status,updated_at,slots:lineup_slots(user_id,slot_kind,slot_key,role_label,shirt_number,x,y)")
      .eq("team_id", context.team.id)
      .eq("match_id", target.matchId)
      .eq("id", result.data)
      .limit(1)
      .maybeSingle();
    const savedRow = saved.error ? null : parseSavedTactic(saved.data);
    if (!savedRow) return failure(500, "server", "Không thể lưu chiến thuật lúc này.");
    if (!savedRowMatches(savedRow, result.data, context.team.id, target.matchId, parsed.value)) return failure(409, "stale", "Chiến thuật đã thay đổi. Vui lòng tải lại.");
    return Response.json({ ok: true, tactic: { id: savedRow.id, version: savedRow.version, updatedAt: savedRow.updated_at } });
  } catch {
    return failure(500, "server", "Không thể cập nhật chiến thuật. Vui lòng thử lại.");
  }
}
