import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

interface ImportMeta {
  main?: boolean;
}

export const MAX_PUSH_WORKER_BODY_BYTES = 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const TARGET_PATH_PATTERN =
  /^\/teams\/[a-z0-9]+(?:-[a-z0-9]+)*\/matches\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/rsvp$/u;
const EVENT_KINDS = new Set([
  "invitation",
  "manual_reminder",
  "configured_reminder",
  "two_hour_reminder",
]);

type PushOutcome = "sent" | "retry" | "expired" | "permanent";

type PushClaim = {
  deliveryId: string;
  outboxId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  targetPath: string;
  eventKind:
    | "invitation"
    | "manual_reminder"
    | "configured_reminder"
    | "two_hour_reminder";
  attempt: number;
};

type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type VapidConfiguration = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

type PushProviderResult = { statusCode?: number };

export type SendWebPushDependencies = {
  internalSecret: string;
  claimLimit: number;
  vapid: VapidConfiguration;
  claim(limit: number): Promise<unknown>;
  send(
    subscription: PushSubscription,
    payload: string,
    vapid: VapidConfiguration,
  ): Promise<PushProviderResult>;
  settle(
    deliveryId: string,
    outcome: PushOutcome,
    errorCode: string | null,
  ): Promise<void>;
};

type ServiceClient = {
  rpc(
    name: "claim_push_deliveries" | "settle_push_delivery",
    arguments_: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null }>;
};

const ERROR_MESSAGES = {
  method_not_allowed: "Phương thức không được hỗ trợ.",
  unsupported_media_type: "Định dạng yêu cầu không được hỗ trợ.",
  unauthorized: "Không thể xác minh yêu cầu nội bộ.",
  body_too_large: "Yêu cầu quá lớn.",
  invalid_payload: "Dữ liệu kích hoạt thông báo không hợp lệ.",
  claim_failed: "Không thể nhận hàng đợi thông báo.",
} as const;

type ErrorCode = keyof typeof ERROR_MESSAGES;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
    },
  });
}

