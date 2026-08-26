import assert from "node:assert/strict";
import test from "node:test";

import { validateTacticsPayload } from "../lib/tactics/validation";

const USER_IDS = Array.from(
  { length: 9 },
  (_, index) => `00000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
);
const UPDATED_AT = "2026-10-01T00:00:00.000Z";

function slot(index: number, overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_IDS[index],
    slotKind: index < 7 ? "starter" : "bench",
    slotKey: index < 7 ? `starter-${index + 1}` : `bench-${index - 6}`,
    roleLabel: index === 0 ? "GK" : index < 3 ? "DEF" : index < 6 ? "MID" : "ATT",
    shirtNumber: index + 1,
    x: index === 0 ? 50 : 15 + index * 10,
    y: index === 0 ? 90 : 75 - index * 8,
    ...overrides,
  };
}

function save(overrides: Record<string, unknown> = {}) {
  return {
    action: "save",
    tacticId: "00000000-0000-4000-8000-000000000099",
    mode: "balanced",
    formation: "2-3-1",
    instructions: "Giữ cự ly đội hình.",
    version: 2,
    pressing: "high",
    defensiveLine: "medium",
    slots: USER_IDS.map((_, index) => slot(index)),
    expectedUpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

test("save validation accepts only the database formation, mode, pressure, line, coordinate, and instruction bounds", () => {
  const valid = validateTacticsPayload(save());
  assert.equal(valid.ok, true);

  for (const payload of [
    save({ formation: "4-4-2" }),
    save({ mode: "with-ball" }),
    save({ pressing: "extreme" }),
    save({ defensiveLine: "deepest" }),
    save({ instructions: "x".repeat(2001) }),
    save({ instructions: " trailing " }),
    save({ slots: USER_IDS.map((_, index) => slot(index, index === 3 ? { x: 100.01 } : {})) }),
    save({ slots: USER_IDS.map((_, index) => slot(index, index === 3 ? { y: -0.01 } : {})) }),
  ]) {
    const result = validateTacticsPayload(payload);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, "validation");
  }
});

test("save validation requires seven unique starters, one goalkeeper, unique users, and unique slot keys", () => {
  const duplicateUser = USER_IDS.map((_, index) => slot(index));
  duplicateUser[8] = { ...duplicateUser[8], userId: USER_IDS[0] };
  const duplicateKey = USER_IDS.map((_, index) => slot(index));
  duplicateKey[8] = { ...duplicateKey[8], slotKey: duplicateKey[0].slotKey };
  const sixStarters = USER_IDS.map((_, index) => slot(index, index === 6 ? { slotKind: "bench" } : {}));
  const twoKeepers = USER_IDS.map((_, index) => slot(index, index === 1 ? { roleLabel: "GK" } : {}));

  for (const slots of [duplicateUser, duplicateKey, sixStarters, twoKeepers]) {
    const result = validateTacticsPayload(save({ slots }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, "validation");
  }
});

test("save validation preserves bounded proposed versions for new drafts and couples only their null token", () => {
  const newDraft = validateTacticsPayload(save({ tacticId: null, version: 1, expectedUpdatedAt: null }));
  assert.equal(newDraft.ok, true);
  const forkedDraft = validateTacticsPayload(save({ tacticId: null, version: 2, expectedUpdatedAt: null }));
  assert.equal(forkedDraft.ok, true);
  if (forkedDraft.ok && forkedDraft.value.action === "save") assert.equal(forkedDraft.value.version, 2);
  for (const payload of [
    save({ tacticId: null }),
    save({ tacticId: null, version: 1 }),
    save({ tacticId: null, version: 32768, expectedUpdatedAt: null }),
    save({ expectedUpdatedAt: null }),
    save({ version: 0 }),
    save({ expectedUpdatedAt: "2026-02-31T00:00:00Z" }),
  ]) {
    assert.equal(validateTacticsPayload(payload).ok, false);
  }
});

test("apply validation accepts only an exact draft identity and optimistic timestamp", () => {
  assert.deepEqual(validateTacticsPayload({ action: "apply", tacticId: "00000000-0000-4000-8000-000000000099", expectedUpdatedAt: UPDATED_AT }), {
    ok: true,
    value: { action: "apply", tacticId: "00000000-0000-4000-8000-000000000099", expectedUpdatedAt: UPDATED_AT },
  });
  for (const payload of [
    { action: "apply", tacticId: "not-a-uuid", expectedUpdatedAt: UPDATED_AT },
    { action: "apply", tacticId: "00000000-0000-4000-8000-000000000099", expectedUpdatedAt: null },
    { action: "apply", tacticId: "00000000-0000-4000-8000-000000000099", expectedUpdatedAt: UPDATED_AT, teamId: "injected" },
  ]) assert.equal(validateTacticsPayload(payload).ok, false);
});
