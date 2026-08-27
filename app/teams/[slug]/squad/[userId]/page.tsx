import { notFound } from "next/navigation";

import type { SquadAssignableRolesResult, SquadDetailResult, SquadPlayerDetail } from "../../../../../lib/squad/model";
import { getSquadPlayer, listAssignableSquadRoles } from "../../../../../lib/squad/queries";
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
  listAssignableSquadRoles: (
    teamId: string,
    canReadRoles: boolean,
  ) => Promise<SquadAssignableRolesResult>;
  denied: () => unknown;
};

function withoutAdminNotes(player: SquadPlayerDetail): SquadPlayerDetail {
  const safePlayer = { ...player };
  delete safePlayer.adminNotes;
  return safePlayer;
}

function playerMutationVersion(player: SquadPlayerDetail): string {
  return JSON.stringify([
    player.role.id,
    player.membershipStatus,
    player.shirtNumber,
    player.officialPosition,
    player.playerStatus,
    player.joinDate,
    player.adminNotes,
  ]);
}

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

  const isOwner = result.player.role.isVisible !== false
    && result.player.role.isSystem
    && result.player.role.slug === "owner";
  const canMutate = canManage
    && result.player.membershipStatus === "active"
    && !isOwner;
  const rolesResult = canMutate
    ? await arguments_.listAssignableSquadRoles(
      context.team.id,
      hasPermission(context, "roles.read"),
    )
    : { ok: true as const, roles: [] };
  const hasCurrentRole = rolesResult.ok
    && rolesResult.roles.some((role) => role.id === result.player.role.id);
  const assignableRoles = rolesResult.ok && hasCurrentRole
    ? rolesResult.roles
    : [];
  const playerForClient = canMutate
    ? result.player
    : withoutAdminNotes(result.player);

  return (
    <PlayerDetail
      key={playerMutationVersion(playerForClient)}
      slug={context.team.slug}
      player={playerForClient}
      canManage={canMutate}
      assignableRoles={assignableRoles}
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
    listAssignableSquadRoles,
    denied: notFound,
  });
}
