import { notFound } from "next/navigation";

import { renderTeamRoute, type TeamRoutePageArguments } from "../../../../components/team-placeholder";
import { requireTeamPermission } from "../../../../../lib/teams/context";

export async function renderSettingsPage(
  arguments_: Omit<TeamRoutePageArguments, "permission" | "title" | "pendingSlice"> = {
    params: Promise.resolve({ slug: "" }),
    requireTeamPermission,
    denied: notFound,
  },
) {
  return renderTeamRoute({
    ...arguments_,
    permission: "settings.read",
    title: "Cài đặt đội",
    pendingSlice: "Cài đặt đội và vai trò",
  });
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderSettingsPage({ params, requireTeamPermission, denied: notFound });
}
