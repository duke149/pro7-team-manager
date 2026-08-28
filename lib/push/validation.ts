import type { PushSubscriptionValidation } from "./model";

export const MAX_PUSH_SUBSCRIPTION_BODY_BYTES = 16 * 1024;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value !== value.trim() || value.length < 10 || value.length > 2048) {
    return false;
  }
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" &&
      endpoint.username === "" &&
      endpoint.password === "" &&
      endpoint.hash === "" &&
      endpoint.href === value;
  } catch {
    return false;
  }
}

function key(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    BASE64URL_PATTERN.test(value);
}

function invalid(field: string, message: string): PushSubscriptionValidation {
  return { ok: false, field, message };
}

export function validatePushSubscriptionMutation(
  method: string,
  value: unknown,
): PushSubscriptionValidation {
  if (!isRecord(value)) return invalid("body", "Dữ liệu đăng ký không hợp lệ.");
  if (method === "DELETE") {
    if (!exact(value, ["endpoint"]) || !validEndpoint(value.endpoint)) {
      return invalid("endpoint", "Địa chỉ thiết bị không hợp lệ.");
    }
    return { ok: true, value: Object.freeze({ action: "unsubscribe", endpoint: value.endpoint }) };
  }
  if (method !== "POST" || !exact(value, ["endpoint", "expirationTime", "keys"])) {
    return invalid("body", "Dữ liệu đăng ký không hợp lệ.");
  }
  if (!validEndpoint(value.endpoint)) {
    return invalid("endpoint", "Địa chỉ thiết bị không hợp lệ.");
  }
  if (
    value.expirationTime !== null &&
    (!Number.isSafeInteger(value.expirationTime) || Number(value.expirationTime) <= 0)
  ) {
    return invalid("expirationTime", "Thời hạn đăng ký không hợp lệ.");
  }
  if (!isRecord(value.keys) || !exact(value.keys, ["p256dh", "auth"])) {
    return invalid("keys", "Khóa thiết bị không hợp lệ.");
  }
  if (!key(value.keys.p256dh, 40, 200)) {
    return invalid("p256dh", "Khóa mã hóa thiết bị không hợp lệ.");
  }
  if (!key(value.keys.auth, 8, 100)) {
    return invalid("auth", "Khóa xác thực thiết bị không hợp lệ.");
  }
  return {
    ok: true,
    value: Object.freeze({
      action: "subscribe",
      endpoint: value.endpoint,
      expirationTime: value.expirationTime as number | null,
      p256dh: value.keys.p256dh,
      auth: value.keys.auth,
    }),
  };
}
