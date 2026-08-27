import { isUuid } from "../matches/model";
import { isIsoTimestamp } from "../matches/validation";
import {
  TACTIC_FORMATIONS,
  TACTIC_LEVELS,
  TACTIC_MODES,
  TACTIC_ROLES,
  type TacticFormation,
  type TacticLevel,
  type TacticMode,
  type TacticRole,
  type TacticSlot,
} from "./model";

type FieldErrors = Readonly<Record<string, string>>;
type Failure = Readonly<{ ok: false; kind: "malformed" }> | Readonly<{ ok: false; kind: "validation"; fieldErrors: FieldErrors }>;

export type SaveTacticPayload = Readonly<{
  action: "save";
  tacticId: string | null;
  mode: TacticMode;
  formation: TacticFormation;
  instructions: string | null;
  version: number;
  pressing: TacticLevel;
  defensiveLine: TacticLevel;
  slots: readonly TacticSlot[];
  expectedUpdatedAt: string | null;
}>;

export type ApplyTacticPayload = Readonly<{ action: "apply"; tacticId: string; expectedUpdatedAt: string }>;
export type TacticsPayload = SaveTacticPayload | ApplyTacticPayload;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function oneOf<const Values extends readonly string[]>(value: unknown, values: Values): value is Values[number] {
  return typeof value === "string" && values.includes(value);
}

function parseSlot(value: unknown): TacticSlot | null {
  if (!record(value) || !exactKeys(value, ["userId", "slotKind", "slotKey", "roleLabel", "shirtNumber", "x", "y"])) return null;
  if (!isUuid(value.userId) || (value.slotKind !== "starter" && value.slotKind !== "bench")
    || typeof value.slotKey !== "string" || value.slotKey !== value.slotKey.trim() || value.slotKey.length < 1 || value.slotKey.length > 40
    || !oneOf(value.roleLabel, TACTIC_ROLES)
    || !(value.shirtNumber === null || (Number.isInteger(value.shirtNumber) && (value.shirtNumber as number) >= 1 && (value.shirtNumber as number) <= 99))
    || typeof value.x !== "number" || !Number.isFinite(value.x) || value.x < 0 || value.x > 100
    || typeof value.y !== "number" || !Number.isFinite(value.y) || value.y < 0 || value.y > 100) return null;
  return Object.freeze({
    userId: value.userId,
    slotKind: value.slotKind,
    slotKey: value.slotKey,
    roleLabel: value.roleLabel as TacticRole,
    shirtNumber: value.shirtNumber as number | null,
    x: value.x,
    y: value.y,
  });
}

function validateSave(value: Record<string, unknown>): { ok: true; value: SaveTacticPayload } | Failure {
  const keys = ["action", "tacticId", "mode", "formation", "instructions", "version", "pressing", "defensiveLine", "slots", "expectedUpdatedAt"];
  if (!exactKeys(value, keys)) return { ok: false, kind: "malformed" };
  const errors: Record<string, string> = {};
  if (!oneOf(value.mode, TACTIC_MODES)) errors.mode = "Chế độ chiến thuật không hợp lệ.";
  if (!oneOf(value.formation, TACTIC_FORMATIONS)) errors.formation = "Sơ đồ không hợp lệ.";
  if (!oneOf(value.pressing, TACTIC_LEVELS)) errors.pressing = "Cường độ pressing không hợp lệ.";
  if (!oneOf(value.defensiveLine, TACTIC_LEVELS)) errors.defensiveLine = "Hàng phòng ngự không hợp lệ.";
  if (!(value.instructions === null || (typeof value.instructions === "string" && value.instructions === value.instructions.trim() && Array.from(value.instructions).length >= 1 && Array.from(value.instructions).length <= 2000))) errors.instructions = "Chỉ đạo phải từ 1 đến 2.000 ký tự và không có khoảng trắng thừa.";
  if (!Number.isInteger(value.version) || (value.version as number) < 1 || (value.version as number) > 32767) errors.version = "Phiên bản chiến thuật không hợp lệ.";
  const existing = isUuid(value.tacticId);
  const creating = value.tacticId === null;
  if (!existing && !creating) errors.tacticId = "Mã chiến thuật không hợp lệ.";
  if (creating && value.expectedUpdatedAt !== null) errors.expectedUpdatedAt = "Bản nháp mới không được có phiên bản dữ liệu đã lưu.";
  if (existing && !isIsoTimestamp(value.expectedUpdatedAt)) errors.expectedUpdatedAt = "Phiên bản dữ liệu không hợp lệ.";

  const slots = Array.isArray(value.slots) ? value.slots.map(parseSlot) : [];
  if (!Array.isArray(value.slots) || value.slots.length < 7 || value.slots.length > 30 || slots.some((slot) => slot === null)) {
    errors.slots = "Đội hình phải có từ 7 đến 30 vị trí hợp lệ.";
  } else {
    const parsed = slots as TacticSlot[];
    const starters = parsed.filter((slot) => slot.slotKind === "starter");
    if (starters.length !== 7) errors.slots = "Đội hình chính phải có đúng 7 cầu thủ.";
    if (starters.filter((slot) => slot.roleLabel === "GK").length !== 1) errors.slots = "Đội hình chính phải có đúng một thủ môn.";
    if (new Set(parsed.map((slot) => slot.userId)).size !== parsed.length) errors.slots = "Mỗi cầu thủ chỉ được xếp một vị trí.";
    if (new Set(parsed.map((slot) => slot.slotKey)).size !== parsed.length) errors.slots = "Mỗi vị trí phải là duy nhất.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, kind: "validation", fieldErrors: errors };
  return {
    ok: true,
    value: Object.freeze({
      action: "save", tacticId: value.tacticId as string | null, mode: value.mode as TacticMode,
      formation: value.formation as TacticFormation, instructions: value.instructions as string | null,
      version: value.version as number, pressing: value.pressing as TacticLevel,
      defensiveLine: value.defensiveLine as TacticLevel, slots: Object.freeze(slots as TacticSlot[]),
      expectedUpdatedAt: value.expectedUpdatedAt as string | null,
    }),
  };
}

export function validateTacticsPayload(value: unknown): { ok: true; value: TacticsPayload } | Failure {
  if (!record(value) || typeof value.action !== "string") return { ok: false, kind: "malformed" };
  if (value.action === "save") return validateSave(value);
  if (value.action === "apply") {
    if (!exactKeys(value, ["action", "tacticId", "expectedUpdatedAt"])) return { ok: false, kind: "malformed" };
    if (!isUuid(value.tacticId) || !isIsoTimestamp(value.expectedUpdatedAt)) return { ok: false, kind: "validation", fieldErrors: { tacticId: "Bản nháp hoặc phiên bản không hợp lệ." } };
    return { ok: true, value: Object.freeze({ action: "apply", tacticId: value.tacticId, expectedUpdatedAt: value.expectedUpdatedAt }) };
  }
  return { ok: false, kind: "malformed" };
}
