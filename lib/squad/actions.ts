import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type { TeamAccessContext } from "../teams/context";
import type { PermissionCode } from "../teams/permissions";
import type { PlayerPosition, PlayerStatus } from "./model";

const MAX_REQUEST_BYTES = 16 * 1024;
const UPDATE_KEYS = [
  "roleId",
  "shirtNumber",
  "officialPosition",
  "playerStatus",
  "joinDate",
  "adminNotes",
] as const;

type RouteTarget = Readonly<{ slug: string; userId: string }>;
type FieldErrors = Record<string, string>;
type ManageTeamPlayerArguments = {
  p_team_id: string;
  p_user_id: string;
  p_role_id: string;
  p_shirt_number: number | null;
  p_official_position: PlayerPosition | null;
  p_player_status: PlayerStatus;
  p_join_date: string;
  p_admin_notes: string | null;
  p_deactivate: boolean;
};

type TeamPermissionGuard = (
  slug: string,
  permission: PermissionCode,
) => Promise<TeamAccessContext | null>;

export type SquadActionDependencies = {
  requireTeamPermission: TeamPermissionGuard;
  supabase: Pick<SupabaseClient<Database>, "rpc">;
  now?: () => Date;
};

type UpdatePayload = Readonly<{
  roleId: string;
  shirtNumber: number | null;
  officialPosition: PlayerPosition | null;
  playerStatus: PlayerStatus;
  joinDate: string;
  adminNotes: string | null;
}>;

type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 };

type PayloadResult =
  | { ok: true; payload: UpdatePayload }
  | { ok: false; kind: "malformed" }
  | { ok: false; kind: "validation"; fieldErrors: FieldErrors };