function failure(code: ErrorCode, status: number): Response {
  return json({ ok: false, code, message: ERROR_MESSAGES[code] }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  return Number.isSafeInteger(length) && length > MAX_PUSH_WORKER_BODY_BYTES;
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
      if (length > MAX_PUSH_WORKER_BODY_BYTES) {
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

function isExactDatabasePayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    value.source === "database"
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function boundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function parseClaim(value: unknown): PushClaim | null {
  if (!isRecord(value)) return null;
  const deliveryId = value.delivery_id;
  const outboxId = value.outbox_id;
  const endpoint = value.endpoint;
  const p256dh = value.p256dh;
  const auth = value.auth;
  const title = value.title;
  const body = value.body;
  const targetPath = value.target_path;
  const eventKind = value.event_kind;
  const attempt = value.attempt;
  if (
    typeof deliveryId !== "string" ||
    !UUID_PATTERN.test(deliveryId) ||
    typeof outboxId !== "string" ||
    !UUID_PATTERN.test(outboxId) ||
    !boundedString(endpoint, 10, 2048) ||
    !boundedString(p256dh, 80, 200) ||
    !BASE64URL_PATTERN.test(p256dh) ||
    !boundedString(auth, 12, 40) ||
    !BASE64URL_PATTERN.test(auth) ||
    !boundedString(title, 1, 120) ||
    !boundedString(body, 1, 500) ||
    !boundedString(targetPath, 1, 220) ||
    !TARGET_PATH_PATTERN.test(targetPath) ||
    typeof eventKind !== "string" ||
    !EVENT_KINDS.has(eventKind) ||
    !Number.isInteger(attempt) ||
    (attempt as number) < 1 ||
    (attempt as number) > 20
  ) {
    return null;
  }
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return null;
  }
  if (endpointUrl.protocol !== "https:" || endpointUrl.href !== endpoint) return null;
  return {
    deliveryId,
    outboxId,
    endpoint,
    p256dh,
    auth,
    title,
    body,
    targetPath,
    eventKind: eventKind as PushClaim["eventKind"],
    attempt: attempt as number,
  };
}

function safeDeliveryId(value: unknown): string | null {
  if (!isRecord(value) || typeof value.delivery_id !== "string") return null;
  return UUID_PATTERN.test(value.delivery_id) ? value.delivery_id : null;
}

function providerStatus(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const status = value.statusCode ?? value.status;
  return Number.isInteger(status) && (status as number) >= 100 && (status as number) <= 599
    ? (status as number)
    : null;
}

function classifyProviderStatus(status: number): {
  outcome: PushOutcome;
  errorCode: string | null;
} {
  if (status >= 200 && status <= 299) {
    return { outcome: "sent", errorCode: null };
  }
  if (status === 404 || status === 410) {
    return { outcome: "expired", errorCode: `provider_${status}` };
  }
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return { outcome: "retry", errorCode: `provider_${status}` };
  }
  return { outcome: "permanent", errorCode: `provider_${status}` };
}

function notificationPayload(claim: PushClaim): string {
  return JSON.stringify({
    version: 1,
    outboxId: claim.outboxId,
    eventKind: claim.eventKind,
    title: claim.title,
    body: claim.body,
    url: claim.targetPath,
    tag: `pro7-match-${claim.outboxId}`,
  });
}

type PushCounts = {
  claimed: number;
  sent: number;
  retry: number;
  expired: number;
  failed: number;
  settleErrors: number;
};

async function safelySettle(
  dependencies: SendWebPushDependencies,
  counts: PushCounts,
  deliveryId: string,
  outcome: PushOutcome,
  errorCode: string | null,
): Promise<void> {
  try {
    await dependencies.settle(deliveryId, outcome, errorCode);
  } catch {
    counts.settleErrors += 1;
  }
}

async function processClaim(
  dependencies: SendWebPushDependencies,
  counts: PushCounts,
  rawClaim: unknown,
): Promise<void> {
  const claim = parseClaim(rawClaim);
  if (!claim) {
    counts.failed += 1;
    const deliveryId = safeDeliveryId(rawClaim);
    if (deliveryId) {
      await safelySettle(
        dependencies,
        counts,
        deliveryId,
        "permanent",
        "malformed_claim",
      );
    }
    return;
  }

  let classification: { outcome: PushOutcome; errorCode: string | null };
  try {
    const providerResult = await dependencies.send(
      {
        endpoint: claim.endpoint,
        keys: { p256dh: claim.p256dh, auth: claim.auth },
      },
      notificationPayload(claim),
      dependencies.vapid,
    );
    classification = classifyProviderStatus(providerStatus(providerResult) ?? 503);
  } catch (error) {
    const status = providerStatus(error);
    classification = status === null
      ? { outcome: "retry", errorCode: "network_error" }
      : classifyProviderStatus(status);
  }

  if (classification.outcome === "sent") counts.sent += 1;
  else if (classification.outcome === "retry") counts.retry += 1;
  else if (classification.outcome === "expired") counts.expired += 1;
  else counts.failed += 1;

  await safelySettle(
    dependencies,
    counts,
    claim.deliveryId,
    classification.outcome,
    classification.errorCode,
  );
}

export function createSendWebPushHandler(
  dependencies: SendWebPushDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") return failure("method_not_allowed", 405);
    if (!hasJsonContentType(request)) {
      return failure("unsupported_media_type", 415);
    }
    const receivedSecret = request.headers.get("x-pro7-push-secret") ?? "";
    if (!constantTimeEqual(receivedSecret, dependencies.internalSecret)) {
      return failure("unauthorized", 401);
    }
    if (declaredBodyTooLarge(request)) return failure("body_too_large", 413);
    const body = await readBoundedJson(request);
    if (!body.ok) {
      return failure(body.code, body.code === "body_too_large" ? 413 : 400);
    }
    if (!isExactDatabasePayload(body.value)) {
      return failure("invalid_payload", 400);
    }

    let claimed: unknown;
    try {
      claimed = await dependencies.claim(dependencies.claimLimit);
    } catch {
      return failure("claim_failed", 500);
    }
    if (!Array.isArray(claimed) || claimed.length > dependencies.claimLimit) {
      return failure("claim_failed", 500);
    }

    const counts: PushCounts = {
      claimed: claimed.length,
      sent: 0,
      retry: 0,
      expired: 0,
      failed: 0,
      settleErrors: 0,
    };
    for (const claim of claimed) {
      await processClaim(dependencies, counts, claim);
    }
    return json({ ok: true, ...counts }, 200);
  };
}

