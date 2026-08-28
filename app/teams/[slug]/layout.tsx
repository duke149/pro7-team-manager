import { requireProductUser } from "../../../lib/supabase/auth";
import { loadTeamAccessContext } from "../../../lib/teams/context";
import { listTeamNotifications } from "../../../lib/notifications/queries";
import type { NotificationListResult } from "../../../lib/notifications/model";
import {
  safeTeamReturnPath,
  TEAM_RETURN_PATH_HEADER,
} from "../../../lib/teams/return-path";
import { Pro7RouteShell } from "../../components/pro7-route-shell";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export async function renderTeamLayout({
  children,
  params,
  requireProductUser: requireUser,
  loadTeamAccessContext: loadContext,
  getReturnPath,
  denied = notFound,
  loadNotifications,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
  requireProductUser: typeof requireProductUser;
  loadTeamAccessContext?: (slug: string) => ReturnType<typeof loadTeamAccessContext>;
  getReturnPath?: (slug: string) => Promise<string>;
  denied?: () => React.ReactNode;
  loadNotifications?: (teamId: string, userId: string, slug: string) => Promise<NotificationListResult>;
}) {
  const { slug } = await params;
  const returnPath = getReturnPath
    ? await getReturnPath(slug)
    : safeTeamReturnPath(slug, (await headers()).get(TEAM_RETURN_PATH_HEADER));
  const productUser = await requireUser(returnPath);

  if (!loadContext) return children;

  const context = await loadContext(slug);
  if (!context) return denied();
  const notificationResult = loadNotifications ? await loadNotifications(context.team.id, context.userId, context.team.slug) : null;

  return (
    <Pro7RouteShell
      team={context.team}
      roleName={context.membership.roleName}
      permissions={context.permissions}
      email={productUser.user.email}
      notifications={notificationResult?.ok ? notificationResult.notifications : []}
      vapidPublicKey={process.env.NEXT_PUBLIC_PRO7_VAPID_PUBLIC_KEY?.trim() || undefined}
    >
      {children}
    </Pro7RouteShell>
  );
}

export default async function TeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  return renderTeamLayout({
    children,
    params,
    requireProductUser,
    loadTeamAccessContext,
    loadNotifications: listTeamNotifications,
  });
}
