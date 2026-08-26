import { createClient } from "@supabase/supabase-js";

import {
  MAX_PROVISION_MEMBER_BODY_BYTES,
  validateProvisionMemberPayload,
  type ProvisionMemberRequest,
} from "../../../lib/squad/provisioning.ts";
import { isUuid } from "../../../lib/squad/model.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface ImportMeta {
  main?: boolean;
}

type AuthUser = { id: string; email?: string | null };
type AuthResult = { data: { user: AuthUser | null }; error: unknown | null };
type RpcResult = { data: unknown; error: unknown | null };
type AuthUsersResult = {
  data: { users: AuthUser[] };
  error: unknown | null;
};
type AuthMutationResult = {
  data: { user: AuthUser | null };
  error: unknown | null;
};
type QueryResult = { data: unknown; error: unknown | null };

type QueryBuilder = {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  limit(value: number): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
};

type CallerClient = {
  auth: { getUser(token: string): Promise<AuthResult> };
  rpc(name: "get_current_team_access_contexts"): Promise<RpcResult>;
};

type ServiceClient = {
  auth: {
    admin: {
      listUsers(parameters: { page: number; perPage: number }): Promise<AuthUsersResult>;
      createUser(attributes: {
        email: string;
        password: string;
        email_confirm: true;
        user_metadata: { display_name: string };
      }): Promise<AuthMutationResult>;
      deleteUser(userId: string): Promise<AuthMutationResult>;
    };
  };
  from(table: "roles" | "role_permissions" | "memberships"): QueryBuilder;
  rpc(name: "attach_team_member", arguments_: Record<string, unknown>): Promise<RpcResult>;
};

export type ProvisionTeamMemberDependencies = {
  allowedOrigins: readonly string[];
  createCallerClient(token: string): CallerClient;
  createServiceClient(): ServiceClient;
  generateTemporaryPassword(): string;
  now(): Date;
};

const CORS_METHODS = "POST, OPTIONS";
const CORS_HEADERS = "authorization, content-type, apikey, x-client-info";
const AUTH_PAGE_SIZE = 1000;
const MAX_AUTH_PAGES = 1000;

const ERROR_MESSAGES = {
  origin_not_allowed: "Nguồn yêu cầu không được chấp nhận.",
  method_not_allowed: "Phương thức không được hỗ trợ.",
  unsupported_media_type: "Định dạng yêu cầu không được hỗ trợ.",
  body_too_large: "Yêu cầu quá lớn.",
  invalid_payload: "Dữ liệu tạo cầu thủ không hợp lệ.",
  unauthorized: "Không thể xác minh tài khoản.",
  forbidden: "Bạn không có quyền thêm cầu thủ.",
  role_not_assignable: "Vai trò không thể được gán cho cầu thủ.",
  duplicate_membership: "Cầu thủ đã là thành viên hoạt động của đội.",
  membership_unavailable: "Tài khoản này chưa thể được thêm lại vào đội.",
  conflict: "Không thể thêm cầu thủ do dữ liệu đã tồn tại.",
  provisioning_failed: "Không thể thêm cầu thủ. Vui lòng thử lại.",
  manual_recovery_required:
    "Không thể hoàn tất tạo cầu thủ. Vui lòng liên hệ quản trị viên.",
} as const;

type ErrorCode = keyof typeof ERROR_MESSAGES;

function corsHeaders(origin?: string): HeadersInit {
  return origin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": CORS_METHODS,
        "access-control-allow-headers": CORS_HEADERS,
        vary: "Origin",
      }
    : {};
}

function json(
  body: Record<string, unknown>,
  status: number,
  origin?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
      ...corsHeaders(origin),
    },
  });
}

function failure(code: ErrorCode, status: number, origin?: string): Response {
  return json(
    { ok: false, code, message: ERROR_MESSAGES[code] },
    status,
    origin,
  );
}

