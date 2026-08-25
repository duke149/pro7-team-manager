import { notFound } from "next/navigation";

import { renderTeamRoute, type TeamRoutePageArguments } from "../../../components/team-placeholder";
import { requireTeamPermission } from "../../../../lib/teams/context";

export async function renderOverviewPage(
  arguments_: Omit<TeamRoutePageArguments, "permission" | "title" | "pendingSlice"> = {
    params: Promise.resolve({ slug: "" }),
    requireTeamPermission,
    denied: notFound,
  },
) {
  return renderTeamRoute({
    ...arguments_,
    permission: "team.read",
    title: "Tổng quan",
    pendingSlice: "Dữ liệu tổng quan",
  });
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderOverviewPage({ params, requireTeamPermission, denied: notFound });
}
