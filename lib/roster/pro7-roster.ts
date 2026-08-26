import { PRO7_LOGIN_EMAIL_DOMAIN } from "../account/login-identifier";

export type Pro7RosterRole = "admin" | "member";
export type Pro7RosterEntry = Readonly<{
  displayName: string;
  username: string;
  role: Pro7RosterRole;
}>;

const entries: Pro7RosterEntry[] = [
  { displayName: "Lê Thành Hưng", username: "hunglt", role: "admin" },
  { displayName: "Bùi Hữu Quyền", username: "quyenbh", role: "member" },
  { displayName: "Bùi Kiên", username: "buikien", role: "member" },
  { displayName: "Danh Tuấn", username: "danhtuan", role: "member" },
  { displayName: "Lê Tuấn Đạt", username: "datlt", role: "admin" },
  { displayName: "Lê Anh Đức", username: "duclee", role: "admin" },
  { displayName: "Đức Mạnh", username: "ducmanh", role: "member" },
  { displayName: "Gia Khải", username: "giakhai", role: "member" },
  { displayName: "Nguyễn Hùng", username: "nguyenhung", role: "member" },
  { displayName: "Huy Lê", username: "lehuy", role: "member" },
  { displayName: "Tùng Lê", username: "tunglk", role: "member" },
  { displayName: "Kim Sơn", username: "kimson", role: "member" },
  { displayName: "Lê Trung Hiếu", username: "hieult", role: "member" },
  { displayName: "Lương Đức Việt", username: "vietld", role: "member" },
  { displayName: "Minh Lưu", username: "luuminh", role: "member" },
  { displayName: "Minh Phong", username: "minhphong", role: "member" },
  { displayName: "Nguyễn Công Hiếu", username: "hieunc", role: "member" },
  { displayName: "Nguyễn Hữu Toàn", username: "toannh", role: "member" },
  { displayName: "Nguyễn Minh Quân", username: "quannm", role: "member" },
  { displayName: "Nguyễn Phú Thành", username: "thanhnp", role: "member" },
  { displayName: "Nguyễn Quang Minh", username: "minhnq", role: "member" },
  { displayName: "Trần Lê Anh", username: "anhlt", role: "member" },
  { displayName: "Long Vũ", username: "vulong", role: "member" },
];

export const PRO7_ROSTER: readonly Pro7RosterEntry[] = Object.freeze(
  entries.map((entry) => Object.freeze(entry)),
);

export const PRO7_LEGACY_RECONCILIATION = Object.freeze([
  Object.freeze({ legacyEmail: "duc.lee.pro7@example.com", username: "duclee" }),
  Object.freeze({ legacyEmail: "tuan.dat.pro7@example.com", username: "datlt" }),
  Object.freeze({ legacyEmail: "trung.hieu.pro7@example.com", username: "hieult" }),
] as const);

export const PRO7_INACTIVE_LEGACY_EMAIL = "phi.hung.pro7@example.com";

export function internalEmailForUsername(username: string): string {
  if (!/^[a-z0-9]{3,32}$/u.test(username)) throw new Error("Invalid PRO7 username");
  return `${username}@${PRO7_LOGIN_EMAIL_DOMAIN}`;
}
