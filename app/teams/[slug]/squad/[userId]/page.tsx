import { notFound } from "next/navigation";

import type { SquadDetailResult } from "../../../../../lib/squad/model";
import { getSquadPlayer } from "../../../../../lib/squad/queries";
import { requireTeamPermission } from "../../../../../lib/teams/context";
import type { PermissionCode } from "../../../../../lib/teams/permissions";
import { hasPermission } from "../../../../../lib/teams/permissions";
import { PlayerDetail } from "./player-detail";

type DetailPageArguments = {
  params: Promise<{ slug: string; userId: string }>;
  requireTeamPermission: (
    slug: string,
    permission: PermissionCode,
  ) => Promise<Awaited<ReturnType<typeof requireTeamPermission>>>;
  getSquadPlayer: (
    teamId: string,
    userId: string,
    includeAdminNotes: boolean,
  ) => Promise<SquadDetailResult>;
  denied: () => unknown;
};

export async function renderSquadPlayerPage(arguments_: DetailPageArguments) {
  const { slug, userId } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "players.read");
  if (!context) return arguments_.denied();

  const canManage = hasPermission(context, "players.manage")
    && hasPermission(context, "members.manage");
  const result = await arguments_.getSquadPlayer(
    context.team.id,
    userId,
    canManage,
  );
  if (!result.ok && result.error === "not_found") return arguments_.denied();
  if (!result.ok) {
    return (
      <section className="card squad-detail-state" data-state="error">
        <h2>Không thể tải hồ sơ cầu thủ</h2>
        <p>Vui lòng quay lại danh sách và thử lại.</p>
        <a className="primary-button" href={`/teams/${encodeURIComponent(slug)}/squad`}>Quay lại đội hình</a>
      </section>
    );
  }

  return (
    <PlayerDetail
      slug={context.team.slug}
      player={result.player}
      canManage={canManage}
    />
  );
}

export default async function SquadPlayerPage({
  params,
}: {
  params: Promise<{ slug: string; userId: string }>;
}) {
  return renderSquadPlayerPage({
    params,
    requireTeamPermission,
    getSquadPlayer,
    denied: notFound,
  });
}
