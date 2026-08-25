import { notFound } from "next/navigation";

import { Pro7SquadSkeleton } from "../../../components/pro7-squad-skeleton";
import { requireTeamPermission } from "../../../../lib/teams/context";
import type { PermissionCode } from "../../../../lib/teams/permissions";
import type { ReactNode } from "react";

type SquadRoutePageArguments = {
  params: Promise<{ slug: string }>;
  requireTeamPermission: (
    slug: string,
    permission: PermissionCode,
  ) => Promise<Awaited<ReturnType<typeof requireTeamPermission>>>;
  denied: () => ReactNode;
};

export async function renderSquadPage(
  arguments_: SquadRoutePageArguments = {
    params: Promise.resolve({ slug: "" }),
    requireTeamPermission,
    denied: notFound,
  },
) {
  const { slug } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "players.read");
  return context ? <Pro7SquadSkeleton team={context.team} permissions={context.permissions} /> : arguments_.denied();
}

export default async function SquadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderSquadPage({ params, requireTeamPermission, denied: notFound });
}
