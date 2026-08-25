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

function failure(status: number, code: string, error: string): Response {
  return Response.json({ code, error }, { status });
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
  const productUser = await dependencies.getProductUser("/setup/team");
  if (!productUser) return failure(401, "unauthorized", "Bạn cần đăng nhập để tạo đội.");
  if (productUser.requiresPasswordChange) {
    return failure(403, "password_change_required", "Hãy đổi mật khẩu trước khi tiếp tục.");
  }

  const body = await request.json().catch(() => null);
  const payload = parsePayload(body);
  if (!payload) {
    return failure(422, "validation", "Tên đội hoặc đường dẫn đội không hợp lệ.");
  }

  const { error: insertError } = await dependencies.supabase
    .from("teams")
    .insert(payload);
  if (insertError) {
    return insertError.code === "23505"
      ? failure(409, "duplicate", "Đường dẫn đội này đã được sử dụng.")
      : failure(500, "server", "Không thể tạo đội. Vui lòng thử lại.");
  }

  const { data: team, error: selectError } = await dependencies.supabase
    .from("teams")
    .select("id, name, slug")
    .eq("slug", payload.slug)
    .maybeSingle();
  if (selectError || !isTeamRecord(team)) {
    return failure(500, "server", "Không thể tạo đội. Vui lòng thử lại.");
  }

  return Response.json({ team: { id: team.id, name: team.name, slug: team.slug } }, { status: 201 });
}

export async function POST(request: Request): Promise<Response> {
  return createTeamHandler(request, await defaultDependencies());
}
