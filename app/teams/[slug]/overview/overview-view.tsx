import {
  Activity,
  CalendarDays,
  ClipboardList,
  MapPin,
  MessageCircle,
  Send,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { CSSProperties } from "react";

import type { MatchSummary } from "../../../../lib/matches/model";
import type { OverviewData, OverviewNewsPost, OverviewResult } from "../../../../lib/overview/model";
import type { TeamAccessContext } from "../../../../lib/teams/context";
import { hasPermission } from "../../../../lib/teams/permissions";

function matchTeams(teamName: string, match: MatchSummary): readonly [string, string] {
  return match.isHome ? [teamName, match.opponent] : [match.opponent, teamName];
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/u).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("") || "?";
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function fixtureDate(value: string): { day: string; month: string; time: string } {
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat("vi-VN", { day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date),
    month: `TH${new Intl.DateTimeFormat("vi-VN", { month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date)}`,
    time: new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date),
  };
}

function publishedTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function SectionHead({ label, title }: { label: string; title: string }) {
  return <div className="section-head"><div><span>{label}</span><h2>{title}</h2></div></div>;
}

function MatchHero({ team, data }: { team: TeamAccessContext["team"]; data: OverviewData }) {
  const match = data.nextMatch;
  if (!match) {
    return <article className="match-hero dark-card overview-empty-card"><div className="card-kicker"><span className="live-dot" /> TRẬN ĐẤU TIẾP THEO</div><div className="overview-empty-copy"><h2>Chưa có trận sắp tới</h2><p>Lịch thi đấu hiện chưa có trận được xếp.</p></div><div className="hero-actions"><a className="dark-ghost" href={`/teams/${encodeURIComponent(team.slug)}/matches`}>Mở lịch thi đấu →</a></div></article>;
  }
  const teams = matchTeams(team.name, match);
  const countdown = data.countdown;
  const detailHref = `/teams/${encodeURIComponent(team.slug)}/matches/${encodeURIComponent(match.id)}`;
  const tacticsHref = `/teams/${encodeURIComponent(team.slug)}/tactics/${encodeURIComponent(match.id)}`;

  return <article className="match-hero dark-card">
    <div className="card-kicker"><span className="live-dot" /> TRẬN ĐẤU TIẾP THEO <i>{match.isHome ? "SÂN NHÀ" : "SÂN KHÁCH"}</i></div>
    <div className="teams-line"><div><small>{teams[0].toLocaleUpperCase("vi-VN")}</small><h2>{teams[0]}</h2></div><em>VS</em><div className="away"><small>{teams[1].toLocaleUpperCase("vi-VN")}</small><h2>{teams[1]}</h2></div></div>
    <div className="match-meta"><span><CalendarDays size={15} />{dateTime(match.startsAt)}</span><span><MapPin size={15} />{match.venue ?? "Chưa cập nhật địa điểm"}</span></div>
    {countdown && <div className="countdown-row"><div><b>{String(countdown.days).padStart(2, "0")}</b><span>NGÀY</span></div><div><b>{String(countdown.hours).padStart(2, "0")}</b><span>GIỜ</span></div><div><b>{String(countdown.minutes).padStart(2, "0")}</b><span>PHÚT</span></div></div>}
    <div className="hero-actions"><a className="lime-button" href={tacticsHref}><ClipboardList size={17} />Chốt đội hình</a><a className="dark-ghost" href={detailHref}>Chi tiết trận →</a></div>
  </article>;
}

function AttendanceCard({ team, permissions, data }: { team: TeamAccessContext["team"]; permissions: TeamAccessContext["permissions"]; data: OverviewData }) {
  const match = data.nextMatch;
  const attendance = data.attendance;
  if (!match || !attendance) {
    return <article className="card availability-card"><SectionHead label="ĐỘI HÌNH" title="Tình trạng tham gia" /><p className="overview-muted">Chưa có trận để tổng hợp tình trạng tham gia.</p></article>;
  }
  const canManage = hasPermission({ permissions }, "matches.manage");
  const canRespond = hasPermission({ permissions }, "matches.respond") && match.ownAttendance !== null;
  const matchHref = `/teams/${encodeURIComponent(team.slug)}/matches/${encodeURIComponent(match.id)}`;
  const ringStyle = { background: `conic-gradient(var(--lime) 0 ${attendance.confirmedPercent}%, #e8edf2 ${attendance.confirmedPercent}% 100%)` } as CSSProperties;

  return <article className="card availability-card">
    <div className="section-head"><div><span>ĐỘI HÌNH</span><h2>Tình trạng tham gia</h2></div><strong>{attendance.available}/{attendance.invited}</strong></div>
    <div className="ring-row"><div className="ring" style={ringStyle}><strong>{attendance.confirmedPercent}%</strong><span>đã chốt</span></div><div className="availability-breakdown"><b><i className="dot green" />{attendance.available} <span>Sẵn sàng</span></b><b><i className="dot gray" />{attendance.pending} <span>Chờ trả lời</span></b><b><i className="dot red" />{attendance.unavailable} <span>Vắng mặt</span></b></div></div>
    {canManage
      ? <a className="soft-button full-button" href={`${matchHref}?tab=attendance`}><Send size={16} />Nhắc người chưa trả lời</a>
      : canRespond
        ? <a className="soft-button full-button" href={matchHref}>Xác nhận tham gia</a>
        : null}
  </article>;
}

