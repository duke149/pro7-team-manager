import { isUuid } from "../matches/model";
import { isIsoTimestamp } from "../matches/validation";
import type { FinanceDirection } from "./model";

type FieldErrors = Readonly<Record<string, string>>;
type ValidationFailure =
  | Readonly<{ ok: false; kind: "malformed" }>
  | Readonly<{ ok: false; kind: "validation"; fieldErrors: FieldErrors }>;

export type CreateFinanceEntryPayload = Readonly<{
  direction: FinanceDirection;
  amountVnd: number;
  category: string;
  occurredOn: string;
  description: string;
}>;
export type FinanceEntryMutationPayload = Readonly<{
  action: "void";
  entryId: string;
  reason: string;
  expectedUpdatedAt: string;
}>;
export type MemberDuePayload =
  | Readonly<{ action: "create"; userId: string; periodStart: string; amountVnd: number; dueDate: string }>
  | Readonly<{ action: "pay"; dueId: string; note: string | null; expectedUpdatedAt: string }>
  | Readonly<{ action: "voidPayment"; dueId: string; reason: string; expectedUpdatedAt: string }>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}
function text(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return Array.from(normalized).length >= minimum && Array.from(normalized).length <= maximum ? normalized : null;
}
function amount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
export function isDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function validation(fieldErrors: Record<string, string>): ValidationFailure {
  return { ok: false, kind: "validation", fieldErrors };
}

export function validateCreateFinanceEntryPayload(value: unknown): { ok: true; value: CreateFinanceEntryPayload } | ValidationFailure {
  if (!record(value) || !exactKeys(value, ["direction", "amountVnd", "category", "occurredOn", "description"])) return { ok: false, kind: "malformed" };
  const errors: Record<string, string> = {};
  if (value.direction !== "income" && value.direction !== "expense") errors.direction = "Loại giao dịch không hợp lệ.";
  if (!amount(value.amountVnd)) errors.amountVnd = "Số tiền phải là số nguyên VND lớn hơn 0.";
  const category = text(value.category, 1, 80);
  if (!category) errors.category = "Danh mục phải từ 1 đến 80 ký tự.";
  const description = text(value.description, 1, 500);
  if (!description) errors.description = "Nội dung phải từ 1 đến 500 ký tự.";
  if (!isDate(value.occurredOn)) errors.occurredOn = "Ngày giao dịch không hợp lệ.";
  return Object.keys(errors).length > 0 ? validation(errors) : { ok: true, value: Object.freeze({ direction: value.direction as FinanceDirection, amountVnd: value.amountVnd as number, category: category as string, occurredOn: value.occurredOn as string, description: description as string }) };
}

export function validateFinanceEntryMutationPayload(value: unknown): { ok: true; value: FinanceEntryMutationPayload } | ValidationFailure {
  if (!record(value) || !exactKeys(value, ["action", "entryId", "reason", "expectedUpdatedAt"]) || value.action !== "void") return { ok: false, kind: "malformed" };
  const errors: Record<string, string> = {};
  if (!isUuid(value.entryId)) errors.entryId = "Giao dịch không hợp lệ.";
  const reason = text(value.reason, 1, 300);
  if (!reason) errors.reason = "Lý do hủy phải từ 1 đến 300 ký tự.";
  if (!isIsoTimestamp(value.expectedUpdatedAt)) errors.expectedUpdatedAt = "Phiên bản dữ liệu không hợp lệ.";
  return Object.keys(errors).length > 0 ? validation(errors) : { ok: true, value: Object.freeze({ action: "void", entryId: value.entryId as string, reason: reason as string, expectedUpdatedAt: value.expectedUpdatedAt as string }) };
}

export function validateMemberDuePayload(value: unknown): { ok: true; value: MemberDuePayload } | ValidationFailure {
  if (!record(value) || typeof value.action !== "string") return { ok: false, kind: "malformed" };
  if (value.action === "create") {
    if (!exactKeys(value, ["action", "userId", "periodStart", "amountVnd", "dueDate"])) return { ok: false, kind: "malformed" };
    const errors: Record<string, string> = {};
    if (!isUuid(value.userId)) errors.userId = "Thành viên không hợp lệ.";
    if (!isDate(value.periodStart) || !String(value.periodStart).endsWith("-01")) errors.periodStart = "Kỳ phí phải bắt đầu vào ngày đầu tháng.";
    if (!amount(value.amountVnd)) errors.amountVnd = "Số tiền phải là số nguyên VND lớn hơn 0.";
    if (!isDate(value.dueDate) || (isDate(value.periodStart) && value.dueDate < value.periodStart)) errors.dueDate = "Hạn đóng phí không hợp lệ.";
    return Object.keys(errors).length > 0 ? validation(errors) : { ok: true, value: Object.freeze({ action: "create", userId: value.userId as string, periodStart: value.periodStart as string, amountVnd: value.amountVnd as number, dueDate: value.dueDate as string }) };
  }
  if (value.action === "pay") {
    if (!exactKeys(value, ["action", "dueId", "note", "expectedUpdatedAt"])) return { ok: false, kind: "malformed" };
    const errors: Record<string, string> = {};
    if (!isUuid(value.dueId)) errors.dueId = "Khoản phí không hợp lệ.";
    const note = value.note === null ? null : text(value.note, 1, 300);
    if (value.note !== null && !note) errors.note = "Ghi chú phải từ 1 đến 300 ký tự.";
    if (!isIsoTimestamp(value.expectedUpdatedAt)) errors.expectedUpdatedAt = "Phiên bản dữ liệu không hợp lệ.";
    return Object.keys(errors).length > 0 ? validation(errors) : { ok: true, value: Object.freeze({ action: "pay", dueId: value.dueId as string, note, expectedUpdatedAt: value.expectedUpdatedAt as string }) };
  }
  if (value.action === "voidPayment") {
    if (!exactKeys(value, ["action", "dueId", "reason", "expectedUpdatedAt"])) return { ok: false, kind: "malformed" };
    const errors: Record<string, string> = {};
    if (!isUuid(value.dueId)) errors.dueId = "Khoản phí không hợp lệ.";
    const reason = text(value.reason, 1, 300);
    if (!reason) errors.reason = "Lý do hủy phải từ 1 đến 300 ký tự.";
    if (!isIsoTimestamp(value.expectedUpdatedAt)) errors.expectedUpdatedAt = "Phiên bản dữ liệu không hợp lệ.";
    return Object.keys(errors).length > 0 ? validation(errors) : { ok: true, value: Object.freeze({ action: "voidPayment", dueId: value.dueId as string, reason: reason as string, expectedUpdatedAt: value.expectedUpdatedAt as string }) };
  }
  return { ok: false, kind: "malformed" };
}
