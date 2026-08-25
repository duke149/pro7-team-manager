import { hasPermission, type PermissionCode } from "./permissions";

const TEAM_LANDING_CANDIDATES = [
  { path: "overview", permission: "team.read" },
  { path: "squad", permission: "players.read" },
  { path: "matches", permission: "matches.read" },
  { path: "tactics", permission: "tactics.read" },
  { path: "funds", permission: "finance.read" },
  { path: "admin/settings", permission: "settings.read" },
] as const satisfies readonly {
  path: string;
  permission: PermissionCode;
}[];

export function resolveTeamLandingPath(
  slug: string,
  permissions: readonly PermissionCode[],
): string | null {
  const destination = TEAM_LANDING_CANDIDATES.find(({ permission }) =>
    hasPermission({ permissions }, permission),
  );
  return destination
    ? `/teams/${encodeURIComponent(slug)}/${destination.path}`
    : null;
}
