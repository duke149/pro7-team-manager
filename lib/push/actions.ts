import type { Database } from "../supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "../matches/model";
import {
  MAX_PUSH_SUBSCRIPTION_BODY_BYTES,
  validatePushSubscriptionMutation,
} from "./validation";

type PushRpcName = "upsert_push_subscription" | "delete_push_subscription";

export type PushSubscriptionActionDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  rpc(
    name: PushRpcName,
    arguments_: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null }>;
};

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", pragma: "no-cache" },
  });
}

function failure(status: number, code: string, message: string): Response {
  return json({ ok: false, code, message }, status);
}

function sameOrigin(request: Request): boolean {
  try {
    const origin = request.headers.get("origin");
    return origin === new URL(request.url).origin ||
      (!origin && request.headers.get("sec-fetch-site") === "same-origin");
  } catch {
    return false;
  }
}

function jsonContent(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json";
}

function declaredTooLarge(request: Request): boolean {
  const value = request.headers.get("content-length")?.trim();
  if (!value || !/^\d+$/u.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > MAX_PUSH_SUBSCRIPTION_BODY_BYTES;
}

async function boundedJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; tooLarge: boolean }> {
  if (!request.body) return { ok: false, tooLarge: false };
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_PUSH_SUBSCRIPTION_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, tooLarge: true };
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
    return { ok: false, tooLarge: false };
  }
}

async function defaultDependencies(): Promise<PushSubscriptionActionDependencies> {
  const [{ getCurrentUser }, { createServerSupabaseClient }] = await Promise.all([
    import("../supabase/auth"),
    import("../supabase/server"),
  ]);
  const client = await createServerSupabaseClient();
  return {
    getCurrentUser,
    rpc: (name, arguments_) => (client as SupabaseClient<Database>).rpc(name, arguments_ as never),
  };
}

function userAgent(request: Request): string | null {
  const value = request.headers.get("user-agent")?.trim();
  return value && value.length <= 500 ? value : null;
}

export async function mutatePushSubscription(
  request: Request,
  supplied?: PushSubscriptionActionDependencies,
): Promise<Response> {
  try {
    if (!sameOrigin(request)) return failure(403, "forbidden", "Yêu cầu không được phép.");
    if (request.method !== "POST" && request.method !== "DELETE") {
      return failure(405, "method_not_allowed", "Phương thức không được hỗ trợ.");
    }
    if (!jsonContent(request)) {
      return failure(415, "content_type", "Định dạng yêu cầu không được hỗ trợ.");
    }
    if (declaredTooLarge(request)) return failure(413, "too_large", "Yêu cầu quá lớn.");
    const body = await boundedJson(request);
    if (!body.ok) {
      return body.tooLarge
        ? failure(413, "too_large", "Yêu cầu quá lớn.")
        : failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.");
    }
    const parsed = validatePushSubscriptionMutation(request.method, body.value);
    if (!parsed.ok) {
      return json({ ok: false, code: "validation", field: parsed.field, message: parsed.message }, 422);
    }
    const dependencies = supplied ?? await defaultDependencies();
    const user = await dependencies.getCurrentUser();
    if (!user || !isUuid(user.id)) {
      return failure(401, "unauthenticated", "Vui lòng đăng nhập lại.");
    }

    if (parsed.value.action === "subscribe") {
      const result = await dependencies.rpc("upsert_push_subscription", {
        p_endpoint: parsed.value.endpoint,
        p_p256dh: parsed.value.p256dh,
        p_auth: parsed.value.auth,
        p_expiration_time: parsed.value.expirationTime,
        p_user_agent: userAgent(request),
      });
      if (result.error || typeof result.data !== "string" || !isUuid(result.data)) {
        return failure(500, "server", "Không thể bật thông báo trên thiết bị này.");
      }
      return json({ ok: true, subscriptionId: result.data }, 201);
    }

    const result = await dependencies.rpc("delete_push_subscription", {
      p_endpoint: parsed.value.endpoint,
    });
    if (result.error || typeof result.data !== "boolean") {
      return failure(500, "server", "Không thể tắt thông báo trên thiết bị này.");
    }
    return json({ ok: true, removed: result.data }, 200);
  } catch {
    return failure(500, "server", "Không thể cập nhật thông báo trên thiết bị này.");
  }
}