function failure(
  status: number,
  code: string,
  message: string,
  fieldErrors?: FieldErrors,
): Response {
  return Response.json(
    { ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

function validationFailure(fieldErrors: FieldErrors): Response {
  return failure(
    422,
    "validation",
    "Vui lòng kiểm tra lại thông tin cầu thủ.",
    fieldErrors,
  );
}

function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

function hasJsonContentType(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

function preflightFailure(request: Request): Response | null {
  if (!isSameOriginMutation(request)) {
    return failure(403, "forbidden", "Yêu cầu không được phép.");
  }
  if (!hasJsonContentType(request)) {
    return failure(415, "content_type", "Định dạng yêu cầu không được hỗ trợ.");
  }
  return null;
}

async function readJsonBody(request: Request): Promise<BodyResult> {
  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength && /^\d+$/u.test(declaredLength)) {
    const bytes = Number(declaredLength);
    if (Number.isSafeInteger(bytes) && bytes > MAX_REQUEST_BYTES) {
      return { ok: false, status: 413 };
    }
  }
  if (!request.body) return { ok: false, status: 400 };

  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400 };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is PlayerPosition {
  return value === "GK" || value === "DEF" || value === "MID" || value === "ATT";
}

function isPlayerStatus(value: unknown): value is PlayerStatus {
  return value === "available" || value === "injured" || value === "unavailable";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function parsePayload(
  value: unknown,
  allowedKeys: readonly string[],
  now: Date,
): PayloadResult {
  if (!isRecord(value) || !Object.keys(value).every((key) => allowedKeys.includes(key))) {
    return { ok: false, kind: "malformed" };
  }

  const fieldErrors: FieldErrors = {};
  if (typeof value.roleId !== "string" || !isUuid(value.roleId.trim())) {
    fieldErrors.roleId = "Vai trò không hợp lệ.";
  }
  if (
    value.shirtNumber !== null &&
    (!Number.isInteger(value.shirtNumber) ||
      (value.shirtNumber as number) < 1 ||
      (value.shirtNumber as number) > 99)
  ) {
    fieldErrors.shirtNumber = "Số áo phải từ 1 đến 99.";
  }
  if (value.officialPosition !== null && !isPosition(value.officialPosition)) {
    fieldErrors.officialPosition = "Vị trí thi đấu không hợp lệ.";
  }
  if (!isPlayerStatus(value.playerStatus)) {
    fieldErrors.playerStatus = "Tình trạng cầu thủ không hợp lệ.";
  }
  if (typeof value.joinDate !== "string" || !isIsoDate(value.joinDate)) {
    fieldErrors.joinDate = "Ngày gia nhập không hợp lệ.";
  } else if (value.joinDate > now.toISOString().slice(0, 10)) {
    fieldErrors.joinDate = "Ngày gia nhập không được ở tương lai.";
  }
  if (
    value.adminNotes !== null &&
    (typeof value.adminNotes !== "string" || value.adminNotes.trim().length > 1000)
  ) {
    fieldErrors.adminNotes = "Ghi chú quản trị tối đa 1.000 ký tự.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, kind: "validation", fieldErrors };
  }

  const notes = typeof value.adminNotes === "string" ? value.adminNotes.trim() : null;
  return {
    ok: true,
    payload: Object.freeze({
      roleId: (value.roleId as string).trim(),
      shirtNumber: value.shirtNumber as number | null,
      officialPosition: value.officialPosition as PlayerPosition | null,
      playerStatus: value.playerStatus as PlayerStatus,
      joinDate: value.joinDate as string,
      adminNotes: notes || null,
    }),
  };
}

async function defaultDependencies(): Promise<SquadActionDependencies> {
  const [{ requireTeamPermission }, { createServerSupabaseClient }] = await Promise.all([
    import("../teams/context"),
    import("../supabase/server"),
  ]);
  return {
    requireTeamPermission,
    supabase: await createServerSupabaseClient(),
    now: () => new Date(),
  };
}

function mapRpcFailure(error: { code?: string }): Response {
  switch (error.code) {
    case "23505":
      return failure(409, "shirt_conflict", "Số áo này đã được sử dụng trong đội.");
    case "P0002":
    case "55000":
      return failure(409, "stale", "Thông tin cầu thủ đã thay đổi. Vui lòng tải lại.");
    case "42501":
    case "28000":
      return failure(403, "forbidden", "Không thể thay đổi cầu thủ này.");
    case "22023":
      return validationFailure({ record: "Thông tin cầu thủ không còn hợp lệ." });
    default:
      return failure(500, "server", "Không thể cập nhật cầu thủ. Vui lòng thử lại.");
  }
}

async function authorize(
  target: RouteTarget,
  dependencies: SquadActionDependencies,
): Promise<TeamAccessContext | null> {
  const [playerContext, memberContext] = await Promise.all([
    dependencies.requireTeamPermission(target.slug, "players.manage"),
    dependencies.requireTeamPermission(target.slug, "members.manage"),
  ]);
  if (
    !playerContext ||
    !memberContext ||
    playerContext.team.id !== memberContext.team.id ||
    playerContext.userId !== memberContext.userId
  ) {
    return null;
  }
  return playerContext;
}

async function invokeMutation(
  target: RouteTarget,
  payload: UpdatePayload,
  deactivate: boolean,
  dependencies: SquadActionDependencies,
): Promise<Response> {
  const context = await authorize(target, dependencies);
  if (!context) {
    return failure(403, "forbidden", "Bạn không có quyền quản lý cầu thủ.");
  }

  const arguments_: ManageTeamPlayerArguments = {
    p_team_id: context.team.id,
    p_user_id: target.userId,
    p_role_id: payload.roleId,
    p_shirt_number: payload.shirtNumber,
    p_official_position: payload.officialPosition,
    p_player_status: payload.playerStatus,
    p_join_date: payload.joinDate,
    p_admin_notes: payload.adminNotes,
    p_deactivate: deactivate,
  };
  const rpc = dependencies.supabase.rpc as unknown as (
    name: "manage_team_player",
    arguments_: ManageTeamPlayerArguments,
  ) => Promise<{ error: { code?: string } | null }>;
  const result = await rpc.call(
    dependencies.supabase,
    "manage_team_player",
    arguments_,
  );
  return result.error ? mapRpcFailure(result.error) : Response.json({ ok: true });
}

async function mutateTeamPlayer(
  request: Request,
  target: RouteTarget,
  deactivate: boolean,
  supplied?: SquadActionDependencies,
): Promise<Response> {
  const rejectedRequest = preflightFailure(request);
  if (rejectedRequest) return rejectedRequest;

  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.status === 413
      ? failure(413, "too_large", "Yêu cầu quá lớn.")
      : failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.");
  }
  const allowedKeys = deactivate ? [...UPDATE_KEYS, "confirmation"] : UPDATE_KEYS;
  if (deactivate && (!isRecord(body.value) || body.value.confirmation !== "DEACTIVATE")) {
    return validationFailure({
      confirmation: "Nhập DEACTIVATE để xác nhận ngừng hoạt động.",
    });
  }
  const parsed = parsePayload(body.value, allowedKeys, supplied?.now?.() ?? new Date());
  if (!parsed.ok) {
    return parsed.kind === "malformed"
      ? failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.")
      : validationFailure(parsed.fieldErrors);
  }

  try {
    return invokeMutation(
      target,
      parsed.payload,
      deactivate,
      supplied ?? (await defaultDependencies()),
    );
  } catch {
    return failure(500, "server", "Không thể cập nhật cầu thủ. Vui lòng thử lại.");
  }
}

export async function updateTeamPlayer(
  request: Request,
  target: RouteTarget,
  dependencies?: SquadActionDependencies,
): Promise<Response> {
  return mutateTeamPlayer(request, target, false, dependencies);
}

export async function deactivateTeamPlayer(
  request: Request,
  target: RouteTarget,
  dependencies?: SquadActionDependencies,
): Promise<Response> {
  return mutateTeamPlayer(request, target, true, dependencies);
}
