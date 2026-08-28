import assert from "node:assert/strict";
import test from "node:test";

import { validateSettingsMutation } from "../lib/settings/validation";

const UPDATED_AT = "2026-10-01T08:00:00.000Z";

test("settings mutations accept only exact bounded team, notification, and payment payloads", () => {
  assert.deepEqual(validateSettingsMutation({ action: "team", name: " PRO7 FC ", slug: "pro7-fc" }), { ok: true, value: { action: "team", name: "PRO7 FC", slug: "pro7-fc" } });
  assert.deepEqual(validateSettingsMutation({ action: "notifications", matchInvitations: true, matchReminders: false, reminderHoursBefore: 24, expectedUpdatedAt: UPDATED_AT }), { ok: true, value: { action: "notifications", matchInvitations: true, matchReminders: false, reminderHoursBefore: 24, expectedUpdatedAt: UPDATED_AT } });
  assert.deepEqual(validateSettingsMutation({ action: "payments", bankCode: " mb ", accountNumber: " 0901234567 ", accountHolder: " LE DUC ", transferPrefix: " PRO7 QUY ", expectedUpdatedAt: UPDATED_AT }), { ok: true, value: { action: "payments", bankCode: "MB", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: "PRO7 QUY", expectedUpdatedAt: UPDATED_AT } });
  assert.deepEqual(validateSettingsMutation({ action: "payments", bankCode: "970422", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: "  ", expectedUpdatedAt: UPDATED_AT }), { ok: true, value: { action: "payments", bankCode: "970422", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: null, expectedUpdatedAt: UPDATED_AT } });
  for (const value of [
    { action: "team", name: "", slug: "INVALID" },
    { action: "notifications", matchInvitations: true, matchReminders: true, reminderHoursBefore: 0, expectedUpdatedAt: UPDATED_AT },
    { action: "notifications", matchInvitations: true, matchReminders: true, reminderHoursBefore: 24, expectedUpdatedAt: UPDATED_AT, injected: true },
    { action: "payments", bankCode: "M B", accountNumber: "0901", accountHolder: "LE DUC", transferPrefix: null, expectedUpdatedAt: UPDATED_AT },
    { action: "payments", bankCode: "MB", accountNumber: "abc", accountHolder: "LE DUC", transferPrefix: null, expectedUpdatedAt: UPDATED_AT },
    { action: "payments", bankCode: "MB", accountNumber: "0901234567", accountHolder: "", transferPrefix: null, expectedUpdatedAt: UPDATED_AT },
    { action: "payments", bankCode: "MB", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: "x".repeat(41), expectedUpdatedAt: UPDATED_AT },
    { action: "payments", bankCode: "MB", accountNumber: "0901234567", accountHolder: "LE DUC", transferPrefix: null, expectedUpdatedAt: "bad" },
  ]) assert.equal(validateSettingsMutation(value).ok, false);
});

test("danger-zone delete requires exact team name and slug confirmation", () => {
  assert.deepEqual(validateSettingsMutation({ action: "delete", confirmation: "PRO7 FC", slugConfirmation: "pro7-fc" }), { ok: true, value: { action: "delete", confirmation: "PRO7 FC", slugConfirmation: "pro7-fc" } });
  assert.equal(validateSettingsMutation({ action: "delete", confirmation: "pro7 fc", slugConfirmation: "pro7-fc" }).ok, true, "target identity is checked against canonical context in the action");
  assert.equal(validateSettingsMutation({ action: "delete", confirmation: "PRO7 FC" }).ok, false);
});
