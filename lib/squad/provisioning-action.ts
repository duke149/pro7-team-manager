import { isUuid } from "./model";
import {
  MAX_PROVISION_MEMBER_BODY_BYTES,
  validateProvisionMemberPayload,
  type ProvisionMemberSuccess,
} from "./provisioning";
import type { TeamAccessContext } from "../teams/context";
import type { PermissionCode } from "../teams/permissions";
import "./server-only";

type Guard = (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
type SessionResult = { data: { session: { access_token: string } | null } };
type InvokeResult = { data: unknown; error: unknown | null };

export type ProvisioningActionDependencies = {
  requireTeamPermission: Guard;
  supabase: {
    auth: { getSession(): Promise<SessionResult> };
    functions: { invoke(name: string, options: Record<string, unknown>): Promise<InvokeResult> };
  };
  now?: () => Date;
};

function failure(status: number, code: string, message: string, fieldErrors?: Readonly<Record<string, string>>) {
  return Response.json({ ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) }, { status });
}

function sameOrigin(request: Request): boolean {
  try {
    const origin = request.headers.get("origin");
    return origin ? origin === new URL(request.url).origin : request.headers.get("sec-fetch-site") === "same-origin";
  } catch {
    return false;
  }
}

async function readBoundedJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared) && Number(declared) > MAX_PROVISION_MEMBER_BODY_BYTES) {
    return { ok: false, status: 413 };
  }
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROVISION_MEMBER_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400 };
  }
}

function isSuccess(value: unknown): value is ProvisionMemberSuccess {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.ok !== true || !isUuid(String(row.userId))) return false;
  return row.account === "attached"
    ? !("temporaryPassword" in row)
    : row.account === "created" && typeof row.temporaryPassword === "string" && row.temporaryPassword.length >= 20;
}

async function defaults(): Promise<ProvisioningActionDependencies> {
  const [{ requireTeamPermission }, { createServerSupabaseClient }] = await Promise.all([
    import("../teams/context"),
    import("../supabase/server"),
  ]);
  return { requireTeamPermission, supabase: await createServerSupabaseClient() as unknown as ProvisioningActionDependencies["supabase"] };
}

export async function provisionTeamMember(
  request: Request,
  target: { slug: string },
  supplied?: ProvisioningActionDependencies,
): Promise<Response> {
  if (!sameOrigin(request)) return failure(403, "forbidden", "Yêu cầu không được phép.");
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return failure(415, "content_type", "Định dạng yêu cầu không được hỗ trợ.");
  }
  const body = await readBoundedJson(request);
  if (!body.ok) return failure(body.status, body.status === 413 ? "body_too_large" : "invalid_payload", body.status === 413 ? "Yêu cầu quá lớn." : "Dữ liệu tạo cầu thủ không hợp lệ.");
  const validated = validateProvisionMemberPayload(body.value, supplied?.now?.() ?? new Date());
  if (!validated.ok) return failure(422, validated.code, validated.message, "fieldErrors" in validated ? validated.fieldErrors : undefined);

  const dependencies = supplied ?? await defaults();
  const [players, members] = await Promise.all([
    dependencies.requireTeamPermission(target.slug, "players.manage"),
    dependencies.requireTeamPermission(target.slug, "members.manage"),
  ]);
  if (!players || !members || players.team.id !== members.team.id || validated.value.teamId !== players.team.id) {
    return failure(403, "forbidden", "Bạn không có quyền thêm cầu thủ.");
  }
  const { data: { session } } = await dependencies.supabase.auth.getSession();
  if (!session?.access_token) return failure(401, "unauthorized", "Không thể xác minh tài khoản.");

  const origin = new URL(request.url).origin;
  const { data, error } = await dependencies.supabase.functions.invoke("provision-team-member", {
    headers: { Authorization: `Bearer ${session.access_token}`, Origin: origin },
    body: validated.value,
  });
  if (error) {
    const context = typeof error === "object" && error !== null && "context" in error && error.context instanceof Response ? error.context : null;
    const responseBody: unknown = context ? await context.clone().json().catch(() => null) : null;
    const message = typeof responseBody === "object" && responseBody !== null && "message" in responseBody && typeof responseBody.message === "string" && responseBody.message.length <= 200
      ? responseBody.message
      : "Không thể thêm cầu thủ. Vui lòng thử lại.";
    return failure(context && context.status >= 400 && context.status <= 599 ? context.status : 502, "provisioning_failed", message);
  }
  return isSuccess(data) ? Response.json(data) : failure(502, "provisioning_failed", "Không thể thêm cầu thủ. Vui lòng thử lại.");
}
