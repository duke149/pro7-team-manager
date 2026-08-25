import type { ReactNode } from "react";

import type { TeamAccessContext } from "../../lib/teams/context";
import type { PermissionCode } from "../../lib/teams/permissions";

export function TeamPlaceholder({
  context,
  title,
  pendingSlice,
}: {
  context: TeamAccessContext;
  title: string;
  pendingSlice: string;
}) {
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="team-placeholder-title">
        <div className="login-copy">
          <p>{context.team.name}</p>
          <h1 id="team-placeholder-title">{title}</h1>
          <span>Vai trò hiện tại: {context.membership.roleName}</span>
          <span>{pendingSlice} sẽ được xây dựng ở lát cắt tiếp theo.</span>
        </div>
      </section>
    </main>
  );
}

export type TeamRoutePageArguments = {
  params: Promise<{ slug: string }>;
  permission: PermissionCode;
  title: string;
  pendingSlice: string;
  requireTeamPermission: (
    slug: string,
    permission: PermissionCode,
  ) => Promise<TeamAccessContext | null>;
  denied: () => ReactNode;
};

export async function renderTeamRoute({
  params,
  permission,
  title,
  pendingSlice,
  requireTeamPermission,
  denied,
}: TeamRoutePageArguments): Promise<ReactNode> {
  const { slug } = await params;
  const context = await requireTeamPermission(slug, permission);
  return context ? (
    <TeamPlaceholder context={context} title={title} pendingSlice={pendingSlice} />
  ) : (
    denied()
  );
}
