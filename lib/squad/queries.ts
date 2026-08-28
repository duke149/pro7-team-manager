import type { SupabaseClient } from "@supabase/supabase-js";

import { AVATAR_BUCKET, isCanonicalOwnAvatarPath } from "../account/avatar";
import type { Database } from "../supabase/database.types";
import type { SquadFilters } from "./filters";
import type {
  MembershipStatus,
  PlayerPosition,
  PlayerStatus,
  SquadAssignableRole,
  SquadAssignableRolesResult,
  SquadDetailResult,
  SquadListResult,
  SquadPlayerDetail,
  SquadPlayerSummary,
} from "./model";
import { isUuid } from "./model";
import "./server-only";

const PAGE_SIZE = 48;
const MEMBERSHIP_SELECT =
  "user_id,role_id,status,role:roles!memberships_role_team_fkey(id,name,slug,is_system),player:team_player_profiles!team_player_profiles_membership_fkey!inner(shirt_number,official_position,player_status,join_date)";
const PROFILE_SUMMARY_SELECT = "id,display_name,avatar_path,avatar_url";
const PROFILE_DETAIL_SELECT =
  "id,display_name,avatar_path,avatar_url,phone,date_of_birth,height_cm,weight_kg,preferred_positions";

type QueryDependencies = {
  supabase?: SupabaseClient<Database>;
  signAvatarPaths?: (
    paths: readonly string[],
  ) => Promise<Readonly<Record<string, string | null>> | null>;
};

type MembershipRow = {
  user_id: string;
  role_id: string;
  status: MembershipStatus;
  role: { id: string; name: string; slug: string; is_system: boolean } | null;
  player: {
    shirt_number: number | null;
    official_position: PlayerPosition | null;
    player_status: PlayerStatus;
    join_date: string;
  };
};

type SummaryProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  avatar_url: string | null;
};

type DetailProfileRow = SummaryProfileRow & {
  phone: string | null;
  date_of_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  preferred_positions: PlayerPosition[];
};

type RoleRow = {
  id: string;
  name: string;
  slug: string;
  is_system: boolean;
};

type RolePermissionRow = {
  role_id: string;
  permission_code: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isPosition(value: unknown): value is PlayerPosition {
  return value === "GK" || value === "DEF" || value === "MID" || value === "ATT";
}

function isPlayerStatus(value: unknown): value is PlayerStatus {
  return value === "available" || value === "injured" || value === "unavailable";
}

function isMembershipStatus(value: unknown): value is MembershipStatus {
  return value === "active" || value === "inactive";
}

function isMembershipRow(value: unknown): value is MembershipRow {
  if (!isRecord(value) || !isRecord(value.player)) return false;
  const validRole = value.role === null || (
    isRecord(value.role) &&
    typeof value.role.id === "string" &&
    typeof value.role.name === "string" &&
    typeof value.role.slug === "string" &&
    typeof value.role.is_system === "boolean"
  );
  return (
    typeof value.user_id === "string" &&
    typeof value.role_id === "string" &&
    isMembershipStatus(value.status) &&
    validRole &&
    isNullableNumber(value.player.shirt_number) &&
    (value.player.official_position === null || isPosition(value.player.official_position)) &&
    isPlayerStatus(value.player.player_status) &&
    typeof value.player.join_date === "string"
  );
}

function isSummaryProfileRow(value: unknown): value is SummaryProfileRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isNullableString(value.display_name) &&
    isNullableString(value.avatar_path) &&
    isNullableString(value.avatar_url)
  );
}

function isDetailProfileRow(value: unknown): value is DetailProfileRow {
  if (!isSummaryProfileRow(value)) return false;
  const detail = value as SummaryProfileRow & Record<string, unknown>;
  return (
    isNullableString(detail.phone) &&
    isNullableString(detail.date_of_birth) &&
    isNullableNumber(detail.height_cm) &&
    isNullableNumber(detail.weight_kg) &&
    Array.isArray(detail.preferred_positions) &&
    detail.preferred_positions.every(isPosition)
  );
}

function isRoleRow(value: unknown): value is RoleRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.slug === "string" &&
    typeof value.is_system === "boolean"
  );
}

function isRolePermissionRow(value: unknown): value is RolePermissionRow {
  return (
    isRecord(value) &&
    typeof value.role_id === "string" &&
    typeof value.permission_code === "string"
  );
}

