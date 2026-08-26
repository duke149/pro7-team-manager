import {
  HeartPulse,
  ShieldCheck,
  Shirt,
  UserPlus,
  Users,
} from "lucide-react";

import type { SquadFilters } from "../../../../lib/squad/filters";
import type { SquadListResult, SquadPlayerSummary } from "../../../../lib/squad/model";
import type { TeamAccessContext } from "../../../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../../../lib/teams/permissions";
import { SquadToolbar } from "./squad-toolbar";

export { SquadToolbar } from "./squad-toolbar";
const PLAYER_STATUS_LABELS = {
  available: "Sẵn sàng",
  injured: "Chấn thương",
  unavailable: "Không sẵn sàng",
} as const;

function initials(name: string | null): string {
  return (name ?? "Cầu thủ").trim().split(/\s+/u).filter(Boolean).slice(-2)
    .map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("") || "CT";
}

function safeAvatarUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function SquadSummary({ players, loading = false }: { players: readonly SquadPlayerSummary[]; loading?: boolean }) {
  const total = loading ? "—" : String(players.length);
  const ready = loading ? "—" : String(players.filter((player) => player.membershipStatus === "active" && player.playerStatus === "available").length);
  const injured = loading ? "—" : String(players.filter((player) => player.membershipStatus === "active" && player.playerStatus === "injured").length);
  return (
    <section className="squad-summary" aria-label="Tóm tắt đội hình">
      <div><Users /><span>Quân số<strong>{total}</strong></span></div>
      <div><ShieldCheck /><span>Sẵn sàng<strong>{ready}</strong></span></div>
      <div><HeartPulse /><span>Chấn thương<strong className="red-text">{injured}</strong></span></div>
      <div><Shirt /><span>Tuổi TB<strong>—</strong></span></div>
    </section>
  );
}

function PlayerCard({ slug, player }: { slug: string; player: SquadPlayerSummary }) {
  const name = player.displayName ?? "Cầu thủ chưa cập nhật tên";
  const avatarUrl = safeAvatarUrl(player.avatarUrl);
  const effectiveStatus = player.membershipStatus === "inactive" ? "Ngừng hoạt động" : PLAYER_STATUS_LABELS[player.playerStatus];
  const href = `/teams/${encodeURIComponent(slug)}/squad/${encodeURIComponent(player.userId)}`;
  return (
    <article className={`player-card ${player.playerStatus === "injured" ? "injured" : ""} ${player.membershipStatus === "inactive" ? "inactive" : ""}`}>
      <a className="player-card-link" href={href} aria-label={`Xem hồ sơ ${name}`}>
        <div className="player-top">
          {avatarUrl
            ? <span className="player-avatar-photo" style={{ backgroundImage: `url(${JSON.stringify(avatarUrl)})` }} aria-hidden="true" />
            : <div className="initial-avatar" aria-hidden="true">{initials(name)}</div>}
          <div><h3>{name}</h3><span className="position-chip">{player.officialPosition ?? "—"}</span><span className="role-chip">{player.role.name}</span>{player.playerStatus === "injured" && <span className="injury-chip">Chấn thương</span>}</div>
          <strong>{player.shirtNumber === null ? "#—" : `#${player.shirtNumber}`}</strong>
        </div>
        <div className="player-stats"><span>GIA NHẬP<strong>{player.joinDate}</strong></span><span>TÌNH TRẠNG<strong>{effectiveStatus}</strong></span><span className="player-card-open" aria-hidden="true">→</span></div>
      </a>
    </article>
  );
}

export function SquadView({
  team,
  permissions,
  filters,
  result,
}: {
  team: TeamAccessContext["team"];
  permissions: readonly PermissionCode[];
  filters: SquadFilters;
  result: SquadListResult;
}) {
  const players = result.ok ? result.players : [];
  const canManage = hasPermission({ permissions }, "players.manage") && hasPermission({ permissions }, "members.manage");
  const state = !result.ok ? "error" : players.length === 0 ? "empty" : "ready";
  return (
    <div className="view-stack">
      <SquadToolbar slug={team.slug} filters={filters} />
      <SquadSummary players={players} />
      <section className="player-grid" aria-live="polite" data-state={state}>
        {!result.ok && <article className="player-card squad-empty-state squad-error-state"><div><h2>Không thể tải đội hình</h2><p>Vui lòng tải lại trang để thử kết nối dữ liệu một lần nữa.</p></div></article>}
        {result.ok && players.length === 0 && <article className="player-card squad-empty-state"><div><h2>Chưa có cầu thủ</h2><p>Không có cầu thủ phù hợp với bộ lọc hiện tại.</p></div></article>}
        {players.map((player) => <PlayerCard key={player.userId} slug={team.slug} player={player} />)}
        {canManage && <a className="add-player-card" href={`/teams/${encodeURIComponent(team.slug)}/squad?add=player`}><span><UserPlus /></span><b>Thêm cầu thủ</b><small>Đăng ký thành viên mới</small></a>}
      </section>
    </div>
  );
}

export const EMPTY_FILTERS: SquadFilters = Object.freeze({ q: "", searchPattern: null, position: "all", status: "active", sort: "name", direction: "asc" });
