import {
  ArrowDownAZ,
  HeartPulse,
  Search,
  ShieldCheck,
  Shirt,
  SlidersHorizontal,
  UserPlus,
  Users,
} from "lucide-react";

import type { SquadFilters } from "../../../../lib/squad/filters";
import type { SquadListResult, SquadPlayerSummary } from "../../../../lib/squad/model";
import type { TeamAccessContext } from "../../../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../../../lib/teams/permissions";

const POSITIONS = ["all", "GK", "DEF", "MID", "ATT"] as const;
const STATUS_LABELS = {
  active: "Sẵn sàng",
  injured: "Chấn thương",
  unavailable: "Không sẵn sàng",
  inactive: "Ngừng hoạt động",
} as const;
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

function squadHref(
  slug: string,
  filters: SquadFilters,
  overrides: Partial<Pick<SquadFilters, "q" | "position" | "status" | "sort" | "direction">> = {},
): string {
  const values = { ...filters, ...overrides };
  const parameters = new URLSearchParams({
    q: values.q,
    position: values.position,
    status: values.status,
    sort: values.sort,
    direction: values.direction,
  });
  return `/teams/${encodeURIComponent(slug)}/squad?${parameters.toString()}`;
}

function PositionLinks({ slug, filters }: { slug: string; filters: SquadFilters }) {
  return (
    <div className="filter-row" aria-label="Vị trí cầu thủ">
      {POSITIONS.map((position) => (
        <a
          key={position}
          className={filters.position === position ? "active" : undefined}
          aria-current={filters.position === position ? "page" : undefined}
          href={squadHref(slug, filters, { position })}
        >
          {position === "all" ? "Tất cả" : position}
        </a>
      ))}
    </div>
  );
}

export function SquadToolbar({
  slug,
  filters,
  disabled = false,
}: {
  slug: string;
  filters: SquadFilters;
  disabled?: boolean;
}) {
  const action = `/teams/${encodeURIComponent(slug)}/squad`;
  return (
    <section className="squad-toolbar card" aria-label="Tìm và lọc cầu thủ">
      <form className="search-box" action={action} method="get">
        <Search size={19} />
        <label className="sr-only" htmlFor="squad-search">Tìm theo tên cầu thủ</label>
        <input id="squad-search" name="q" defaultValue={filters.q} placeholder="Tìm theo tên cầu thủ..." disabled={disabled} />
        <input type="hidden" name="position" value={filters.position} />
        <input type="hidden" name="status" value={filters.status} />
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="direction" value={filters.direction} />
        <button className="sr-only" type="submit">Tìm kiếm</button>
      </form>
      {disabled ? (
        <div className="filter-row" aria-hidden="true">
          {POSITIONS.map((position) => <span key={position}>{position === "all" ? "Tất cả" : position}</span>)}
        </div>
      ) : <PositionLinks slug={slug} filters={filters} />}
      <details className="squad-filter-panel">
        <summary className="filter-button"><SlidersHorizontal size={17} /> Bộ lọc</summary>
        <form action={action} method="get">
          <input type="hidden" name="q" value={filters.q} />
          <input type="hidden" name="position" value={filters.position} />
          <label>Tình trạng<select name="status" defaultValue={filters.status} disabled={disabled}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Sắp xếp<select name="sort" defaultValue={filters.sort} disabled={disabled}><option value="name">Tên cầu thủ</option><option value="shirt_number">Số áo</option><option value="position">Vị trí</option><option value="join_date">Ngày gia nhập</option><option value="status">Tình trạng</option></select></label>
          <label>Thứ tự<select name="direction" defaultValue={filters.direction} disabled={disabled}><option value="asc">Tăng dần</option><option value="desc">Giảm dần</option></select></label>
          <button className="primary-button" type="submit" disabled={disabled}><ArrowDownAZ size={16} /> Áp dụng</button>
        </form>
      </details>
    </section>
  );
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
