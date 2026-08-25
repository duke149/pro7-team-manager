import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProductUser } from "../../../lib/supabase/auth";
import type { Database } from "../../../lib/supabase/database.types";
import { validateTeamSlug } from "../../../lib/teams/slug";

type TeamRecord = { id: string; name: string; slug: string };

type TeamApiDependencies = {
  getProductUser: (next: string) => Promise<ProductUser | null>;
  supabase: Pick<SupabaseClient<Database>, "from">;
};

type TeamInsertPayload = { name: string; slug: string };

const MAX_TEAM_REQUEST_BYTES = 8 * 1024;

function failure(status: number, code: string, error: string): Response {
  return Response.json({ code, error }, { status });
}

function genericServerFailure(): Response {
  return failure(500, "server", "Không thể tạo đội. Vui lòng thử lại.");
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
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() === "application/json"
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

type JsonReadResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 };

async function readJsonBody(request: Request): Promise<JsonReadResult> {
  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength && /^\d+$/u.test(declaredLength)) {
    const bytes = Number(declaredLength);
    if (Number.isSafeInteger(bytes) && bytes > MAX_TEAM_REQUEST_BYTES) {
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
      if (byteLength > MAX_TEAM_REQUEST_BYTES) {
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

function isTeamRecord(value: unknown): value is TeamRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    "slug" in value &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string"
  );
}

function parsePayload(value: unknown): TeamInsertPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const requestedSlug = body.slug;
  if (
    !Object.keys(body).every((key) => key === "name" || key === "slug") ||
    typeof body.name !== "string" ||
    (requestedSlug !== undefined && typeof requestedSlug !== "string")
  ) {
    return null;
  }

  const name = body.name.trim();
  if (!name || name.length > 100) return null;

  const slugResult = validateTeamSlug(
    typeof requestedSlug === "string" ? requestedSlug : name,
  );
  return slugResult.ok ? { name, slug: slugResult.slug } : null;
}

async function defaultDependencies(): Promise<TeamApiDependencies> {
  const [{ getProductUser }, { createServerSupabaseClient }] = await Promise.all([
    import("../../../lib/supabase/auth"),
    import("../../../lib/supabase/server"),
  ]);
  return { getProductUser, supabase: await createServerSupabaseClient() };
}

export async function createTeamHandler(
  request: Request,
  dependencies: TeamApiDependencies,
): Promise<Response> {
  const rejectedRequest = preflightFailure(request);
  if (rejectedRequest) return rejectedRequest;

  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.status === 413
      ? failure(413, "too_large", "Yêu cầu quá lớn.")
      : failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.");
  }

  try {
    const productUser = await dependencies.getProductUser("/setup/team");
    if (!productUser) return failure(401, "unauthorized", "Bạn cần đăng nhập để tạo đội.");
    if (productUser.requiresPasswordChange) {
      return failure(403, "password_change_required", "Hãy đổi mật khẩu trước khi tiếp tục.");
    }

    const payload = parsePayload(body.value);
    if (!payload) {
      return failure(422, "validation", "Tên đội hoặc đường dẫn đội không hợp lệ.");
    }

    const { error: insertError } = await dependencies.supabase
      .from("teams")
      .insert(payload);
    if (insertError) {
      return insertError.code === "23505"
        ? failure(409, "duplicate", "Đường dẫn đội này đã được sử dụng.")
        : genericServerFailure();
    }

    const { data: team, error: selectError } = await dependencies.supabase
      .from("teams")
      .select("id, name, slug")
      .eq("slug", payload.slug)
      .maybeSingle();
    if (selectError || !isTeamRecord(team)) return genericServerFailure();

    return Response.json({ team: { id: team.id, name: team.name, slug: team.slug } }, { status: 201 });
  } catch {
    return genericServerFailure();
  }
}

export async function createTeamPostAdapter(
  request: Request,
  resolveDependencies: () => Promise<TeamApiDependencies> = defaultDependencies,
): Promise<Response> {
  const rejectedRequest = preflightFailure(request);
  if (rejectedRequest) return rejectedRequest;

  try {
    return await createTeamHandler(request, await resolveDependencies());
  } catch {
    return genericServerFailure();
  }
}

export async function POST(
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
): Promise<Response> {
  void context;
  return createTeamPostAdapter(request);
}
