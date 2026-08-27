"use client";

import { HeartPulse, Search, Shirt, SlidersHorizontal, UserPlus, Users, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { TeamAccessContext } from "../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../lib/teams/permissions";

const positions = ["ALL", "GK", "DEF", "MID", "ATT"] as const;

export function Pro7SquadSkeleton({
  team,
  permissions,
}: {
  team: TeamAccessContext["team"];
  permissions: readonly PermissionCode[];
}) {
  const [filter, setFilter] = useState<(typeof positions)[number]>("ALL");
  const canManagePlayers = hasPermission({ permissions }, "players.manage");
  const addPlayerHref = `/teams/${encodeURIComponent(team.slug)}/squad?add=player`;

  return <div className="view-stack">
    <section className="squad-toolbar card" aria-label="Tìm và lọc cầu thủ">
      <label className="search-box"><Search size={19} /><span className="sr-only">Tìm theo tên cầu thủ</span><input placeholder="Tìm theo tên cầu thủ..." /></label>
      <div className="filter-row" aria-label="Vị trí cầu thủ">
        {positions.map((position) => <button type="button" className={filter === position ? "active" : ""} aria-pressed={filter === position} onClick={() => setFilter(position)} key={position}>{position === "ALL" ? "Tất cả" : position}</button>)}
      </div>
      <button className="filter-button" type="button"><SlidersHorizontal size={17} /> Bộ lọc</button>
    </section>
    <section className="squad-summary" aria-label="Tóm tắt đội hình">
      <div><Users /><span>Quân số<strong>—</strong></span></div>
      <div><ShieldCheck /><span>Sẵn sàng<strong>—</strong></span></div>
      <div><HeartPulse /><span>Chấn thương<strong className="red-text">—</strong></span></div>
      <div><Shirt /><span>Tuổi TB<strong>—</strong></span></div>
    </section>
    <section className="player-grid" aria-live="polite" data-state="empty">
      <article className="player-card squad-empty-state"><div><h2>Chưa có cầu thủ</h2><p>Danh sách cầu thủ sẽ xuất hiện tại đây khi dữ liệu đội được kết nối.</p></div></article>
      {canManagePlayers && <a className="add-player-card" href={addPlayerHref}><span><UserPlus /></span><b>Thêm cầu thủ</b><small>Đăng ký thành viên mới</small></a>}
    </section>
  </div>;
}
