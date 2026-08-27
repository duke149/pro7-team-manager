import { notFound } from "next/navigation";

import type { MatchDetailResult } from "../../../../../lib/matches/model";
import { getMatchDetail } from "../../../../../lib/matches/queries";
import { requireTeamPermission, type TeamAccessContext } from "../../../../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../../../../lib/teams/permissions";
import { MatchDetail } from "./match-detail";

type Arguments = {
  params: Promise<{ slug: string; matchId: string }>;
  requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
  getMatchDetail: (teamId: string, matchId: string, userId: string, includeInvites: boolean) => Promise<MatchDetailResult>;
  denied: () => unknown;
  now?: string;
};

export async function renderMatchDetailPage(arguments_: Arguments) {
  const { slug, matchId } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "matches.read");
  if (!context) return arguments_.denied();
  const canManage = hasPermission(context, "matches.manage");
  const result = await arguments_.getMatchDetail(context.team.id, matchId, context.userId, canManage);
  if (!result.ok && result.error === "not_found") return arguments_.denied();
  return <MatchDetail slug={context.team.slug} teamName={context.team.name} userId={context.userId} detail={result.ok ? result.detail : null} canManage={canManage} canRespond={hasPermission(context, "matches.respond")} now={arguments_.now ?? new Date().toISOString()} />;
}

export default async function MatchPage({ params }: { params: Promise<{ slug: string; matchId: string }> }) {
  return renderMatchDetailPage({ params, requireTeamPermission, getMatchDetail, denied: notFound });
}
