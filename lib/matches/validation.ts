import { isUuid, type AttendanceResponseStatus } from "./model";

type FieldErrors = Readonly<Record<string, string>>;
type ValidationError =
  | Readonly<{ ok: false; kind: "malformed" }>
  | Readonly<{ ok: false; kind: "validation"; fieldErrors: FieldErrors }>;

export type CreateMatchPayload = Readonly<{
  opponent: string;
  startsAt: string;
  venue: string | null;
  isHome: boolean;
  rsvpDeadline: string;
}>;

export type MatchMutationPayload =
  | Readonly<{ action: "update"; opponent: string; startsAt: string; venue: string | null; isHome: boolean; rsvpDeadline: string; expectedUpdatedAt: string }>
  | Readonly<{ action: "complete"; teamScore: number; opponentScore: number; expectedUpdatedAt: string }>
  | Readonly<{ action: "cancel"; expectedUpdatedAt: string }>;

export type AttendancePayload =
  | Readonly<{ action: "invite"; userIds: readonly string[] }>
  | Readonly<{ action: "respond"; status: AttendanceResponseStatus; note: string | null; expectedUpdatedAt: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  ) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf());
}

function normalizedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length >= min && normalized.length <= max ? normalized : null;
}

function parseMatchFields(value: Record<string, unknown>): { value?: CreateMatchPayload; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const opponent = normalizedText(value.opponent, 1, 120);
  if (!opponent) errors.opponent = "Tên đối thủ phải từ 1 đến 120 ký tự.";
  const venue = value.venue === null ? null : normalizedText(value.venue, 1, 200);
  if (value.venue !== null && !venue) errors.venue = "Địa điểm phải từ 1 đến 200 ký tự.";
  if (!isIsoTimestamp(value.startsAt)) errors.startsAt = "Thời gian thi đấu không hợp lệ.";
  if (!isIsoTimestamp(value.rsvpDeadline)) errors.rsvpDeadline = "Hạn xác nhận không hợp lệ.";
  if (typeof value.isHome !== "boolean") errors.isHome = "Sân nhà/sân khách không hợp lệ.";
  if (isIsoTimestamp(value.startsAt) && isIsoTimestamp(value.rsvpDeadline) && new Date(value.rsvpDeadline).valueOf() > new Date(value.startsAt).valueOf()) {
    errors.rsvpDeadline = "Hạn xác nhận phải trước giờ thi đấu.";
  }
  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    value: Object.freeze({
      opponent: opponent as string,
      startsAt: value.startsAt as string,
      venue,
      isHome: value.isHome as boolean,
      rsvpDeadline: value.rsvpDeadline as string,
    }),
  };
}

export function validateCreateMatchPayload(value: unknown): { ok: true; value: CreateMatchPayload } | ValidationError {
  const keys = ["opponent", "startsAt", "venue", "isHome", "rsvpDeadline"];
  if (!isRecord(value) || !exactKeys(value, keys)) return { ok: false, kind: "malformed" };
  const parsed = parseMatchFields(value);
  return parsed.value ? { ok: true, value: parsed.value } : { ok: false, kind: "validation", fieldErrors: parsed.errors };
}

function validateUpdatedAt(value: unknown, errors: Record<string, string>) {
  if (!isIsoTimestamp(value)) errors.expectedUpdatedAt = "Phiên bản dữ liệu không hợp lệ.";
}

function validScore(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 32767;
}

export function validateMatchMutationPayload(value: unknown): { ok: true; value: MatchMutationPayload } | ValidationError {
  if (!isRecord(value) || typeof value.action !== "string") return { ok: false, kind: "malformed" };
  if (value.action === "update") {
    const keys = ["action", "opponent", "startsAt", "venue", "isHome", "rsvpDeadline", "expectedUpdatedAt"];
    if (!exactKeys(value, keys)) return { ok: false, kind: "malformed" };
    const parsed = parseMatchFields(value);
    validateUpdatedAt(value.expectedUpdatedAt, parsed.errors);
    return parsed.value && Object.keys(parsed.errors).length === 0
      ? { ok: true, value: Object.freeze({ action: "update", ...parsed.value, expectedUpdatedAt: value.expectedUpdatedAt as string }) }
      : { ok: false, kind: "validation", fieldErrors: parsed.errors };
  }
  if (value.action === "complete") {
    if (!exactKeys(value, ["action", "teamScore", "opponentScore", "expectedUpdatedAt"])) return { ok: false, kind: "malformed" };
    const errors: Record<string, string> = {};
    if (!validScore(value.teamScore)) errors.teamScore = "Tỉ số đội không hợp lệ.";
    if (!validScore(value.opponentScore)) errors.opponentScore = "Tỉ số đối thủ không hợp lệ.";
    validateUpdatedAt(value.expectedUpdatedAt, errors);
    return Object.keys(errors).length > 0
      ? { ok: false, kind: "validation", fieldErrors: errors }
      : { ok: true, value: Object.freeze({ action: "complete", teamScore: value.teamScore as number, opponentScore: value.opponentScore as number, expectedUpdatedAt: value.expectedUpdatedAt as string }) };
  }
  if (value.action === "cancel") {
    if (!exactKeys(value, ["action", "expectedUpdatedAt"])) return { ok: false, kind: "malformed" };
    const errors: Record<string, string> = {};
    validateUpdatedAt(value.expectedUpdatedAt, errors);
    return Object.keys(errors).length > 0
      ? { ok: false, kind: "validation", fieldErrors: errors }
      : { ok: true, value: Object.freeze({ action: "cancel", expectedUpdatedAt: value.expectedUpdatedAt as string }) };
  }
  return { ok: false, kind: "malformed" };
}

export function validateAttendancePayload(value: unknown): { ok: true; value: AttendancePayload } | ValidationError {
  if (!isRecord(value) || typeof value.action !== "string") return { ok: false, kind: "malformed" };
  if (value.action === "invite") {
    if (!exactKeys(value, ["action", "userIds"])) return { ok: false, kind: "malformed" };
    if (!Array.isArray(value.userIds) || value.userIds.length === 0 || value.userIds.length > 200 || !value.userIds.every(isUuid)) {
      return { ok: false, kind: "validation", fieldErrors: { userIds: "Chọn từ 1 đến 200 thành viên hợp lệ." } };
    }
    return { ok: true, value: Object.freeze({ action: "invite", userIds: Object.freeze([...new Set(value.userIds)]) }) };
  }
  if (value.action === "respond") {
    if (!exactKeys(value, ["action", "status", "note", "expectedUpdatedAt"])) return { ok: false, kind: "malformed" };
    const errors: Record<string, string> = {};
    if (value.status !== "available" && value.status !== "unavailable") errors.status = "Phản hồi tham gia không hợp lệ.";
    const note = value.note === null ? null : normalizedText(value.note, 1, 300);
    if (value.note !== null && !note) errors.note = "Ghi chú phải từ 1 đến 300 ký tự.";
    validateUpdatedAt(value.expectedUpdatedAt, errors);
    return Object.keys(errors).length > 0
      ? { ok: false, kind: "validation", fieldErrors: errors }
      : { ok: true, value: Object.freeze({ action: "respond", status: value.status as AttendanceResponseStatus, note, expectedUpdatedAt: value.expectedUpdatedAt as string }) };
  }
  return { ok: false, kind: "malformed" };
}