function requestOrigin(
  request: Request,
  allowedOrigins: readonly string[],
): string | null {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins.includes(origin) ? origin : null;
}

function bearerToken(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/u);
  return match?.[1] ?? null;
}

function hasJsonContentType(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

function declaredBodyTooLarge(request: Request): boolean {
  const value = request.headers.get("content-length")?.trim();
  if (!value || !/^\d+$/u.test(value)) return false;
  const length = Number(value);
  return Number.isSafeInteger(length) && length > MAX_PROVISION_MEMBER_BODY_BYTES;
}

async function readBoundedJson(
  request: Request,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; code: "body_too_large" | "invalid_payload" }
> {
  if (!request.body) return { ok: false, code: "invalid_payload" };
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_PROVISION_MEMBER_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, code: "body_too_large" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, code: "invalid_payload" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuthorizedContext(value: unknown, teamId: string): boolean {
  if (!isRecord(value) || value.team_id !== teamId || !Array.isArray(value.permission_codes)) {
    return false;
  }
  return (
    value.permission_codes.includes("members.manage") &&
    value.permission_codes.includes("players.manage")
  );
}

async function hasDualPermission(
  caller: CallerClient,
  teamId: string,
): Promise<boolean> {
  const result = await caller.rpc("get_current_team_access_contexts");
  if (result.error || !Array.isArray(result.data)) return false;
  return result.data.filter((row) => isAuthorizedContext(row, teamId)).length === 1;
}

type AssignableRoleResult =
  | { ok: true }
  | { ok: false; kind: "forbidden" | "server" };

async function validateAssignableRole(
  service: ServiceClient,
  payload: ProvisionMemberRequest,
): Promise<AssignableRoleResult> {
  const roleResult = await service
    .from("roles")
    .select("id,team_id,slug,is_system")
    .eq("id", payload.roleId)
    .eq("team_id", payload.teamId)
    .limit(1)
    .maybeSingle();
  if (roleResult.error) return { ok: false, kind: "server" };
  if (!isRecord(roleResult.data)) return { ok: false, kind: "forbidden" };
  if (
    roleResult.data.id !== payload.roleId ||
    roleResult.data.team_id !== payload.teamId ||
    (roleResult.data.is_system === true && roleResult.data.slug === "owner")
  ) {
    return { ok: false, kind: "forbidden" };
  }

  const deletePermission = await service
    .from("role_permissions")
    .select("role_id")
    .eq("role_id", payload.roleId)
    .eq("permission_code", "team.delete")
    .limit(1)
    .maybeSingle();
  if (deletePermission.error) return { ok: false, kind: "server" };
  return deletePermission.data === null
    ? { ok: true }
    : { ok: false, kind: "forbidden" };
}

async function findUserByEmail(
  service: ServiceClient,
  email: string,
): Promise<{ ok: true; user: AuthUser | null } | { ok: false }> {
  for (let page = 1; page <= MAX_AUTH_PAGES; page += 1) {
    const result = await service.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (result.error || !Array.isArray(result.data.users)) return { ok: false };
    const matches = result.data.users.filter(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    if (matches.length !== 0) {
      const user = matches.length === 1 ? matches[0] : null;
      return user && isUuid(user.id) ? { ok: true, user } : { ok: false };
    }
    if (result.data.users.length < AUTH_PAGE_SIZE) {
      return { ok: true, user: null };
    }
  }
  return { ok: false };
}

async function existingMembershipStatus(
  service: ServiceClient,
  teamId: string,
  userId: string,
): Promise<"active" | "inactive" | null | "error"> {
  const result = await service
    .from("memberships")
    .select("status")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (result.error) return "error";
  if (result.data === null) return null;
  return isRecord(result.data) &&
    (result.data.status === "active" || result.data.status === "inactive")
    ? result.data.status
    : "error";
}

function attachmentArguments(
  payload: ProvisionMemberRequest,
  actorUserId: string,
  userId: string,
  requiresPasswordChange: boolean,
): Record<string, unknown> {
  return {
    p_verified_actor_user_id: actorUserId,
    p_team_id: payload.teamId,
    p_user_id: userId,
    p_display_name: payload.displayName,
    p_requires_password_change: requiresPasswordChange,
    p_role_id: payload.roleId,
    p_shirt_number: payload.shirtNumber,
    p_official_position: payload.officialPosition,
    p_join_date: payload.joinDate,
  };
}

function mapAttachmentError(error: unknown, origin: string): Response {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
  if (code === "23505") return failure("conflict", 409, origin);
  if (code === "42501" || code === "28000") return failure("forbidden", 403, origin);
  if (code === "55000") return failure("membership_unavailable", 409, origin);
  return failure("provisioning_failed", 500, origin);
}

async function compensateCreatedUser(
  service: ServiceClient,
  userId: string,
  attachmentError: unknown,
  origin: string,
): Promise<Response> {
  try {
    const result = await service.auth.admin.deleteUser(userId);
    if (!result.error) return mapAttachmentError(attachmentError, origin);
  } catch {
    // Upstream details and credentials are deliberately never logged or returned.
  }
  return failure("manual_recovery_required", 500, origin);
}

export function createProvisionTeamMemberHandler(
  dependencies: ProvisionTeamMemberDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const origin = requestOrigin(request, dependencies.allowedOrigins);
    if (!origin) return failure("origin_not_allowed", 403);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") return failure("method_not_allowed", 405, origin);
    if (!hasJsonContentType(request)) {
      return failure("unsupported_media_type", 415, origin);
    }
    if (declaredBodyTooLarge(request)) return failure("body_too_large", 413, origin);

    const token = bearerToken(request);
    if (!token) return failure("unauthorized", 401, origin);

    try {
      const caller = dependencies.createCallerClient(token);
      const identityResult = await caller.auth.getUser(token);
      const actor = identityResult.data.user;
      if (identityResult.error || !actor || !isUuid(actor.id)) {
        return failure("unauthorized", 401, origin);
      }

      const body = await readBoundedJson(request);
      if (!body.ok) {
        return failure(body.code, body.code === "body_too_large" ? 413 : 400, origin);
      }
      const validation = validateProvisionMemberPayload(body.value, dependencies.now());
      if (!validation.ok) {
        return json({ ...validation }, 422, origin);
      }
      const payload = validation.value;

      if (!(await hasDualPermission(caller, payload.teamId))) {
        return failure("forbidden", 403, origin);
      }

      const service = dependencies.createServiceClient();
      const role = await validateAssignableRole(service, payload);
      if (!role.ok) {
        return role.kind === "forbidden"
          ? failure("role_not_assignable", 403, origin)
          : failure("provisioning_failed", 500, origin);
      }

      const lookup = await findUserByEmail(service, payload.email);
      if (!lookup.ok) return failure("provisioning_failed", 500, origin);

      let user = lookup.user;
      let temporaryPassword: string | null = null;
      let created = false;
      if (user) {
        const membershipStatus = await existingMembershipStatus(
          service,
          payload.teamId,
          user.id,
        );
        if (membershipStatus === "active") {
          return failure("duplicate_membership", 409, origin);
        }
        if (membershipStatus === "inactive") {
          return failure("membership_unavailable", 409, origin);
        }
        if (membershipStatus === "error") {
          return failure("provisioning_failed", 500, origin);
        }
      } else {
        temporaryPassword = dependencies.generateTemporaryPassword();
        let createResult: AuthMutationResult;
        try {
          createResult = await service.auth.admin.createUser({
            email: payload.email,
            password: temporaryPassword,
            email_confirm: true,
            user_metadata: { display_name: payload.displayName },
          });
        } catch {
          return failure("manual_recovery_required", 500, origin);
        }
        user = createResult.data.user;
        if (createResult.error || !user || !isUuid(user.id)) {
          return failure("provisioning_failed", 500, origin);
        }
        created = true;
      }

      let attachResult: RpcResult;
      try {
        attachResult = await service.rpc(
          "attach_team_member",
          attachmentArguments(payload, actor.id, user.id, created),
        );
      } catch {
        return failure("manual_recovery_required", 500, origin);
      }
      if (attachResult.error) {
        return created
          ? compensateCreatedUser(service, user.id, attachResult.error, origin)
          : mapAttachmentError(attachResult.error, origin);
      }

      return created
        ? json(
            {
              ok: true,
              account: "created",
              userId: user.id,
              temporaryPassword,
            },
            201,
            origin,
          )
        : json({ ok: true, account: "attached", userId: user.id }, 200, origin);
    } catch {
      return failure("provisioning_failed", 500, origin);
    }
  };
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*_-+=?";
const PASSWORD_ALPHABET = `${UPPER}${LOWER}${DIGITS}${SYMBOLS}`;

function secureRandomIndex(upperBound: number): number {
  const limit = Math.floor(256 / upperBound) * upperBound;
  const byte = new Uint8Array(1);
  do {
    crypto.getRandomValues(byte);
  } while (byte[0] >= limit);
  return byte[0] % upperBound;
}

function randomCharacter(alphabet: string): string {
  return alphabet[secureRandomIndex(alphabet.length)];
}

export function generateTemporaryPassword(length = 24): string {
  if (!Number.isInteger(length) || length < 20) {
    throw new Error("Temporary password length must be at least 20.");
  }
  const characters = [
    randomCharacter(UPPER),
    randomCharacter(LOWER),
    randomCharacter(DIGITS),
    randomCharacter(SYMBOLS),
  ];
  while (characters.length < length) {
    characters.push(randomCharacter(PASSWORD_ALPHABET));
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const replacement = secureRandomIndex(index + 1);
    [characters[index], characters[replacement]] = [
      characters[replacement],
      characters[index],
    ];
  }
  return characters.join("");
}

function canonicalAllowedOrigins(value: string): string[] {
  const origins: string[] = [];
  for (const candidate of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    try {
      const url = new URL(candidate);
      const loopback = url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
      if ((url.protocol === "https:" || loopback) && url.origin === candidate && !origins.includes(candidate)) {
        origins.push(candidate);
      }
    } catch {
      // Invalid allow-list entries are ignored rather than reflected.
    }
  }
  return origins;
}

export function createProvisionTeamMemberRuntimeDependencies(
  options: {
    getEnvironment?: (name: string) => string | undefined;
    createSupabaseClient?: typeof createClient;
  } = {},
): ProvisionTeamMemberDependencies {
  const getEnvironment = options.getEnvironment ?? ((name: string) => Deno.env.get(name));
  const createSupabaseClient = options.createSupabaseClient ?? createClient;
  const url = getEnvironment("SUPABASE_URL");
  const anonKey = getEnvironment("SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const allowedOriginsValue = getEnvironment("ALLOWED_ORIGINS") ?? "";
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Missing required Edge Function configuration.");
  }
  const authOptions = {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  };
  return {
    allowedOrigins: canonicalAllowedOrigins(allowedOriginsValue),
    createCallerClient(token) {
      return createSupabaseClient(url, anonKey, {
        auth: authOptions,
        global: { headers: { Authorization: `Bearer ${token}` } },
      }) as unknown as CallerClient;
    },
    createServiceClient() {
      return createSupabaseClient(url, serviceRoleKey, {
        auth: authOptions,
      }) as unknown as ServiceClient;
    },
    generateTemporaryPassword,
    now: () => new Date(),
  };
}

if ((import.meta as ImportMeta).main) {
  Deno.serve(
    createProvisionTeamMemberHandler(
      createProvisionTeamMemberRuntimeDependencies(),
    ),
  );
}
