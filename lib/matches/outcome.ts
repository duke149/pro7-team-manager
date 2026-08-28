import type { MatchSummary } from "./model";

export type MatchOutcome = {
  className: "win" | "draw" | "loss";
  label: "THẮNG" | "HÒA" | "THUA";
};

export function getMatchOutcome(
  match: Pick<MatchSummary, "status" | "teamScore" | "opponentScore">,
): MatchOutcome | null {
  if (
    match.status !== "completed" ||
    typeof match.teamScore !== "number" ||
    typeof match.opponentScore !== "number"
  ) {
    return null;
  }
  if (match.teamScore > match.opponentScore) {
    return { className: "win", label: "THẮNG" };
  }
  if (match.teamScore === match.opponentScore) {
    return { className: "draw", label: "HÒA" };
  }
  return { className: "loss", label: "THUA" };
}
