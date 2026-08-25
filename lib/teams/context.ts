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

function isTeamSummary(value: unknown): value is TeamSummary {
  if (typeof value !== "object" || value === null) return false;

  const team = value as Record<string, unknown>;
  return (
    typeof team.id === "string" &&
    typeof team.name === "string" &&
    typeof team.slug === "string"
  );
}

function isMembership(value: unknown): value is { role_id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).role_id === "string"
  );
}

function isRole(value: unknown): value is { id: string; slug: string; name: string } {
  if (typeof value !== "object" || value === null) return false;

  const role = value as Record<string, unknown>;
  return (
    typeof role.id === "string" &&
    typeof role.slug === "string" &&
    typeof role.name === "string"
  );
}

function isPermissionRow(value: unknown): value is { permission_code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).permission_code === "string"
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

export async function loadTeamAccessContext(
  slug: string,
  userId: string,
  supabase?: SupabaseClient<Database>,
): Promise<TeamAccessContext | null> {
  try {
    const client = await resolveSupabaseClient(supabase);
    const teamResult = await client
      .from("teams")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle();
    if (teamResult.error || !isTeamSummary(teamResult.data)) return null;

    const membershipResult = await client
      .from("memberships")
      .select("role_id")
      .eq("team_id", teamResult.data.id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (membershipResult.error || !isMembership(membershipResult.data)) return null;

    const roleResult = await client
      .from("roles")
      .select("id, slug, name")
      .eq("id", membershipResult.data.role_id)
      .eq("team_id", teamResult.data.id)
      .maybeSingle();
    if (roleResult.error || !isRole(roleResult.data)) return null;

    const permissionsResult = await client
      .from("role_permissions")
      .select("permission_code")
      .eq("role_id", roleResult.data.id);
    if (permissionsResult.error || !Array.isArray(permissionsResult.data)) return null;

    const permissions: PermissionCode[] = [];
    for (const permission of permissionsResult.data) {
      if (!isPermissionRow(permission) || !isPermissionCode(permission.permission_code)) {
        return null;
      }
      permissions.push(permission.permission_code);
    }

    return {
      team: teamResult.data,
      userId,
      membership: {
        roleId: roleResult.data.id,
        roleSlug: roleResult.data.slug,
        roleName: roleResult.data.name,
      },
      permissions: Object.freeze(permissions),
    };
  } catch {
    return null;
  }
}

export async function listUserTeams(
  userId: string,
  supabase?: SupabaseClient<Database>,
): Promise<TeamSummary[]> {
  try {
    const client = await resolveSupabaseClient(supabase);
    const membershipsResult = await client
      .from("memberships")
      .select("teams(id, name, slug)")
      .eq("user_id", userId)
      .eq("status", "active");
    if (membershipsResult.error || !Array.isArray(membershipsResult.data)) return [];

    return membershipsResult.data
      .map((membership) => {
        if (typeof membership !== "object" || membership === null) return null;
        return isTeamSummary((membership as { teams?: unknown }).teams)
          ? membership.teams
          : null;
      })
      .filter((team): team is TeamSummary => team !== null)
      .sort(
        (left, right) =>
          compareText(left.name, right.name) ||
          compareText(left.slug, right.slug) ||
          compareText(left.id, right.id),
      );
  } catch {
    return [];
  }
}

export async function requireTeamPermission(
  slug: string,
  permission: PermissionCode,
  dependencies: TeamContextDependencies = {},
): Promise<TeamAccessContext | null> {
  try {
    const user = await resolveCurrentUser(dependencies.getCurrentUser);
    if (!user) return null;

    const context = await loadTeamAccessContext(slug, user.id, dependencies.supabase);
    return context && hasPermission(context, permission) ? context : null;
  } catch {
    return null;
  }
}