function compareText(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

function compareNumber(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function effectiveStatus(player: SquadPlayerSummary): string {
  return player.membershipStatus === "inactive" ? "inactive" : player.playerStatus;
}

function sortPlayers(
  players: SquadPlayerSummary[],
  filters: SquadFilters,
): SquadPlayerSummary[] {
  const multiplier = filters.direction === "asc" ? 1 : -1;
  return players.sort((left, right) => {
    let primary = 0;
    switch (filters.sort) {
      case "shirt_number":
        primary = compareNumber(left.shirtNumber, right.shirtNumber);
        break;
      case "position":
        primary = compareText(left.officialPosition, right.officialPosition);
        break;
      case "join_date":
        primary = compareText(left.joinDate, right.joinDate);
        break;
      case "status":
        primary = compareText(effectiveStatus(left), effectiveStatus(right));
        break;
      case "name":
        primary = compareText(left.displayName, right.displayName);
        break;
    }
    return (
      primary * multiplier ||
      compareText(left.displayName, right.displayName) ||
      compareText(left.userId, right.userId)
    );
  });
}

function mapSummary(
  membership: MembershipRow,
  profile: SummaryProfileRow,
  signedAvatarUrl: string | null = null,
): SquadPlayerSummary {
  return Object.freeze({
    userId: membership.user_id,
    displayName: profile.display_name,
    avatarPath: profile.avatar_path,
    avatarUrl: signedAvatarUrl ?? profile.avatar_url,
    membershipStatus: membership.status,
    role: membership.role
      ? Object.freeze({
        id: membership.role.id,
        name: membership.role.name,
        slug: membership.role.slug,
        isSystem: membership.role.is_system,
      })
      : Object.freeze({
        id: membership.role_id,
        name: "Không có quyền xem vai trò",
        slug: "",
        isSystem: false,
        isVisible: false,
      }),
    shirtNumber: membership.player.shirt_number,
    officialPosition: membership.player.official_position,
    playerStatus: membership.player.player_status,
    joinDate: membership.player.join_date,
  });
}

async function signedAvatarUrls(
  client: SupabaseClient<Database>,
  profiles: readonly SummaryProfileRow[],
  dependencies: QueryDependencies,
): Promise<Readonly<Record<string, string | null>>> {
  const paths = [...new Set(profiles.flatMap((profile) => (
    profile.avatar_path && isCanonicalOwnAvatarPath(profile.avatar_path, profile.id)
      ? [profile.avatar_path]
      : []
  )))];
  if (paths.length === 0) return Object.freeze({});

  try {
    if (dependencies.signAvatarPaths) {
      return Object.freeze(await dependencies.signAvatarPaths(paths) ?? {});
    }
    const result = await client.storage.from(AVATAR_BUCKET).createSignedUrls(paths, 300);
    if (result.error || !Array.isArray(result.data)) return Object.freeze({});
    const urls: Record<string, string | null> = {};
    for (const entry of result.data) {
      if (
        typeof entry.path === "string" &&
        paths.includes(entry.path) &&
        (entry.signedUrl === null || typeof entry.signedUrl === "string")
      ) {
        urls[entry.path] = entry.signedUrl;
      }
    }
    return Object.freeze(urls);
  } catch {
    return Object.freeze({});
  }
}

async function resolveClient(
  supplied?: SupabaseClient<Database>,
): Promise<SupabaseClient<Database>> {
  if (supplied) return supplied;
  const { createServerSupabaseClient } = await import("../supabase/server");
  return createServerSupabaseClient();
}

export async function listAssignableSquadRoles(
  teamId: string,
  canReadRoles: boolean,
  dependencies: QueryDependencies = {},
): Promise<SquadAssignableRolesResult> {
  if (!canReadRoles) return { ok: false, error: "server" };
  try {
    const client = await resolveClient(dependencies.supabase);
    const assignableRows: RoleRow[] = [];
    let cursor: string | null = null;
    while (true) {
      let query = client
        .from("roles")
        .select("id,name,slug,is_system")
        .eq("team_id", teamId);
      if (cursor) query = query.gt("id", cursor);
      const rolesResult = await query
        .order("id", { ascending: true })
        .limit(64);
      if (
        rolesResult.error ||
        !Array.isArray(rolesResult.data) ||
        !rolesResult.data.every(isRoleRow)
      ) {
        return { ok: false, error: "server" };
      }
      if (rolesResult.data.length === 0) break;
      if (rolesResult.data.some((role, index) => (
        (cursor !== null && role.id <= cursor) ||
        (index > 0 && role.id <= rolesResult.data[index - 1].id)
      ))) {
        return { ok: false, error: "server" };
      }

      const nonOwnerRoles = rolesResult.data.filter(
        (role) => !(role.is_system && role.slug === "owner"),
      );
      if (nonOwnerRoles.length > 0) {
        const permissionsResult = await client
          .from("role_permissions")
          .select("role_id,permission_code")
          .in("role_id", nonOwnerRoles.map((role) => role.id))
          .eq("permission_code", "team.delete")
          .order("role_id", { ascending: true })
          .limit(nonOwnerRoles.length + 1);
        if (
          permissionsResult.error ||
          !Array.isArray(permissionsResult.data) ||
          permissionsResult.data.length > nonOwnerRoles.length ||
          !permissionsResult.data.every(isRolePermissionRow)
        ) {
          return { ok: false, error: "server" };
        }
        const rolesWithTeamDelete = new Set(
          permissionsResult.data.map((permission) => permission.role_id),
        );
        assignableRows.push(...nonOwnerRoles.filter(
          (role) => !rolesWithTeamDelete.has(role.id),
        ));
      }

      cursor = rolesResult.data.at(-1)?.id ?? null;
      if (rolesResult.data.length < 64) break;
    }

    const roles: SquadAssignableRole[] = assignableRows
      .map((role) => Object.freeze({
        id: role.id,
        name: role.name,
        slug: role.slug,
        isSystem: role.is_system,
      }))
      .sort((left, right) => compareText(left.name, right.name) || compareText(left.id, right.id));
    return { ok: true, roles: Object.freeze(roles) };
  } catch {
    return { ok: false, error: "server" };
  }
}

function buildMembershipQuery(
  client: SupabaseClient<Database>,
  teamId: string,
  filters?: SquadFilters,
) {
  let query = client
    .from("memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("team_id", teamId);

  if (filters) {
    if (filters.status === "inactive") {
      query = query.eq("status", "inactive");
    } else {
      query = query
        .eq("status", "active")
        .eq("player.player_status", filters.status === "active" ? "available" : filters.status);
    }
    if (filters.position !== "all") {
      query = query.eq("player.official_position", filters.position);
    }
  }

  return query;
}

async function loadMembershipRows(
  client: SupabaseClient<Database>,
  teamId: string,
  filters: SquadFilters,
): Promise<MembershipRow[] | null> {
  const rows: MembershipRow[] = [];
  let cursor: string | null = null;

  while (true) {
    let query = buildMembershipQuery(client, teamId, filters);
    if (cursor) query = query.gt("user_id", cursor);
    const result = await query
      .order("user_id", { ascending: true })
      .limit(PAGE_SIZE);

    if (
      result.error ||
      !Array.isArray(result.data) ||
      !result.data.every(isMembershipRow)
    ) {
      return null;
    }
    if (result.data.length === 0) return rows;

    for (const row of result.data as unknown as MembershipRow[]) {
      if (cursor !== null && row.user_id <= cursor) return null;
      rows.push(row);
      cursor = row.user_id;
    }
    if (result.data.length < PAGE_SIZE) return rows;
  }
}

async function loadSummaryProfiles(
  client: SupabaseClient<Database>,
  userIds: string[],
  filters: SquadFilters,
): Promise<SummaryProfileRow[] | null> {
  const profiles: SummaryProfileRow[] = [];
  for (let start = 0; start < userIds.length; start += PAGE_SIZE) {
    const chunk = userIds.slice(start, start + PAGE_SIZE);
    if (filters.searchPattern) {
      const visibilityResult = await client
        .from("profiles")
        .select("id")
        .in("id", chunk)
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);
      if (
        visibilityResult.error ||
        !Array.isArray(visibilityResult.data) ||
        !visibilityResult.data.every(
          (profile) => isRecord(profile) && typeof profile.id === "string",
        )
      ) {
        return null;
      }
      const visibleIds = new Set(visibilityResult.data.map((profile) => profile.id));
      if (
        visibleIds.size !== chunk.length ||
        chunk.some((userId) => !visibleIds.has(userId))
      ) {
        return null;
      }
    }
    let query = client
      .from("profiles")
      .select(PROFILE_SUMMARY_SELECT)
      .in("id", chunk);
    if (filters.searchPattern) {
      query = query.ilike("display_name", filters.searchPattern);
    }
    const result = await query
      .order("display_name", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (
      result.error ||
      !Array.isArray(result.data) ||
      !result.data.every(isSummaryProfileRow)
    ) {
      return null;
    }
    if (!filters.searchPattern) {
      const returnedIds = new Set(result.data.map((profile) => profile.id));
      if (
        returnedIds.size !== chunk.length ||
        chunk.some((userId) => !returnedIds.has(userId))
      ) {
        return null;
      }
    }
    profiles.push(...result.data);
  }
  return profiles;
}

export async function listSquadPlayers(
  teamId: string,
  filters: SquadFilters,
  dependencies: QueryDependencies = {},
): Promise<SquadListResult> {
  try {
    const client = await resolveClient(dependencies.supabase);
    const memberships = await loadMembershipRows(client, teamId, filters);
    if (!memberships) return { ok: false, error: "server" };
    if (memberships.length === 0) return { ok: true, players: [] };

    const profiles = await loadSummaryProfiles(
      client,
      memberships.map((row) => row.user_id),
      filters,
    );
    if (!profiles) return { ok: false, error: "server" };

    const avatarUrls = await signedAvatarUrls(client, profiles, dependencies);
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const players = memberships.flatMap((membership) => {
      const profile = profileById.get(membership.user_id);
      return profile ? [mapSummary(
        membership,
        profile,
        profile.avatar_path ? avatarUrls[profile.avatar_path] ?? null : null,
      )] : [];
    });
    return { ok: true, players: sortPlayers(players, filters).slice(0, PAGE_SIZE) };
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function getSquadPlayer(
  teamId: string,
  userId: string,
  includeAdminNotes: boolean,
  dependencies: QueryDependencies = {},
): Promise<SquadDetailResult> {
  if (!isUuid(userId)) return { ok: false, error: "not_found" };
  try {
    const client = await resolveClient(dependencies.supabase);
    const membershipResult = await buildMembershipQuery(client, teamId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (membershipResult.error) return { ok: false, error: "server" };
    if (membershipResult.data === null) return { ok: false, error: "not_found" };
    if (!isMembershipRow(membershipResult.data)) return { ok: false, error: "server" };

    const profileResult = await client
      .from("profiles")
      .select(PROFILE_DETAIL_SELECT)
      .eq("id", userId)
      .limit(1)
      .maybeSingle();
    if (profileResult.error) return { ok: false, error: "server" };
    if (profileResult.data === null) return { ok: false, error: "not_found" };
    if (!isDetailProfileRow(profileResult.data)) return { ok: false, error: "server" };

    let adminNotes: string | null | undefined;
    if (includeAdminNotes) {
      const notesResult = await client.rpc("get_team_player_admin_detail", {
        p_team_id: teamId,
        p_user_id: userId,
      });
      const notes = notesResult.data;
      if (
        notesResult.error ||
        !Array.isArray(notes) ||
        notes.length !== 1 ||
        !isRecord(notes[0]) ||
        !isNullableString(notes[0].admin_notes)
      ) {
        return { ok: false, error: "server" };
      }
      adminNotes = notes[0].admin_notes;
    }

    const avatarUrls = await signedAvatarUrls(client, [profileResult.data], dependencies);
    const summary = mapSummary(
      membershipResult.data,
      profileResult.data,
      profileResult.data.avatar_path
        ? avatarUrls[profileResult.data.avatar_path] ?? null
        : null,
    );
    const player: SquadPlayerDetail = Object.freeze({
      ...summary,
      phone: profileResult.data.phone,
      dateOfBirth: profileResult.data.date_of_birth,
      heightCm: profileResult.data.height_cm,
      weightKg: profileResult.data.weight_kg,
      preferredPositions: Object.freeze([...profileResult.data.preferred_positions]),
      ...(includeAdminNotes ? { adminNotes } : {}),
    });
    return { ok: true, player };
  } catch {
    return { ok: false, error: "server" };
  }
}
