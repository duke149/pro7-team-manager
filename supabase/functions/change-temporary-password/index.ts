import { createClient } from "@supabase/supabase-js";

import { validateNewPassword } from "../../../lib/account/password.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface ImportMeta {
  main?: boolean;
}

type AuthUser = { id: string; email?: string | null };
type AuthResult = { data: { user: AuthUser | null }; error: unknown | null };
type PasswordSignInResult = {
  data: { session: unknown | null; user: AuthUser | null };
  error: unknown | null;
};
type UpdateResult = { data: unknown; error: unknown | null };
type ProfileClearResult = {
  data: Array<{ id: string }> | null;
  error: unknown | null;
};

type JwtClient = {
  auth: { getUser(): Promise<AuthResult> };
};
type PasswordClient = {
  auth: {
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<PasswordSignInResult>;
  };
};
type ServiceClient = {
  auth: {
    admin: {
      updateUserById(userId: string, attributes: { password: string }): Promise<UpdateResult>;
    };
  };
  from(table: "profiles"): {
    update(values: { requires_password_change: false }): {
      eq(field: "id", value: string): {
        select(columns: "id"): Promise<ProfileClearResult>;
      };
    };
  };
};

export type ChangeTemporaryPasswordDependencies = {
  allowedOrigins: readonly string[];
  createJwtClient(token: string): JwtClient;
  createPasswordClient(): PasswordClient;
  createServiceClient(): ServiceClient;
};

const METHOD_ERROR = "Phương thức không được hỗ trợ.";
const ORIGIN_ERROR = "Nguồn yêu cầu không được chấp nhận.";
const AUTH_ERROR = "Không thể xác minh tài khoản.";
const CHANGE_ERROR = "Không thể đổi mật khẩu.";
const MANUAL_RECOVERY_ERROR =
  "Không thể hoàn tất đổi mật khẩu. Vui lòng liên hệ quản trị viên.";
const SUCCESS_MESSAGE = "Đổi mật khẩu thành công.";
const CORS_METHODS = "POST, OPTIONS";
const CORS_HEADERS = "authorization, content-type, apikey, x-client-info";

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

function json(body: Record<string, string>, status: number, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

function requestOrigin(request: Request, allowedOrigins: readonly string[]): string | null {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins.includes(origin) ? origin : null;
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  const match = value?.match(/^Bearer\s+(.+)$/u);
  return match?.[1]?.trim() || null;
}

function isPasswordChangeRequest(
  value: unknown,
): value is { currentTemporaryPassword: string; newPassword: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "currentTemporaryPassword" in value &&
    typeof value.currentTemporaryPassword === "string" &&
    "newPassword" in value &&
    typeof value.newPassword === "string"
  );
}

function manualRecoveryResponse(origin: string): Response {
  return json(
    { error: MANUAL_RECOVERY_ERROR, code: "manual_recovery_required" },
    500,
    origin,
  );
}

async function compensatePasswordChange(
  service: ServiceClient,
  userId: string,
  currentTemporaryPassword: string,
  origin: string,
): Promise<Response> {
  try {
    const { error } = await service.auth.admin.updateUserById(userId, {
      password: currentTemporaryPassword,
    });
    if (!error) return json({ error: CHANGE_ERROR }, 500, origin);
  } catch {
    // A response intentionally never exposes the upstream compensation error.
  }

  return manualRecoveryResponse(origin);
}

export function createChangeTemporaryPasswordHandler(
  dependencies: ChangeTemporaryPasswordDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const origin = requestOrigin(request, dependencies.allowedOrigins);
    if (!origin) return json({ error: ORIGIN_ERROR }, 403);

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      if (request.method !== "POST") {
        return json({ error: METHOD_ERROR }, 405, origin);
      }

      const token = bearerToken(request);
      if (!token) return json({ error: AUTH_ERROR }, 401, origin);

      const { data: identity, error: identityError } =
        await dependencies.createJwtClient(token).auth.getUser();
      const user = identity.user;
      if (identityError || !user || !user.email) {
        return json({ error: AUTH_ERROR }, 401, origin);
      }

      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return json({ error: CHANGE_ERROR }, 422, origin);
      }
      if (!isPasswordChangeRequest(payload)) {
        return json({ error: CHANGE_ERROR }, 422, origin);
      }

      const { currentTemporaryPassword, newPassword } = payload;
      const { error: signInError } = await dependencies
        .createPasswordClient()
        .auth.signInWithPassword({
          email: user.email,
          password: currentTemporaryPassword,
        });
      if (signInError) return json({ error: CHANGE_ERROR }, 422, origin);

      if (
        newPassword === currentTemporaryPassword ||
        !validateNewPassword({
          password: newPassword,
          email: user.email,
          temporaryPassword: currentTemporaryPassword,
        }).ok
      ) {
        return json({ error: CHANGE_ERROR }, 422, origin);
      }

      const service = dependencies.createServiceClient();
      let updateResult: UpdateResult;
      try {
        updateResult = await service.auth.admin.updateUserById(user.id, {
          password: newPassword,
        });
      } catch {
        return manualRecoveryResponse(origin);
      }
      const { error: updateError } = updateResult;
      if (updateError) return json({ error: CHANGE_ERROR }, 500, origin);

      let profileResult: ProfileClearResult;
      try {
        profileResult = await service
          .from("profiles")
          .update({ requires_password_change: false })
          .eq("id", user.id)
          .select("id");
      } catch {
        return manualRecoveryResponse(origin);
      }
      if (profileResult.error || profileResult.data?.length !== 1) {
        return compensatePasswordChange(service, user.id, currentTemporaryPassword, origin);
      }

      return json({ message: SUCCESS_MESSAGE }, 200, origin);
    } catch {
      return json({ error: CHANGE_ERROR }, 500, origin);
    }
  };
}

export function createChangeTemporaryPasswordRuntimeDependencies(
  options: {
    getEnvironment?: (name: string) => string | undefined;
    createSupabaseClient?: typeof createClient;
  } = {},
): ChangeTemporaryPasswordDependencies {
  const getEnvironment =
    options.getEnvironment ?? ((name: string) => Deno.env.get(name));
  const createSupabaseClient = options.createSupabaseClient ?? createClient;
  const url = getEnvironment("SUPABASE_URL");
  const anonKey = getEnvironment("SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const allowedOriginsValue = getEnvironment("ALLOWED_ORIGINS") ?? "";
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Missing required Edge Function configuration.");
  }

  const allowedOrigins = allowedOriginsValue
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    allowedOrigins,
    createJwtClient(token): JwtClient {
      return createSupabaseClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    },
    createPasswordClient(): PasswordClient {
      return createSupabaseClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
    },
    createServiceClient(): ServiceClient {
      const service = createSupabaseClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      return {
        auth: {
          admin: {
            async updateUserById(userId, attributes) {
              const { data, error } = await service.auth.admin.updateUserById(
                userId,
                attributes,
              );
              return { data, error };
            },
          },
        },
        from() {
          return {
            update(values) {
              return {
                eq(_field, value) {
                  return {
                    async select(columns) {
                      const { data, error } = await service
                        .from("profiles")
                        .update(values)
                        .eq("id", value)
                        .select(columns);
                      return { data, error };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

if ((import.meta as ImportMeta).main) {
  Deno.serve(
    createChangeTemporaryPasswordHandler(
      createChangeTemporaryPasswordRuntimeDependencies(),
    ),
  );
}
