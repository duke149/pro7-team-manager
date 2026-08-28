import { notFound } from "next/navigation";

import type { MatchDetailResult } from "../../../../../../lib/matches/model";
import { isUuid } from "../../../../../../lib/matches/model";
import { getMatchDetail } from "../../../../../../lib/matches/queries";
import { requireTeamPermission, type TeamAccessContext } from "../../../../../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../../../../../lib/teams/permissions";
import { RsvpView } from "./rsvp-view";

type Arguments = Readonly<{
  params: Promise<{ slug: string; matchId: string }>;
  requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
  getMatchDetail: (teamId: string, matchId: string, userId: string, includeInvites: boolean) => Promise<MatchDetailResult>;
  denied: () => unknown;
  now?: string;
}>;

export async function renderMatchRsvpPage(arguments_: Arguments) {
  const { slug, matchId } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "matches.read");
  if (!context || !isUuid(matchId)) return arguments_.denied();
  const result = await arguments_.getMatchDetail(context.team.id, matchId, context.userId, false);
  if (!result.ok && result.error === "not_found") return arguments_.denied();
  if (!result.ok) return <RsvpView slug={context.team.slug} teamName={context.team.name} detail={null} canRespond={false} ownNote={null} now={arguments_.now ?? new Date().toISOString()} />;
  const own = result.detail.attendance.find((entry) => entry.userId === context.userId) ?? null;
  return <RsvpView
    slug={context.team.slug}
    teamName={context.team.name}
    detail={result.detail}
    canRespond={hasPermission(context, "matches.respond")}
    ownNote={own?.note ?? null}
    now={arguments_.now ?? new Date().toISOString()}
  />;
}
export default async function MatchRsvpPage({ params }: { params: Promise<{ slug: string; matchId: string }> }) {
  return renderMatchRsvpPage({ params, requireTeamPermission, getMatchDetail, denied: notFound });
}