function requiredEnvironment(
  getEnvironment: (name: string) => string | undefined,
  name: string,
): string {
  const value = getEnvironment(name)?.trim();
  if (!value) throw new Error("Missing required Edge Function configuration.");
  return value;
}

function batchSize(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 50;
  if (!/^\d{1,3}$/u.test(value.trim())) {
    throw new Error("Missing required Edge Function configuration.");
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("Missing required Edge Function configuration.");
  }
  return parsed;
}

type SendNotification = (
  subscription: PushSubscription,
  payload: string,
  options: {
    TTL: number;
    urgency: "high";
    vapidDetails: {
      subject: string;
      publicKey: string;
      privateKey: string;
    };
  },
) => Promise<PushProviderResult>;

export function createSendWebPushRuntimeDependencies(
  options: {
    getEnvironment?: (name: string) => string | undefined;
    createSupabaseClient?: typeof createClient;
    sendNotification?: SendNotification;
  } = {},
): SendWebPushDependencies {
  const getEnvironment = options.getEnvironment ?? ((name: string) => Deno.env.get(name));
  const url = requiredEnvironment(getEnvironment, "SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment(
    getEnvironment,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const internalSecret = requiredEnvironment(
    getEnvironment,
    "PRO7_PUSH_INTERNAL_SECRET",
  );
  const subject = requiredEnvironment(getEnvironment, "PRO7_VAPID_SUBJECT");
  const publicKey = requiredEnvironment(getEnvironment, "PRO7_VAPID_PUBLIC_KEY");
  const privateKey = requiredEnvironment(getEnvironment, "PRO7_VAPID_PRIVATE_KEY");
  if (internalSecret.length < 32 || !/^(?:mailto:|https:\/\/)/u.test(subject)) {
    throw new Error("Missing required Edge Function configuration.");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Missing required Edge Function configuration.");
  }
  if (parsedUrl.protocol !== "https:" || parsedUrl.origin !== url) {
    throw new Error("Missing required Edge Function configuration.");
  }

  const createSupabaseClient = options.createSupabaseClient ?? createClient;
  const service = createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }) as unknown as ServiceClient;
  const sendNotification = options.sendNotification ?? (
    (subscription, payload, sendOptions) =>
      webPush.sendNotification(subscription, payload, sendOptions)
  );

  return {
    internalSecret,
    claimLimit: batchSize(getEnvironment("PRO7_PUSH_BATCH_SIZE")),
    vapid: { subject, publicKey, privateKey },
    async claim(limit) {
      const result = await service.rpc("claim_push_deliveries", { p_limit: limit });
      if (result.error || !Array.isArray(result.data)) {
        throw new Error("Push claim failed.");
      }
      return result.data;
    },
    send(subscription, payload, vapid) {
      return sendNotification(subscription, payload, {
        TTL: 86_400,
        urgency: "high",
        vapidDetails: vapid,
      });
    },
    async settle(deliveryId, outcome, errorCode) {
      const result = await service.rpc("settle_push_delivery", {
        p_delivery_id: deliveryId,
        p_outcome: outcome,
        p_error_code: errorCode,
      });
      if (result.error) throw new Error("Push settlement failed.");
    },
  };
}

if ((import.meta as ImportMeta).main) {
  Deno.serve(
    createSendWebPushHandler(createSendWebPushRuntimeDependencies()),
  );
}
