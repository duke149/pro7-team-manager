import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import {
  hasPermission,
  isPermissionCode,
  type PermissionCode,
} from "./permissions";

type TeamSummary = {
  id: string;
  name: string;
  slug: string;
};

export type UserTeamSummary = TeamSummary & {
  permissions: readonly PermissionCode[];
};

export type TeamListLookup =
  | { ok: true; teams: UserTeamSummary[] }
  | { ok: false };

type AccessRpcRow = {
  team_id: string;
  team_name: string;
  team_slug: string;
  role_id: string;
  role_slug: string;
  role_name: string;
  permission_codes: readonly string[];
};

type ValidatedAccessRpcRow = Omit<AccessRpcRow, "permission_codes"> & {
  permission_codes: readonly PermissionCode[];
};

export type TeamAccessContext = {
  team: TeamSummary;
  userId: string;
  membership: { roleId: string; roleSlug: string; roleName: string };
  permissions: readonly PermissionCode[];
};

type TeamContextDependencies = {
  supabase?: SupabaseClient<Database>;
  getCurrentUser?: () => Promise<{ id: string } | null>;
};

const ACCESS_RPC_KEYS = [
  "team_id",
  "team_name",
  "team_slug",
  "role_id",
  "role_slug",
  "role_name",
  "permission_codes",
] as const;

function isAccessRpcRow(value: unknown): value is AccessRpcRow {
  if (typeof value !== "object" || value === null) return false;

  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  return (
    keys.length === ACCESS_RPC_KEYS.length &&
    ACCESS_RPC_KEYS.every((key) => keys.includes(key)) &&
    typeof row.team_id === "string" &&
    typeof row.team_name === "string" &&
    typeof row.team_slug === "string" &&
    typeof row.role_id === "string" &&
    typeof row.role_slug === "string" &&
    typeof row.role_name === "string" &&
    Array.isArray(row.permission_codes) &&
    row.permission_codes.every((permission) => typeof permission === "string")
  );
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

async function resolveSupabaseClient(
  supabase?: SupabaseClient<Database>,
): Promise<SupabaseClient<Database>> {
  if (supabase) return supabase;

  const { createServerSupabaseClient } = await import("../supabase/server");
  return createServerSupabaseClient();
}

async function resolveCurrentUser(
  getUser?: TeamContextDependencies["getCurrentUser"],
): Promise<{ id: string } | null> {
  if (getUser) return getUser();

  const { getCurrentUser } = await import("../supabase/auth");
  return getCurrentUser();
}

async function loadAccessRows(
  client: SupabaseClient<Database>,
): Promise<ValidatedAccessRpcRow[] | null> {
  const result = await client.rpc("get_current_team_access_contexts");
  if (result.error || !Array.isArray(result.data) || !result.data.every(isAccessRpcRow)) {
    return null;
  }

  const rows: ValidatedAccessRpcRow[] = [];
  for (const row of result.data) {
    const permissions: PermissionCode[] = [];
    for (const permission of row.permission_codes) {
      if (!isPermissionCode(permission)) return null;
      permissions.push(permission);
    }
    rows.push({ ...row, permission_codes: permissions });
  }

  return rows;
}

function toAccessContext(row: ValidatedAccessRpcRow, userId: string): TeamAccessContext {
  return {
    team: { id: row.team_id, name: row.team_name, slug: row.team_slug },
    userId,
    membership: {
      roleId: row.role_id,
      roleSlug: row.role_slug,
      roleName: row.role_name,
    },
    permissions: Object.freeze([...row.permission_codes]),
  };
}

export async function loadTeamAccessContext(
  slug: string,
  dependencies: TeamContextDependencies = {},
): Promise<TeamAccessContext | null> {
  try {
    const user = await resolveCurrentUser(dependencies.getCurrentUser);
    if (!user) return null;

    const rows = await loadAccessRows(
      await resolveSupabaseClient(dependencies.supabase),
    );
    if (!rows) return null;

    const matchingRows = rows.filter((row) => row.team_slug === slug);
    return matchingRows.length === 1 ? toAccessContext(matchingRows[0], user.id) : null;
  } catch {
    return null;
  }
}

export async function loadUserTeams(
  dependencies: TeamContextDependencies = {},
): Promise<TeamListLookup> {
  try {
    const user = await resolveCurrentUser(dependencies.getCurrentUser);
    if (!user) return { ok: false };

    const rows = await loadAccessRows(
      await resolveSupabaseClient(dependencies.supabase),
    );
    if (!rows) return { ok: false };

    return {
      ok: true,
      teams: rows
        .map((row) => ({
          id: row.team_id,
          name: row.team_name,
          slug: row.team_slug,
          permissions: Object.freeze([...row.permission_codes]),
        }))
        .sort(
          (left, right) =>
            compareText(left.name, right.name) ||
            compareText(left.slug, right.slug) ||
            compareText(left.id, right.id),
        ),
    };
  } catch {
    return { ok: false };
  }
}

export async function listUserTeams(
  dependencies: TeamContextDependencies = {},
): Promise<TeamSummary[]> {
  const result = await loadUserTeams(dependencies);
  return result.ok
    ? result.teams.map(({ id, name, slug }) => ({ id, name, slug }))
    : [];
}

export async function requireTeamPermission(
  slug: string,
  permission: PermissionCode,
  dependencies: TeamContextDependencies = {},
): Promise<TeamAccessContext | null> {
  const context = await loadTeamAccessContext(slug, dependencies);
  return context && hasPermission(context, permission) ? context : null;
}
