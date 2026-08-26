import { notFound } from "next/navigation";

import type { TacticsDetailResult } from "../../../../../lib/tactics/model";
import { getTacticsDetail } from "../../../../../lib/tactics/queries";
import { requireTeamPermission, type TeamAccessContext } from "../../../../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../../../../lib/teams/permissions";
import { TacticsBoard } from "./tactics-board";

type Arguments = { params: Promise<{ slug: string; matchId: string }>; requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>; getTacticsDetail: (teamId: string, matchId: string, userId: string, canManage: boolean) => Promise<TacticsDetailResult>; denied: () => unknown };
export async function renderTacticsMatchPage(arguments_: Arguments) {
  const { slug, matchId } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "tactics.read");
  if (!context) return arguments_.denied();
  const canManage = hasPermission(context, "tactics.manage");
  const result = await arguments_.getTacticsDetail(context.team.id, matchId, context.userId, canManage);
  if (!result.ok && result.error === "not_found") return arguments_.denied();
  if (!result.ok) return <div className="view-stack tactics-view" data-state="error"><section className="card tactics-state"><h2>Không thể tải chiến thuật</h2><p>Kết nối dữ liệu đang gián đoạn. Vui lòng tải lại trang.</p></section></div>;
  if (!canManage && result.detail.tactics.length === 0) return <div className="view-stack tactics-view" data-state="empty"><section className="card tactics-state"><h2>Chưa có chiến thuật đã áp dụng</h2><p>Quản lý đội chưa công bố đội hình cho trận này.</p></section></div>;
  return <TacticsBoard slug={context.team.slug} teamName={context.team.name} detail={result.detail} canManage={canManage} />;
}
export default async function TacticsMatchPage({ params }: { params: Promise<{ slug: string; matchId: string }> }) { return renderTacticsMatchPage({ params, requireTeamPermission, getTacticsDetail, denied: notFound }); }
