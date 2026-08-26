import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PROVISION_MEMBER_BODY_BYTES,
  validateProvisionMemberPayload,
} from "../lib/squad/provisioning";

const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const ROLE_ID = "00000000-0000-4000-8000-000000000002";
const TODAY = new Date("2026-08-26T12:00:00.000Z");

function validPayload() {
  return {
    teamId: TEAM_ID,
    email: "  PLAYER@Example.COM ",
    displayName: "  Nguyễn Minh Anh  ",
    roleId: ROLE_ID,
    shirtNumber: 17,
    officialPosition: "MID",
    joinDate: "2026-08-26",
  };
}

test("provisioning validator accepts only the seven documented keys and normalizes identity fields", () => {
  const valid = validateProvisionMemberPayload(validPayload(), TODAY);
  assert.deepEqual(valid, {
    ok: true,
    value: {
      teamId: TEAM_ID,
      email: "player@example.com",
      displayName: "Nguyễn Minh Anh",
      roleId: ROLE_ID,
      shirtNumber: 17,
      officialPosition: "MID",
      joinDate: "2026-08-26",
    },
  });

  const extra = validateProvisionMemberPayload({ ...validPayload(), actorId: TEAM_ID }, TODAY);
  assert.deepEqual(extra, {
    ok: false,
    code: "invalid_payload",
    message: "Dữ liệu tạo cầu thủ không hợp lệ.",
  });
  assert.deepEqual(validPayload(), {
    teamId: TEAM_ID,
    email: "  PLAYER@Example.COM ",
    displayName: "  Nguyễn Minh Anh  ",
    roleId: ROLE_ID,
    shirtNumber: 17,
    officialPosition: "MID",
    joinDate: "2026-08-26",
  });
});

test("provisioning validator rejects malformed email, names outside 1-100, and invalid UUIDs with stable fields", () => {
  const cases: Array<[string, unknown, Record<string, string>]> = [
    ["email", { ...validPayload(), email: "player example.com" }, { email: "Email không hợp lệ." }],
    ["displayName empty", { ...validPayload(), displayName: "   " }, { displayName: "Họ và tên phải từ 1 đến 100 ký tự." }],
    ["displayName long", { ...validPayload(), displayName: "A".repeat(101) }, { displayName: "Họ và tên phải từ 1 đến 100 ký tự." }],
    ["teamId", { ...validPayload(), teamId: "team-1" }, { teamId: "Đội bóng không hợp lệ." }],
    ["roleId", { ...validPayload(), roleId: "role-1" }, { roleId: "Vai trò không hợp lệ." }],
  ];

  for (const [label, payload, fieldErrors] of cases) {
    assert.deepEqual(
      validateProvisionMemberPayload(payload, TODAY),
      {
        ok: false,
        code: "validation",
        message: "Vui lòng kiểm tra lại thông tin cầu thủ.",
        fieldErrors,
      },
      label,
    );
  }
});

test("provisioning validator bounds optional official data and rejects future or impossible join dates", () => {
  const cases: Array<[string, unknown, Record<string, string>]> = [
    ["shirt low", { ...validPayload(), shirtNumber: 0 }, { shirtNumber: "Số áo phải từ 1 đến 99." }],
    ["shirt high", { ...validPayload(), shirtNumber: 100 }, { shirtNumber: "Số áo phải từ 1 đến 99." }],
    ["shirt decimal", { ...validPayload(), shirtNumber: 7.5 }, { shirtNumber: "Số áo phải từ 1 đến 99." }],
    ["position", { ...validPayload(), officialPosition: "CM" }, { officialPosition: "Vị trí thi đấu không hợp lệ." }],
    ["impossible date", { ...validPayload(), joinDate: "2026-02-30" }, { joinDate: "Ngày gia nhập không hợp lệ." }],
    ["future date", { ...validPayload(), joinDate: "2026-08-27" }, { joinDate: "Ngày gia nhập không được ở tương lai." }],
  ];

  for (const [label, payload, fieldErrors] of cases) {
    assert.deepEqual(
      validateProvisionMemberPayload(payload, TODAY),
      {
        ok: false,
        code: "validation",
        message: "Vui lòng kiểm tra lại thông tin cầu thủ.",
        fieldErrors,
      },
      label,
    );
  }

  for (const officialPosition of [null, "GK", "DEF", "MID", "ATT"] as const) {
    const result = validateProvisionMemberPayload(
      { ...validPayload(), shirtNumber: null, officialPosition },
      TODAY,
    );
    assert.equal(result.ok, true, String(officialPosition));
  }
});

test("provisioning request body limit remains a bounded 16 KiB contract", () => {
  assert.equal(MAX_PROVISION_MEMBER_BODY_BYTES, 16 * 1024);
});
