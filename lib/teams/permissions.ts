export const PERMISSION_CODES = [
  "team.read",
  "team.update",
  "team.delete",
  "members.read",
  "members.invite",
  "members.manage",
  "roles.read",
  "roles.manage",
  "settings.read",
  "settings.update",
  "players.read",
  "players.manage",
  "matches.read",
  "matches.manage",
  "matches.respond",
  "tactics.read",
  "tactics.manage",
  "news.read",
  "news.manage",
  "finance.read",
  "finance.manage",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSION_CODES as readonly string[]).includes(value);
}

export function hasPermission(
  context: { permissions: readonly PermissionCode[] },
  code: PermissionCode,
): boolean {
  return context.permissions.includes(code);
}
