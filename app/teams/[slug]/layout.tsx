import { requireProductUser } from "../../../lib/supabase/auth";
import { loadTeamAccessContext } from "../../../lib/teams/context";
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
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
  requireProductUser: typeof requireProductUser;
  loadTeamAccessContext?: (slug: string) => ReturnType<typeof loadTeamAccessContext>;
  getReturnPath?: (slug: string) => Promise<string>;
  denied?: () => React.ReactNode;
}) {
  const { slug } = await params;
  const returnPath = getReturnPath
    ? await getReturnPath(slug)
    : safeTeamReturnPath(slug, (await headers()).get(TEAM_RETURN_PATH_HEADER));
  const productUser = await requireUser(returnPath);

  if (!loadContext) return children;

  const context = await loadContext(slug);
  if (!context) return denied();

  return (
    <Pro7RouteShell
      team={context.team}
      roleName={context.membership.roleName}
      permissions={context.permissions}
      email={productUser.user.email}
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
  });
}
