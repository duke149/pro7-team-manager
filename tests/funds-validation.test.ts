import assert from "node:assert/strict";
import test from "node:test";

import {
  validateCreateFinanceEntryPayload,
  validateFinanceEntryMutationPayload,
  validateMemberDuePayload,
} from "../lib/funds/validation";

const ENTRY_ID = "00000000-0000-4000-8000-000000000003";
const USER_ID = "00000000-0000-4000-8000-000000000004";
const UPDATED_AT = "2026-10-01T00:00:00.000Z";

test("finance entries require positive safe integer VND and bounded normalized text", () => {
  assert.deepEqual(validateCreateFinanceEntryPayload({
    direction: "expense", amountVnd: 500_000, category: "  Thuê   sân ",
    occurredOn: "2026-10-24", description: "  Sân Riverside  ",
  }), { ok: true, value: { direction: "expense", amountVnd: 500_000, category: "Thuê sân", occurredOn: "2026-10-24", description: "Sân Riverside" } });

  for (const amountVnd of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "500000"]) {
    const result = validateCreateFinanceEntryPayload({ direction: "income", amountVnd, category: "Phí", occurredOn: "2026-10-24", description: "Đóng quỹ" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.fieldErrors?.amountVnd, "Số tiền phải là số nguyên VND lớn hơn 0.");
  }
  for (const [field, value] of [["category", "x".repeat(81)], ["description", "x".repeat(501)]] as const) {
    const result = validateCreateFinanceEntryPayload({ direction: "expense", amountVnd: 1, category: "Phí", occurredOn: "2026-10-24", description: "Chi", [field]: value });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.fieldErrors?.[field]);
  }
});

test("finance create and void payloads reject invalid dates, stale tokens, extra keys, and missing reasons", () => {
  const invalidDate = validateCreateFinanceEntryPayload({ direction: "expense", amountVnd: 1, category: "Phí", occurredOn: "2026-02-30", description: "Chi" });
  assert.equal(invalidDate.ok, false);
  const injected = validateCreateFinanceEntryPayload({ direction: "expense", amountVnd: 1, category: "Phí", occurredOn: "2026-10-24", description: "Chi", balance: 9_000_000 });
  assert.deepEqual(injected, { ok: false, kind: "malformed" });
  const valid = validateFinanceEntryMutationPayload({ action: "void", entryId: ENTRY_ID, reason: "  Nhập trùng  ", expectedUpdatedAt: UPDATED_AT });
  assert.deepEqual(valid, { ok: true, value: { action: "void", entryId: ENTRY_ID, reason: "Nhập trùng", expectedUpdatedAt: UPDATED_AT } });
  for (const reason of ["", "x".repeat(301)]) {
    const result = validateFinanceEntryMutationPayload({ action: "void", entryId: ENTRY_ID, reason, expectedUpdatedAt: UPDATED_AT });
    assert.equal(result.ok, false);
  }
});

test("member dues enforce month periods, due dates, lifecycle shape, and optimistic tokens", () => {
  assert.deepEqual(validateMemberDuePayload({ action: "create", userId: USER_ID, periodStart: "2026-10-01", amountVnd: 500_000, dueDate: "2026-10-10" }), {
    ok: true, value: { action: "create", userId: USER_ID, periodStart: "2026-10-01", amountVnd: 500_000, dueDate: "2026-10-10" },
  });
  for (const value of [
    { action: "create", userId: USER_ID, periodStart: "2026-10-02", amountVnd: 500_000, dueDate: "2026-10-10" },
    { action: "create", userId: USER_ID, periodStart: "2026-10-01", amountVnd: 500_000, dueDate: "2026-09-30" },
    { action: "pay", dueId: ENTRY_ID, note: null, expectedUpdatedAt: "stale" },
    { action: "voidPayment", dueId: ENTRY_ID, reason: "", expectedUpdatedAt: UPDATED_AT },
  ]) assert.equal(validateMemberDuePayload(value).ok, false);

  assert.deepEqual(validateMemberDuePayload({ action: "pay", dueId: ENTRY_ID, note: "  Phí tháng 10  ", expectedUpdatedAt: UPDATED_AT }), {
    ok: true, value: { action: "pay", dueId: ENTRY_ID, note: "Phí tháng 10", expectedUpdatedAt: UPDATED_AT },
  });
  assert.deepEqual(validateMemberDuePayload({ action: "voidPayment", dueId: ENTRY_ID, reason: "  Chuyển khoản nhầm  ", expectedUpdatedAt: UPDATED_AT }), {
    ok: true, value: { action: "voidPayment", dueId: ENTRY_ID, reason: "Chuyển khoản nhầm", expectedUpdatedAt: UPDATED_AT },
  });
  assert.deepEqual(validateMemberDuePayload({ action: "waive", dueId: ENTRY_ID, expectedUpdatedAt: UPDATED_AT }), {
    ok: true, value: { action: "waive", dueId: ENTRY_ID, expectedUpdatedAt: UPDATED_AT },
  });
  assert.deepEqual(validateMemberDuePayload({ action: "waive", dueId: ENTRY_ID, expectedUpdatedAt: UPDATED_AT, note: "injected" }), { ok: false, kind: "malformed" });
});
