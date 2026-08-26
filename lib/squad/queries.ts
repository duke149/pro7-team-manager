import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";
import type { SquadFilters } from "./filters";
import type {
  MembershipStatus,
  PlayerPosition,
  PlayerStatus,
  SquadDetailResult,
  SquadListResult,
  SquadPlayerDetail,
  SquadPlayerSummary,
} from "./model";

const PAGE_SIZE = 48;
const MEMBERSHIP_SELECT =
  "user_id,role_id,status,role:roles!memberships_role_team_fkey(id,name,slug,is_system),player:team_player_profiles!team_player_profiles_membership_fkey!inner(shirt_number,official_position,player_status,join_date)";
const PROFILE_SUMMARY_SELECT = "id,display_name,avatar_path,avatar_url";
const PROFILE_DETAIL_SELECT =
  "id,display_name,avatar_path,avatar_url,phone,date_of_birth,height_cm,weight_kg,preferred_positions";

type QueryDependencies = { supabase?: SupabaseClient<Database> };

type MembershipRow = {
  user_id: string;
  role_id: string;
  status: MembershipStatus;
  role: { id: string; name: string; slug: string; is_system: boolean };
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
  if (!isRecord(value) || !isRecord(value.role) || !isRecord(value.player)) return false;
  return (
    typeof value.user_id === "string" &&
    typeof value.role_id === "string" &&
    isMembershipStatus(value.status) &&
    typeof value.role.id === "string" &&
    typeof value.role.name === "string" &&
    typeof value.role.slug === "string" &&
    typeof value.role.is_system === "boolean" &&
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
): SquadPlayerSummary {
  return Object.freeze({
    userId: membership.user_id,
    displayName: profile.display_name,
    avatarPath: profile.avatar_path,
    avatarUrl: profile.avatar_url,
    membershipStatus: membership.status,
    role: Object.freeze({
      id: membership.role.id,
      name: membership.role.name,
      slug: membership.role.slug,
      isSystem: membership.role.is_system,
    }),
    shirtNumber: membership.player.shirt_number,
    officialPosition: membership.player.official_position,
    playerStatus: membership.player.player_status,
    joinDate: membership.player.join_date,
  });
}

async function resolveClient(
  supplied?: SupabaseClient<Database>,
): Promise<SupabaseClient<Database>> {
  if (supplied) return supplied;
  const { createServerSupabaseClient } = await import("../supabase/server");
  return createServerSupabaseClient();
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

export async function listSquadPlayers(
  teamId: string,
  filters: SquadFilters,
  dependencies: QueryDependencies = {},
): Promise<SquadListResult> {
  try {
    const client = await resolveClient(dependencies.supabase);
    const membershipResult = await buildMembershipQuery(client, teamId, filters)
      .order("user_id", { ascending: true })
      .limit(PAGE_SIZE);

    if (
      membershipResult.error ||
      !Array.isArray(membershipResult.data) ||
      !membershipResult.data.every(isMembershipRow)
    ) {
      return { ok: false, error: "server" };
    }
    if (membershipResult.data.length === 0) return { ok: true, players: [] };

    const userIds = membershipResult.data.map((row) => row.user_id);
    let profileQuery = client
      .from("profiles")
      .select(PROFILE_SUMMARY_SELECT)
      .in("id", userIds);
    if (filters.searchPattern) {
      profileQuery = profileQuery.ilike("display_name", filters.searchPattern);
    }
    const profileResult = await profileQuery
      .order("display_name", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (
      profileResult.error ||
      !Array.isArray(profileResult.data) ||
      !profileResult.data.every(isSummaryProfileRow)
    ) {
      return { ok: false, error: "server" };
    }

    const profileById = new Map(profileResult.data.map((profile) => [profile.id, profile]));
    const players = membershipResult.data.flatMap((membership) => {
      const profile = profileById.get(membership.user_id);
      return profile ? [mapSummary(membership, profile)] : [];
    });
    return { ok: true, players: sortPlayers(players, filters) };
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

    const summary = mapSummary(membershipResult.data, profileResult.data);
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
