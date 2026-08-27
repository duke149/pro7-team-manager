import type { MatchSummary } from "../matches/model";

export const TACTIC_FORMATIONS = ["2-3-1", "3-2-1", "2-2-2"] as const;
export const TACTIC_MODES = ["balanced", "attacking", "defensive"] as const;
export const TACTIC_LEVELS = ["low", "medium", "high"] as const;
export const TACTIC_ROLES = ["GK", "DEF", "MID", "ATT"] as const;

export type TacticFormation = (typeof TACTIC_FORMATIONS)[number];
export type TacticMode = (typeof TACTIC_MODES)[number];
export type TacticLevel = (typeof TACTIC_LEVELS)[number];
export type TacticRole = (typeof TACTIC_ROLES)[number];
export type TacticSlotKind = "starter" | "bench";

export type TacticSlot = Readonly<{
  userId: string;
  slotKind: TacticSlotKind;
  slotKey: string;
  roleLabel: TacticRole;
  shirtNumber: number | null;
  x: number;
  y: number;
}>;

export type MatchTactic = Readonly<{
  id: string;
  mode: TacticMode;
  formation: TacticFormation;
  instructions: string | null;
  version: number;
  pressing: TacticLevel;
  defensiveLine: TacticLevel;
  status: "draft" | "applied";
  updatedAt: string;
  appliedAt: string | null;
  slots: readonly TacticSlot[];
}>;

export type TacticsPlayer = Readonly<{
  userId: string;
  displayName: string | null;
  shirtNumber: number | null;
  officialPosition: TacticRole | null;
}>;

export type TacticsDetail = Readonly<{
  match: MatchSummary;
  players: readonly TacticsPlayer[];
  tactics: readonly MatchTactic[];
}>;

export type TacticsMatchesResult =
  | Readonly<{ ok: true; matches: readonly MatchSummary[] }>
  | Readonly<{ ok: false; error: "server" }>;

export type TacticsDetailResult =
  | Readonly<{ ok: true; detail: TacticsDetail }>
  | Readonly<{ ok: false; error: "not_found" | "server" }>;
