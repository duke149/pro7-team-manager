import { notFound } from "next/navigation";

import type { OverviewResult } from "../../../../lib/overview/model";
import { loadOverview } from "../../../../lib/overview/queries";
import { requireTeamPermission, type TeamAccessContext } from "../../../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../../../lib/teams/permissions";
import type { OverviewAccess } from "../../../../lib/overview/model";
import { OverviewView } from "./overview-view";

export async function renderOverviewPage(
  arguments_: {
    params: Promise<{ slug: string }>;
    requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>;
    loadOverview?: (teamId: string, userId: string, now: string, access: OverviewAccess) => Promise<OverviewResult>;
    denied: () => unknown;
    now?: string;
  } = {
    params: Promise.resolve({ slug: "" }),
    requireTeamPermission,
    denied: notFound,
  },
) {
  const { slug } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "team.read");
  if (!context) return arguments_.denied();
  const now = arguments_.now ?? new Date().toISOString();
  const access = Object.freeze({
    matches: hasPermission(context, "matches.read"),
    news: hasPermission(context, "news.read"),
    manageNews: hasPermission(context, "news.manage"),
  });
  const result = arguments_.loadOverview
    ? await arguments_.loadOverview(context.team.id, context.userId, now, access)
    : ({
      ok: true,
      data: {
        nextMatch: null,
        countdown: null,
        attendance: null,
        statistics: { completedMatches: 0, wins: 0, draws: 0, losses: 0, winRate: null, recentForm: [], recentPoints: 0, topScorer: null },
        news: [],
        managedNews: null,
        calendar: [],
      },
    } as const);
  return <OverviewView context={context} result={result} serverNow={now} />;
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderOverviewPage({ params, requireTeamPermission, loadOverview, denied: notFound });
}
