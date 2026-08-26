export type PlayerPosition = "GK" | "DEF" | "MID" | "ATT";
export type PlayerStatus = "available" | "injured" | "unavailable";
export type MembershipStatus = "active" | "inactive";

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

export type SquadPlayerRole = Readonly<{
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
}>;

export type SquadPlayerSummary = Readonly<{
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  avatarUrl: string | null;
  membershipStatus: MembershipStatus;
  role: SquadPlayerRole;
  shirtNumber: number | null;
  officialPosition: PlayerPosition | null;
  playerStatus: PlayerStatus;
  joinDate: string;
}>;

export type SquadPlayerDetail = SquadPlayerSummary &
  Readonly<{
    phone: string | null;
    dateOfBirth: string | null;
    heightCm: number | null;
    weightKg: number | null;
    preferredPositions: readonly PlayerPosition[];
    adminNotes?: string | null;
  }>;

export type SquadListResult =
  | Readonly<{ ok: true; players: readonly SquadPlayerSummary[] }>
  | Readonly<{ ok: false; error: "server" }>;

export type SquadDetailResult =
  | Readonly<{ ok: true; player: SquadPlayerDetail }>
  | Readonly<{ ok: false; error: "not_found" | "server" }>;
