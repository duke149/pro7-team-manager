import assert from "node:assert/strict";
import test from "node:test";

import {
  PRO7_INACTIVE_LEGACY_EMAIL,
  PRO7_LEGACY_RECONCILIATION,
  PRO7_ROSTER,
  internalEmailForUsername,
} from "../lib/roster/pro7-roster";

const EXPECTED = [
  ["Lê Thành Hưng", "hunglt", "admin"],
  ["Bùi Hữu Quyền", "quyenbh", "member"],
  ["Bùi Kiên", "buikien", "member"],
  ["Danh Tuấn", "danhtuan", "member"],
  ["Lê Tuấn Đạt", "datlt", "admin"],
  ["Lê Anh Đức", "duclee", "admin"],
  ["Đức Mạnh", "ducmanh", "member"],
  ["Gia Khải", "giakhai", "member"],
  ["Nguyễn Hùng", "nguyenhung", "member"],
  ["Huy Lê", "lehuy", "member"],
  ["Tùng Lê", "tunglk", "member"],
  ["Kim Sơn", "kimson", "member"],
  ["Lê Trung Hiếu", "hieult", "member"],
  ["Lương Đức Việt", "vietld", "member"],
  ["Minh Lưu", "luuminh", "member"],
  ["Minh Phong", "minhphong", "member"],
  ["Nguyễn Công Hiếu", "hieunc", "member"],
  ["Nguyễn Hữu Toàn", "toannh", "member"],
  ["Nguyễn Minh Quân", "quannm", "member"],
  ["Nguyễn Phú Thành", "thanhnp", "member"],
  ["Nguyễn Quang Minh", "minhnq", "member"],
  ["Trần Lê Anh", "anhlt", "member"],
  ["Long Vũ", "vulong", "member"],
] as const;

test("the immutable PRO7 roster contains the exact approved 23 players and roles", () => {
  assert.deepEqual(
    PRO7_ROSTER.map(({ displayName, username, role }) => [displayName, username, role]),
    EXPECTED,
  );
  assert.equal(PRO7_ROSTER.filter((row) => row.role === "admin").length, 3);
  assert.equal(PRO7_ROSTER.filter((row) => row.role === "member").length, 20);
  assert.deepEqual(
    PRO7_ROSTER.filter((row) => row.role === "admin").map((row) => row.username).sort(),
    ["datlt", "duclee", "hunglt"],
  );
});

test("roster usernames and reserved Auth emails are unique and valid", () => {
  const usernames = PRO7_ROSTER.map((row) => row.username);
  const emails = usernames.map(internalEmailForUsername);
  assert.equal(new Set(usernames).size, 23);
  assert.equal(new Set(emails).size, 23);
  assert.equal(emails[0], "hunglt@pro7.test");
  assert.ok(usernames.every((username) => /^[a-z0-9]{3,32}$/u.test(username)));
});

test("legacy reconciliation preserves three identities and deactivates only Phi Hùng", () => {
  assert.deepEqual(PRO7_LEGACY_RECONCILIATION, [
    { legacyEmail: "duc.lee.pro7@example.com", username: "duclee" },
    { legacyEmail: "tuan.dat.pro7@example.com", username: "datlt" },
    { legacyEmail: "trung.hieu.pro7@example.com", username: "hieult" },
  ]);
  assert.equal(PRO7_INACTIVE_LEGACY_EMAIL, "phi.hung.pro7@example.com");
});

test("the product roster manifest stores no passwords or invented player profile fields", () => {
  const serialized = JSON.stringify(PRO7_ROSTER);
  assert.doesNotMatch(serialized, /password|@123|shirt|position|birthday|avatar/iu);
  assert.ok(PRO7_ROSTER.every((row) => Object.keys(row).sort().join(",") === "displayName,role,username"));
});
