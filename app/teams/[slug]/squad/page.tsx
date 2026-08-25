import { notFound } from "next/navigation";

import { renderTeamRoute, type TeamRoutePageArguments } from "../../../components/team-placeholder";
import { requireTeamPermission } from "../../../../lib/teams/context";

export async function renderSquadPage(
  arguments_: Omit<TeamRoutePageArguments, "permission" | "title" | "pendingSlice"> = {
    params: Promise.resolve({ slug: "" }),
    requireTeamPermission,
    denied: notFound,
  },
) {
  return renderTeamRoute({
    ...arguments_,
    permission: "players.read",
    title: "Đội hình",
    pendingSlice: "Quản lý cầu thủ",
  });
}

export default async function SquadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderSquadPage({ params, requireTeamPermission, denied: notFound });
}
