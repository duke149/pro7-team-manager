import type { Database } from "../supabase/database.types";
import "../squad/server-only";
import { isCanonicalOwnAvatarPath } from "./avatar";

const MAX_REQUEST_BYTES = 16 * 1024;
const PROFILE_KEYS = [
  "displayName",
  "phone",
  "dateOfBirth",
  "heightCm",
  "weightKg",
  "preferredPositions",
  "avatarPath",
] as const;
const POSITIONS = ["GK", "DEF", "MID", "ATT"] as const;

export type PreferredPosition = (typeof POSITIONS)[number];
export type OwnProfileUpdate = Pick<
  Database["public"]["Tables"]["profiles"]["Update"],
  | "display_name"
  | "phone"
  | "date_of_birth"
  | "height_cm"
  | "weight_kg"
  | "preferred_positions"
  | "avatar_path"
>;
export type ProfileRecord = Readonly<{
  id: string;
  displayName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  weightKg: number | null;
  preferredPositions: PreferredPosition[];
  avatarPath: string | null;
}>;

type FieldErrors = Record<string, string>;
type ProfilePatchResult =
  | { ok: true; value: OwnProfileUpdate }
  | { ok: false; kind: "malformed" }
  | { ok: false; kind: "validation"; fieldErrors: FieldErrors };

export type ProfileActionDependencies = {
  getCurrentUser: () => Promise<{ id: string } | null>;
  updateProfile: (
    userId: string,
    patch: OwnProfileUpdate,
  ) => Promise<{ ok: true } | { ok: false }>;
  now?: () => Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function isCanonicalProfileAvatarPath(path: string, userId: string): boolean {
  return isCanonicalOwnAvatarPath(path, userId);
}

function nullableBoundedString(
  value: unknown,
  maximum: number,
  field: string,
  message: string,
  errors: FieldErrors,
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") {
    errors[field] = message;
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maximum) {
    errors[field] = message;
    return undefined;
  }
  return normalized;
}

export function validateProfilePatch(
  input: unknown,
  userId: string,
  now = new Date(),
): ProfilePatchResult {
  if (!isRecord(input)) return { ok: false, kind: "malformed" };
  const keys = Object.keys(input);
  if (
    keys.length === 0 ||
    !keys.every((key) => (PROFILE_KEYS as readonly string[]).includes(key))
  ) {
    return { ok: false, kind: "malformed" };
  }

  const errors: FieldErrors = {};
  const value: OwnProfileUpdate = {};

  if ("displayName" in input) {
    const displayName = nullableBoundedString(
      input.displayName,
      100,
      "displayName",
      "Tên hiển thị tối đa 100 ký tự.",
      errors,
    );
    if (displayName !== undefined) value.display_name = displayName;
  }
  if ("phone" in input) {
    const phone = nullableBoundedString(
      input.phone,
      30,
      "phone",
      "Số điện thoại tối đa 30 ký tự.",
      errors,
    );
    if (phone !== undefined) value.phone = phone;
  }
  if ("dateOfBirth" in input) {
    if (input.dateOfBirth === null || input.dateOfBirth === "") {
      value.date_of_birth = null;
    } else if (typeof input.dateOfBirth !== "string" || !isIsoDate(input.dateOfBirth)) {
      errors.dateOfBirth = "Ngày sinh không hợp lệ.";
    } else if (input.dateOfBirth > now.toISOString().slice(0, 10)) {
      errors.dateOfBirth = "Ngày sinh không được ở tương lai.";
    } else {
      value.date_of_birth = input.dateOfBirth;
    }
  }
  if ("heightCm" in input) {
    if (input.heightCm === null) {
      value.height_cm = null;
    } else if (typeof input.heightCm !== "number" || !Number.isInteger(input.heightCm)) {
      errors.heightCm = "Chiều cao phải là số nguyên từ 100 đến 250 cm.";
    } else if (input.heightCm < 100 || input.heightCm > 250) {
      errors.heightCm = "Chiều cao phải từ 100 đến 250 cm.";
    } else {
      value.height_cm = input.heightCm;
    }
  }
  if ("weightKg" in input) {
    if (input.weightKg === null) {
      value.weight_kg = null;
    } else if (
      typeof input.weightKg !== "number" ||
      !Number.isFinite(input.weightKg) ||
      input.weightKg <= 30 ||
      input.weightKg > 300
    ) {
      errors.weightKg = "Cân nặng phải lớn hơn 30 và không quá 300 kg.";
    } else {
      value.weight_kg = input.weightKg;
    }
  }
  if ("preferredPositions" in input) {
    if (!Array.isArray(input.preferredPositions)) {
      errors.preferredPositions = "Vị trí ưa thích không hợp lệ.";
    } else if (
      input.preferredPositions.some(
        (position) => typeof position !== "string" || !(POSITIONS as readonly string[]).includes(position),
      )
    ) {
      errors.preferredPositions = "Vị trí ưa thích không hợp lệ.";
    } else if (new Set(input.preferredPositions).size !== input.preferredPositions.length) {
      errors.preferredPositions = "Mỗi vị trí chỉ được chọn một lần.";
    } else {
      value.preferred_positions = input.preferredPositions as PreferredPosition[];
    }
  }
  if ("avatarPath" in input) {
    if (input.avatarPath === null) {
      value.avatar_path = null;
    } else if (
      typeof input.avatarPath !== "string" ||
      !isCanonicalProfileAvatarPath(input.avatarPath, userId)
    ) {
      errors.avatarPath = "Đường dẫn ảnh đại diện không hợp lệ.";
    } else {
      value.avatar_path = input.avatarPath;
    }
  }

  return Object.keys(errors).length > 0
    ? { ok: false, kind: "validation", fieldErrors: errors }
    : { ok: true, value };
}

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