function Statistics({ data }: { data: OverviewData }) {
  const statistics = data.statistics;
  return <section className="stats-grid">
    <article className="stat-card"><div className="stat-icon"><TrendingUp /></div><span>TỈ LỆ THẮNG</span>{statistics.winRate === null ? <><div><strong>—</strong></div><small>Chưa có kết quả hoàn tất</small></> : <><div><strong>{statistics.winRate}%</strong></div><small>{statistics.wins} thắng • {statistics.draws} hòa • {statistics.losses} thua</small></>}</article>
    <article className="stat-card"><div className="stat-icon"><Activity /></div><span>PHONG ĐỘ GẦN ĐÂY</span>{statistics.recentForm.length === 0 ? <small className="overview-stat-empty">Chưa có phong độ</small> : <><div className="form-badges">{statistics.recentForm.map((value, index) => <b className={value === "D" ? "draw" : value === "L" ? "loss" : undefined} key={`${value}-${index}`}>{value}</b>)}</div><small>{statistics.recentPoints} điểm trong {statistics.recentForm.length} trận gần nhất</small></>}</article>
    <article className="stat-card"><div className="stat-icon"><Target /></div><span>VUA PHÁ LƯỚI</span>{statistics.topScorer ? <div className="player-brief"><div className="initial-avatar dark-avatar">{initials(statistics.topScorer.displayName)}</div><div><b>{statistics.topScorer.displayName ?? "Chưa cập nhật tên"}</b><small>Cầu thủ</small></div><strong>{statistics.topScorer.goals}<small>BÀN</small></strong></div> : <small className="overview-stat-empty">Chưa có dữ liệu ghi bàn</small>}</article>
    <article className="stat-card"><div className="stat-icon"><ShieldCheck /></div><span>THỨ HẠNG</span><div><strong>—</strong></div><small>Chưa có dữ liệu xếp hạng</small></article>
  </section>;
}

function NewsItem({ post }: { post: OverviewNewsPost }) {
  return <div className="news-item"><span className="news-icon danger"><MessageCircle /></span><div><b>{post.title}</b><p>{post.body}</p><small>{publishedTime(post.publishedAt)}</small></div></div>;
}

function CalendarItem({ team, match }: { team: TeamAccessContext["team"]; match: MatchSummary }) {
  const parts = fixtureDate(match.startsAt);
  const teams = matchTeams(team.name, match);
  return <a className="fixture-row overview-fixture-link" href={`/teams/${encodeURIComponent(team.slug)}/matches/${encodeURIComponent(match.id)}`}><time>{parts.day}<b>{parts.month}</b></time><span className="fixture-icon"><Trophy /></span><div><b>{teams.join(" vs ")}</b><small>{parts.time} • {match.venue ?? "Chưa cập nhật địa điểm"}</small></div><i>{match.isHome ? "NHÀ" : "KHÁCH"}</i></a>;
}

export function OverviewView({ context, result }: { context: TeamAccessContext; result: OverviewResult }) {
  if (!result.ok) {
    return <div className="dashboard-view view-stack" data-state="error"><section className="card overview-state"><h2>Không thể tải tổng quan</h2><p>Kết nối dữ liệu đang gián đoạn. Vui lòng tải lại trang.</p></section></div>;
  }
  const data = result.data;
  const state = data.nextMatch === null && data.statistics.completedMatches === 0 && data.news.length === 0 && data.calendar.length === 0 ? "empty" : "ready";
  return <div className="dashboard-view view-stack" data-state={state}>
    <section className="dashboard-hero two-col hero-ratio"><MatchHero team={context.team} data={data} /><AttendanceCard team={context.team} permissions={context.permissions} data={data} /></section>
    <Statistics data={data} />
    <section className="two-col content-ratio">
      <article className="card"><SectionHead label="ĐỘI BÓNG" title="Tin mới" /><div className="news-list">{data.news.length === 0 ? <p className="overview-muted">Chưa có tin mới</p> : data.news.map((post) => <NewsItem key={post.id} post={post} />)}</div></article>
      <article className="card"><SectionHead label="LỊCH ĐỘI" title="Sắp diễn ra" />{data.calendar.length === 0 ? <p className="overview-muted">Chưa có lịch sắp tới</p> : data.calendar.map((match) => <CalendarItem team={context.team} match={match} key={match.id} />)}<a className="text-button" href={`/teams/${encodeURIComponent(context.team.slug)}/matches`}>Xem toàn bộ lịch <span>→</span></a></article>
    </section>
  </div>;
}
