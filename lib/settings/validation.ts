import { isIsoTimestamp } from "../matches/validation";

type Mutation =
  | { action: "team"; name: string; slug: string }
  | { action: "notifications"; matchInvitations: boolean; matchReminders: boolean; reminderHoursBefore: number; expectedUpdatedAt: string }
  | { action: "payments"; bankCode: string; accountNumber: string; accountHolder: string; transferPrefix: string | null; expectedUpdatedAt: string }
  | { action: "delete"; confirmation: string; slugConfirmation: string };

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]) { const actual = Object.keys(value).sort(); return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]); }

export function validateSettingsMutation(value: unknown): { ok: true; value: Mutation } | { ok: false; fieldErrors: Readonly<Record<string, string>> } {
  if (!record(value) || typeof value.action !== "string") return { ok: false, fieldErrors: {} };
  if (value.action === "team" && exact(value, ["action", "name", "slug"])) {
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const slug = typeof value.slug === "string" ? value.slug.trim() : "";
    const errors: Record<string, string> = {};
    if (name.length < 1 || name.length > 100) errors.name = "Tên đội phải có từ 1 đến 100 ký tự.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 63) errors.slug = "Slug chỉ gồm chữ thường, số và dấu gạch ngang.";
    return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true, value: { action: "team", name, slug } };
  }
  if (value.action === "notifications" && exact(value, ["action", "matchInvitations", "matchReminders", "reminderHoursBefore", "expectedUpdatedAt"])) {
    if (typeof value.matchInvitations === "boolean" && typeof value.matchReminders === "boolean" && Number.isInteger(value.reminderHoursBefore) && Number(value.reminderHoursBefore) >= 1 && Number(value.reminderHoursBefore) <= 168 && typeof value.expectedUpdatedAt === "string" && isIsoTimestamp(value.expectedUpdatedAt)) return { ok: true, value: { action: "notifications", matchInvitations: value.matchInvitations, matchReminders: value.matchReminders, reminderHoursBefore: Number(value.reminderHoursBefore), expectedUpdatedAt: value.expectedUpdatedAt } };
    return { ok: false, fieldErrors: { reminderHoursBefore: "Thời gian nhắc phải từ 1 đến 168 giờ." } };
  }
  if (value.action === "payments" && exact(value, ["action", "bankCode", "accountNumber", "accountHolder", "transferPrefix", "expectedUpdatedAt"])) {
    const bankCode = typeof value.bankCode === "string" ? value.bankCode.trim().toLocaleUpperCase("en-US") : "";
    const accountNumber = typeof value.accountNumber === "string" ? value.accountNumber.trim() : "";
    const accountHolder = typeof value.accountHolder === "string" ? value.accountHolder.trim() : "";
    const transferPrefix = typeof value.transferPrefix === "string" ? value.transferPrefix.trim() || null : value.transferPrefix === null ? null : "invalid";
    const errors: Record<string, string> = {};
    if (!/^[A-Z0-9]{2,12}$/u.test(bankCode)) errors.bankCode = "Mã ngân hàng phải có 2–12 chữ cái hoặc chữ số.";
    if (!/^[0-9]{4,32}$/u.test(accountNumber)) errors.accountNumber = "Số tài khoản phải có 4–32 chữ số.";
    if (accountHolder.length < 2 || accountHolder.length > 100) errors.accountHolder = "Tên chủ tài khoản phải có 2–100 ký tự.";
    if (!(transferPrefix === null || (typeof transferPrefix === "string" && transferPrefix.length <= 40))) errors.transferPrefix = "Tiền tố chuyển khoản tối đa 40 ký tự.";
    if (typeof value.expectedUpdatedAt !== "string" || !isIsoTimestamp(value.expectedUpdatedAt)) errors.expectedUpdatedAt = "Phiên bản cài đặt không hợp lệ.";
    return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true, value: { action: "payments", bankCode, accountNumber, accountHolder, transferPrefix: transferPrefix as string | null, expectedUpdatedAt: value.expectedUpdatedAt as string } };
  }
  if (value.action === "delete" && exact(value, ["action", "confirmation", "slugConfirmation"]) && typeof value.confirmation === "string" && typeof value.slugConfirmation === "string" && value.confirmation.length <= 100 && value.slugConfirmation.length <= 63) return { ok: true, value: { action: "delete", confirmation: value.confirmation, slugConfirmation: value.slugConfirmation } };
  return { ok: false, fieldErrors: {} };
}