function preflightFailure(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const sameOrigin = origin
    ? (() => {
      try {
        return origin === new URL(request.url).origin;
      } catch {
        return false;
      }
    })()
    : request.headers.get("sec-fetch-site") === "same-origin";
  if (!sameOrigin) return failure(403, "forbidden", "Yêu cầu không được phép.");

  const contentType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return contentType === "application/json"
    ? null
    : failure(415, "content_type", "Định dạng yêu cầu không được hỗ trợ.");
}

async function readJsonBody(request: Request): Promise<unknown | undefined> {
  const length = request.headers.get("content-length")?.trim();
  if (length && /^\d+$/u.test(length) && Number(length) > MAX_REQUEST_BYTES) {
    return undefined;
  }
  if (!request.body) return undefined;

  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

async function defaultDependencies(): Promise<ProfileActionDependencies> {
  const { createServerSupabaseClient } = await import("../supabase/server");
  const supabase = await createServerSupabaseClient();
  return {
    async getCurrentUser() {
      const { data, error } = await supabase.auth.getUser();
      return error || !data.user ? null : { id: data.user.id };
    },
    async updateProfile(userId, patch) {
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      return error ? { ok: false } : { ok: true };
    },
    now: () => new Date(),
  };
}

export async function updateOwnProfile(
  request: Request,
  supplied?: ProfileActionDependencies,
): Promise<Response> {
  const rejected = preflightFailure(request);
  if (rejected) return rejected;

  const body = await readJsonBody(request);
  if (body === undefined) {
    return failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.");
  }

  try {
    const dependencies = supplied ?? (await defaultDependencies());
    const user = await dependencies.getCurrentUser();
    if (!user) return failure(401, "unauthenticated", "Phiên đăng nhập không hợp lệ.");

    const parsed = validateProfilePatch(body, user.id, dependencies.now?.() ?? new Date());
    if (!parsed.ok) {
      return parsed.kind === "malformed"
        ? failure(400, "malformed", "Dữ liệu yêu cầu không hợp lệ.")
        : failure(422, "validation", "Vui lòng kiểm tra lại hồ sơ.", parsed.fieldErrors);
    }

    const result = await dependencies.updateProfile(user.id, parsed.value);
    return result.ok
      ? Response.json({ ok: true })
      : failure(500, "server", "Không thể cập nhật hồ sơ. Vui lòng thử lại.");
  } catch {
    return failure(500, "server", "Không thể cập nhật hồ sơ. Vui lòng thử lại.");
  }
}
