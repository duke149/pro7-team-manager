import { notFound } from "next/navigation";

import { renderTeamRoute, type TeamRoutePageArguments } from "../../../components/team-placeholder";
import { requireTeamPermission } from "../../../../lib/teams/context";

export async function renderFundsPage(
  arguments_: Omit<TeamRoutePageArguments, "permission" | "title" | "pendingSlice"> = {
    params: Promise.resolve({ slug: "" }),
    requireTeamPermission,
    denied: notFound,
  },
) {
  return renderTeamRoute({
    ...arguments_,
    permission: "finance.read",
    title: "Quỹ đội",
    pendingSlice: "Quản lý quỹ đội",
  });
}

export default async function FundsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderFundsPage({ params, requireTeamPermission, denied: notFound });
}
