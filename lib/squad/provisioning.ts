import { isUuid, type PlayerPosition } from "./model.ts";

export const MAX_PROVISION_MEMBER_BODY_BYTES = 16 * 1024;

const PROVISION_MEMBER_KEYS = [
  "teamId",
  "email",
  "displayName",
  "roleId",
  "shirtNumber",
  "officialPosition",
  "joinDate",
] as const;

export type ProvisionMemberRequest = Readonly<{
  teamId: string;
  email: string;
  displayName: string;
  roleId: string;
  shirtNumber: number | null;
  officialPosition: PlayerPosition | null;
  joinDate: string;
}>;

export type ProvisionMemberSuccess =
  | Readonly<{
      ok: true;
      account: "created";
      userId: string;
      temporaryPassword: string;
    }>
  | Readonly<{ ok: true; account: "attached"; userId: string }>;

export type ProvisionMemberValidationResult =
  | Readonly<{ ok: true; value: ProvisionMemberRequest }>
  | Readonly<{
      ok: false;
      code: "invalid_payload";
      message: "Dữ liệu tạo cầu thủ không hợp lệ.";
    }>
  | Readonly<{
      ok: false;
      code: "validation";
      message: "Vui lòng kiểm tra lại thông tin cầu thủ.";
      fieldErrors: Readonly<Record<string, string>>;
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlayerPosition(value: unknown): value is PlayerPosition {
  return value === "GK" || value === "DEF" || value === "MID" || value === "ATT";
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isEmail(value: string): boolean {
  if (value.length > 254) return false;
  const [local, domain, ...extra] = value.split("@");
  return (
    extra.length === 0 &&
    typeof local === "string" &&
    local.length >= 1 &&
    local.length <= 64 &&
    typeof domain === "string" &&
    domain.includes(".") &&
    !/^\.|\.$|\.\./u.test(domain) &&
    !/\s/u.test(value)
  );
}

export function validateProvisionMemberPayload(
  input: unknown,
  now: Date = new Date(),
): ProvisionMemberValidationResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      code: "invalid_payload",
      message: "Dữ liệu tạo cầu thủ không hợp lệ.",
    };
  }

  const keys = Object.keys(input);
  if (
    keys.length !== PROVISION_MEMBER_KEYS.length ||
    !keys.every((key) => (PROVISION_MEMBER_KEYS as readonly string[]).includes(key))
  ) {
    return {
      ok: false,
      code: "invalid_payload",
      message: "Dữ liệu tạo cầu thủ không hợp lệ.",
    };
  }

  const fieldErrors: Record<string, string> = {};
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const teamId = typeof input.teamId === "string" ? input.teamId.trim() : "";
  const roleId = typeof input.roleId === "string" ? input.roleId.trim() : "";

  if (!isUuid(teamId)) fieldErrors.teamId = "Đội bóng không hợp lệ.";
  if (!isEmail(email)) fieldErrors.email = "Email không hợp lệ.";
  if (displayName.length < 1 || displayName.length > 100) {
    fieldErrors.displayName = "Họ và tên phải từ 1 đến 100 ký tự.";
  }
  if (!isUuid(roleId)) fieldErrors.roleId = "Vai trò không hợp lệ.";
  if (
    input.shirtNumber !== null &&
    (!Number.isInteger(input.shirtNumber) ||
      (input.shirtNumber as number) < 1 ||
      (input.shirtNumber as number) > 99)
  ) {
    fieldErrors.shirtNumber = "Số áo phải từ 1 đến 99.";
  }
  if (
    input.officialPosition !== null &&
    !isPlayerPosition(input.officialPosition)
  ) {
    fieldErrors.officialPosition = "Vị trí thi đấu không hợp lệ.";
  }
  if (typeof input.joinDate !== "string" || !isIsoDate(input.joinDate)) {
    fieldErrors.joinDate = "Ngày gia nhập không hợp lệ.";
  } else if (input.joinDate > now.toISOString().slice(0, 10)) {
    fieldErrors.joinDate = "Ngày gia nhập không được ở tương lai.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "validation",
      message: "Vui lòng kiểm tra lại thông tin cầu thủ.",
      fieldErrors: Object.freeze(fieldErrors),
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      teamId,
      email,
      displayName,
      roleId,
      shirtNumber: input.shirtNumber as number | null,
      officialPosition: input.officialPosition as PlayerPosition | null,
      joinDate: input.joinDate as string,
    }),
  };
}
