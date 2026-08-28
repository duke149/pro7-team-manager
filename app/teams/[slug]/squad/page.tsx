import { notFound } from "next/navigation";

import { parseSquadFilters, type SquadFilters } from "../../../../lib/squad/filters";
import type { SquadAssignableRolesResult, SquadListResult, SquadPerformanceResult } from "../../../../lib/squad/model";
import { listSquadPerformance } from "../../../../lib/squad/performance";
import { listAssignableSquadRoles, listSquadPlayers } from "../../../../lib/squad/queries";
import { requireTeamPermission } from "../../../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../../../lib/teams/permissions";
import { SquadView } from "./squad-view";

type RouteSearchParameters = Record<string, string | string[] | undefined>;

type SquadRoutePageArguments = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RouteSearchParameters>;
  requireTeamPermission: (
    slug: string,
    permission: PermissionCode,
  ) => Promise<Awaited<ReturnType<typeof requireTeamPermission>>>;
  listSquadPlayers: (teamId: string, filters: SquadFilters) => Promise<SquadListResult>;
  listSquadPerformance?: (
    teamId: string,
    userIds: readonly string[],
  ) => Promise<SquadPerformanceResult>;
  listAssignableSquadRoles?: (
    teamId: string,
    canReadRoles: boolean,
  ) => Promise<SquadAssignableRolesResult>;
  denied: () => unknown;
};

function toUrlSearchParameters(values: RouteSearchParameters): URLSearchParams {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") parameters.set(key, value);
  }
  return parameters;
}

export async function renderSquadPage(arguments_: SquadRoutePageArguments) {
  const { slug } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "players.read");
  if (!context) return arguments_.denied();

  const rawSearchParameters = await arguments_.searchParams;
  const filters = parseSquadFilters(toUrlSearchParameters(rawSearchParameters));
  const result = await arguments_.listSquadPlayers(context.team.id, filters);
  const performance = result.ok && result.players.length > 0
    ? await (arguments_.listSquadPerformance ?? listSquadPerformance)(
      context.team.id,
      result.players.map((player) => player.userId),
    )
    : { ok: true as const, players: [] };
  const canManage = hasPermission(context, "players.manage")
    && hasPermission(context, "members.manage");
  const showProvisioning = canManage && rawSearchParameters.add === "player";
  const rolesResult = showProvisioning && arguments_.listAssignableSquadRoles
    ? await arguments_.listAssignableSquadRoles(
      context.team.id,
      hasPermission(context, "roles.read"),
    )
    : { ok: true as const, roles: [] };
  return (
    <SquadView
      team={context.team}
      permissions={context.permissions}
      filters={filters}
      result={result}
      performance={performance}
      assignableRoles={rolesResult.ok ? rolesResult.roles : []}
      showProvisioning={showProvisioning}
    />
  );
}

export default async function SquadPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RouteSearchParameters>;
}) {
  return renderSquadPage({
    params,
    searchParams,
    requireTeamPermission,
    listSquadPlayers,
    listSquadPerformance,
    listAssignableSquadRoles,
    denied: notFound,
  });
}
