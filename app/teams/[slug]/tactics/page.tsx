import { notFound } from "next/navigation";

import type { TacticsMatchesResult } from "../../../../lib/tactics/model";
import { listScheduledTacticsMatches } from "../../../../lib/tactics/queries";
import { requireTeamPermission, type TeamAccessContext } from "../../../../lib/teams/context";
import type { PermissionCode } from "../../../../lib/teams/permissions";

type Arguments = { params: Promise<{ slug: string }>; requireTeamPermission: (slug: string, permission: PermissionCode) => Promise<TeamAccessContext | null>; listScheduledMatches?: (teamId: string, userId: string) => Promise<TacticsMatchesResult>; denied: () => unknown };
function date(value: string) { return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }

export async function renderTacticsPage(arguments_: Arguments) {
  const { slug } = await arguments_.params;
  const context = await arguments_.requireTeamPermission(slug, "tactics.read");
  if (!context) return arguments_.denied();
  const result = arguments_.listScheduledMatches ? await arguments_.listScheduledMatches(context.team.id, context.userId) : { ok: true as const, matches: [] };
  const state = !result.ok ? "error" : result.matches.length === 0 ? "empty" : "ready";
  return <div className="view-stack tactics-index" data-state={state}>
    {!result.ok ? <section className="card tactics-state"><h2>Không thể tải chiến thuật</h2><p>Kết nối dữ liệu đang gián đoạn. Vui lòng tải lại trang.</p></section>
      : result.matches.length === 0 ? <section className="card squad-empty-state" aria-labelledby="tactics-empty-title"><div><span className="page-heading">CHIẾN THUẬT</span><h2 id="tactics-empty-title">Chưa có trận đấu để lập chiến thuật</h2><p>Đội hình sẽ được chuẩn bị từ trang trận đấu sau khi một trận được tạo.</p></div></section>
        : <section className="card tactics-match-list"><div className="section-head"><div><span>CHIẾN THUẬT</span><h2>Chọn trận đấu</h2></div><strong>{result.matches.length}</strong></div>{result.matches.map((match) => <a className="tactics-match-row" key={match.id} href={`/teams/${encodeURIComponent(context.team.slug)}/tactics/${encodeURIComponent(match.id)}`}><span><b>{context.team.name} vs {match.opponent}</b><small>{date(match.startsAt)} • {match.venue ?? "Chưa cập nhật địa điểm"}</small></span><strong>Lập đội hình →</strong></a>)}</section>}
  </div>;
}

export default async function TacticsPage({ params }: { params: Promise<{ slug: string }> }) { return renderTacticsPage({ params, requireTeamPermission, listScheduledMatches: listScheduledTacticsMatches, denied: notFound }); }
