import assert from "node:assert/strict";
import test from "node:test";

import { validateSettingsMutation } from "../lib/settings/validation";

test("settings mutations accept only exact bounded team and notification payloads", () => {
  assert.deepEqual(validateSettingsMutation({ action: "team", name: " PRO7 FC ", slug: "pro7-fc" }), { ok: true, value: { action: "team", name: "PRO7 FC", slug: "pro7-fc" } });
  assert.deepEqual(validateSettingsMutation({ action: "notifications", matchInvitations: true, matchReminders: false, reminderHoursBefore: 24 }), { ok: true, value: { action: "notifications", matchInvitations: true, matchReminders: false, reminderHoursBefore: 24 } });
  for (const value of [
    { action: "team", name: "", slug: "INVALID" },
    { action: "notifications", matchInvitations: true, matchReminders: true, reminderHoursBefore: 0 },
    { action: "notifications", matchInvitations: true, matchReminders: true, reminderHoursBefore: 24, injected: true },
  ]) assert.equal(validateSettingsMutation(value).ok, false);
});

test("danger-zone delete requires exact team name and slug confirmation", () => {
  assert.deepEqual(validateSettingsMutation({ action: "delete", confirmation: "PRO7 FC", slugConfirmation: "pro7-fc" }), { ok: true, value: { action: "delete", confirmation: "PRO7 FC", slugConfirmation: "pro7-fc" } });
  assert.equal(validateSettingsMutation({ action: "delete", confirmation: "pro7 fc", slugConfirmation: "pro7-fc" }).ok, true, "target identity is checked against canonical context in the action");
  assert.equal(validateSettingsMutation({ action: "delete", confirmation: "PRO7 FC" }).ok, false);
});
