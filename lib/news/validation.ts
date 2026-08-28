import { isUuid } from "../matches/model";
import { isIsoTimestamp } from "../matches/validation";

export type NewsMutation =
  | Readonly<{ action: "create"; title: string; body: string }>
  | Readonly<{ action: "update"; id: string; title: string; body: string; expectedUpdatedAt: string }>
  | Readonly<{ action: "publish" | "archive" | "restore"; id: string; expectedUpdatedAt: string }>;

type ValidationResult = Readonly<{ ok: true; value: NewsMutation }> | Readonly<{ ok: false; fieldErrors: Readonly<Record<string, string>> }>;

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]) { return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"); }
function normalizedText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function content(value: Record<string, unknown>) {
  const title = normalizedText(value.title); const body = normalizedText(value.body); const fieldErrors: Record<string, string> = {};
  if (Array.from(title).length < 1 || Array.from(title).length > 160) fieldErrors.title = "Tiêu đề phải có 1–160 ký tự.";
  if (Array.from(body).length < 1 || Array.from(body).length > 5000) fieldErrors.body = "Nội dung phải có 1–5000 ký tự.";
  return { title, body, fieldErrors };
}

export function validateNewsMutation(value: unknown): ValidationResult {
  if (!record(value) || typeof value.action !== "string") return { ok: false, fieldErrors: {} };
  if (value.action === "create" && exact(value, ["action", "title", "body"])) {
    const parsed = content(value); return Object.keys(parsed.fieldErrors).length ? { ok: false, fieldErrors: parsed.fieldErrors } : { ok: true, value: { action: "create", title: parsed.title, body: parsed.body } };
  }
  if (value.action === "update" && exact(value, ["action", "id", "title", "body", "expectedUpdatedAt"])) {
    const parsed = content(value); const id = typeof value.id === "string" ? value.id.trim() : ""; const expectedUpdatedAt = typeof value.expectedUpdatedAt === "string" ? value.expectedUpdatedAt : "";
    if (!isUuid(id)) parsed.fieldErrors.id = "Tin đội không hợp lệ.";
    if (!isIsoTimestamp(expectedUpdatedAt)) parsed.fieldErrors.expectedUpdatedAt = "Phiên bản tin không hợp lệ.";
    return Object.keys(parsed.fieldErrors).length ? { ok: false, fieldErrors: parsed.fieldErrors } : { ok: true, value: { action: "update", id, title: parsed.title, body: parsed.body, expectedUpdatedAt } };
  }
  if ((value.action === "publish" || value.action === "archive" || value.action === "restore") && exact(value, ["action", "id", "expectedUpdatedAt"])) {
    const id = typeof value.id === "string" ? value.id.trim() : ""; const expectedUpdatedAt = typeof value.expectedUpdatedAt === "string" ? value.expectedUpdatedAt : ""; const fieldErrors: Record<string, string> = {};
    if (!isUuid(id)) fieldErrors.id = "Tin đội không hợp lệ.";
    if (!isIsoTimestamp(expectedUpdatedAt)) fieldErrors.expectedUpdatedAt = "Phiên bản tin không hợp lệ.";
    return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true, value: { action: value.action, id, expectedUpdatedAt } };
  }
  return { ok: false, fieldErrors: {} };
}
