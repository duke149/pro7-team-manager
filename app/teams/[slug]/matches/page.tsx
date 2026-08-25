import { notFound } from "next/navigation";

import { renderTeamRoute, type TeamRoutePageArguments } from "../../../components/team-placeholder";
import { requireTeamPermission } from "../../../../lib/teams/context";

export async function renderMatchesPage(
  arguments_: Omit<TeamRoutePageArguments, "permission" | "title" | "pendingSlice"> = {
    params: Promise.resolve({ slug: "" }),
    requireTeamPermission,
    denied: notFound,
  },
) {
  return renderTeamRoute({
    ...arguments_,
    permission: "matches.read",
    title: "Trận đấu",
    pendingSlice: "Dữ liệu trận đấu",
  });
}

export default async function MatchesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderMatchesPage({ params, requireTeamPermission, denied: notFound });
}
