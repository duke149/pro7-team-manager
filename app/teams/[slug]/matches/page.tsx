import { notFound } from "next/navigation";

import { listMatches } from "../../../../lib/matches/queries";
import type { MatchListResult } from "../../../../lib/matches/model";
import { requireTeamPermission, type TeamAccessContext } from "../../../../lib/teams/context";
import type { PermissionCode } from "../../../../lib/teams/permissions";
import { MatchesView } from "./matches-view";

export async function renderMatchesPage(
  arguments_: {
    params: Promise<{ slug: string }>;
    requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
    listMatches?: (teamId: string, userId: string) => Promise<MatchListResult>;
    denied: () => unknown;
    now?: string;
  },
) {
  const { slug } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "matches.read");
  if (!context) return arguments_.denied();
  const result = arguments_.listMatches
    ? await arguments_.listMatches(context.team.id, context.userId)
    : { ok: true as const, matches: [] };
  return <MatchesView team={context.team} userId={context.userId} permissions={context.permissions} result={result} now={arguments_.now ?? new Date().toISOString()} />;
}

export default async function MatchesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderMatchesPage({ params, requireTeamPermission, listMatches, denied: notFound });
}
