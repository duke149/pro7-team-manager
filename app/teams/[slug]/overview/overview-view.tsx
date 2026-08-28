"use client";

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
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";

import type { MatchSummary } from "../../../../lib/matches/model";
import type { OverviewData, OverviewNewsPost, OverviewResult } from "../../../../lib/overview/model";
import type { TeamAccessContext } from "../../../../lib/teams/context";
import { hasPermission } from "../../../../lib/teams/permissions";
import { useRsvpDeadlineClosed } from "../matches/rsvp-deadline";

const NEWS_SUMMARY_LIMIT = 3;

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

function SectionHead({ label, title, control }: { label: string; title: string; control?: ReactNode }) {
  return <div className="section-head"><div><span>{label}</span><h2>{title}</h2></div>{control}</div>;
}

function MatchHero({ context, data }: { context: TeamAccessContext; data: OverviewData }) {
  const { team, permissions } = context;
  const canReadMatches = hasPermission({ permissions }, "matches.read");
  const canReadTactics = hasPermission({ permissions }, "tactics.read");
  const match = data.nextMatch;
  if (!match) {
    const calendarControl = canReadMatches
      ? <a className="dark-ghost" href={`/teams/${encodeURIComponent(team.slug)}/matches`}>Mở lịch thi đấu →</a>
      : <span className="dark-ghost overview-disabled-control">Mở lịch thi đấu →</span>;
    return <article className="match-hero dark-card overview-empty-card"><div className="card-kicker"><span className="live-dot" /> TRẬN ĐẤU TIẾP THEO</div><div className="overview-empty-copy"><h2>Chưa có trận sắp tới</h2><p>Lịch thi đấu hiện chưa có trận được xếp.</p></div><div className="hero-actions">{calendarControl}</div></article>;
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
    <div className="hero-actions">
      {canReadTactics ? <a className="lime-button" href={tacticsHref}><ClipboardList size={17} />Chốt đội hình</a> : <span className="lime-button overview-disabled-control"><ClipboardList size={17} />Chốt đội hình</span>}
      {canReadMatches ? <a className="dark-ghost" href={detailHref}>Chi tiết trận →</a> : <span className="dark-ghost overview-disabled-control">Chi tiết trận →</span>}
    </div>
  </article>;
}

type ReminderState = Readonly<{ status: "idle" | "pending" | "success" | "error"; message: string }>;

function boundedMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  return message.length > 0 && message.length <= 180 ? message : null;
}

function ReminderControl({ teamSlug, matchId }: { teamSlug: string; matchId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ReminderState>({ status: "idle", message: "" });

  async function remind() {
    if (state.status === "pending") return;
    setState({ status: "pending", message: "" });
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamSlug)}/matches/${encodeURIComponent(matchId)}/remind`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof payload !== "object" || payload === null || (payload as { ok?: unknown }).ok !== true) {
        const message = typeof payload === "object" && payload !== null ? boundedMessage((payload as { message?: unknown }).message) : null;
        setState({ status: "error", message: message ?? "Không thể gửi lời nhắc. Vui lòng thử lại." });
        return;
      }
      const reminded = (payload as { reminded?: unknown }).reminded;
      if (!Number.isInteger(reminded) || (reminded as number) < 0) {
        setState({ status: "error", message: "Không thể xác nhận toàn bộ lời nhắc." });
        return;
      }
      setState({
        status: "success",
        message: reminded === 0 ? "Không còn người chờ trả lời." : `Đã gửi lời nhắc đến ${reminded} cầu thủ.`,
      });
      router.refresh();
    } catch {
      setState({ status: "error", message: "Không thể gửi lời nhắc. Vui lòng thử lại." });
    }
  }

  return <>
    <button className="soft-button full-button" type="button" disabled={state.status === "pending"} onClick={remind}><Send size={16} />{state.status === "pending" ? "Đang gửi…" : "Nhắc người chưa trả lời"}</button>
    {state.message && <p className={`overview-control-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
  </>;
}

function AttendanceCard({ context, data, serverNow }: { context: TeamAccessContext; data: OverviewData; serverNow: string }) {
  const match = data.nextMatch;
  const attendance = data.attendance;
  const deadlineClosed = useRsvpDeadlineClosed(match?.rsvpDeadline ?? null, serverNow);
  if (!match || !attendance) {
    return <article className="card availability-card"><SectionHead label="ĐỘI HÌNH" title="Tình trạng tham gia" /><p className="overview-muted">Chưa có trận để tổng hợp tình trạng tham gia.</p></article>;
  }
  const { team, permissions } = context;
  const canManage = hasPermission({ permissions }, "matches.manage");
  const canReadMatches = hasPermission({ permissions }, "matches.read");
  const hasResponseAccess = hasPermission({ permissions }, "matches.respond") && match.ownAttendance !== null;
  const canRespond = canReadMatches && hasResponseAccess && match.status === "scheduled" && !deadlineClosed;
  const showClosed = canReadMatches && hasResponseAccess && match.status === "scheduled" && deadlineClosed;
  const matchHref = `/teams/${encodeURIComponent(team.slug)}/matches/${encodeURIComponent(match.id)}`;
  const ringStyle = { background: `conic-gradient(var(--lime) 0 ${attendance.confirmedPercent}%, #e8edf2 ${attendance.confirmedPercent}% 100%)` } as CSSProperties;

  return <article className="card availability-card">
    <div className="section-head"><div><span>ĐỘI HÌNH</span><h2>Tình trạng tham gia</h2></div><strong>{attendance.available}/{attendance.invited}</strong></div>
    <div className="ring-row"><div className="ring" style={ringStyle}><strong>{attendance.confirmedPercent}%</strong><span>đã chốt</span></div><div className="availability-breakdown"><b><i className="dot green" />{attendance.available} <span>Sẵn sàng</span></b><b><i className="dot gray" />{attendance.pending} <span>Chờ trả lời</span></b><b><i className="dot red" />{attendance.unavailable} <span>Vắng mặt</span></b></div></div>
    {canManage
      ? attendance.pending > 0
        ? <ReminderControl teamSlug={team.slug} matchId={match.id} />
        : <p className="overview-control-message idle">Không còn người chờ trả lời.</p>
      : canRespond
        ? <a className="soft-button full-button" href={matchHref}>Xác nhận tham gia</a>
        : showClosed
          ? <p className="overview-control-message idle">Đã hết hạn xác nhận.</p>
          : null}
  </article>;
}

function Statistics({ data, teamSlug }: { data: OverviewData; teamSlug: string }) {
  const statistics = data.statistics;
  const matchesHref = `/teams/${encodeURIComponent(teamSlug)}/matches`;
  return <section className="stats-grid">
    <article className="stat-card">
      <div className="stat-icon"><TrendingUp /></div>
      <span>TỈ LỆ THẮNG</span>
      <div className="stat-body">
        {statistics.winRate === null ? <strong>—</strong> : <strong>{statistics.winRate}%</strong>}
      </div>
      <small>{statistics.winRate === null ? "Chưa có kết quả hoàn tất" : `${statistics.wins} thắng • ${statistics.draws} hòa • ${statistics.losses} thua`}</small>
    </article>
    <a className="stat-card stat-card-interactive" href={matchesHref} title="Xem lịch sử và thông số các trận đã đấu">
      <div className="stat-icon"><Activity /></div>
      <span>PHONG ĐỘ GẦN ĐÂY</span>
      <div className="stat-body">
        {statistics.recentForm.length === 0 ? <span className="overview-stat-empty">Chưa có phong độ</span> : <div className="form-badges">{statistics.recentForm.map((value, index) => <b className={value === "D" ? "draw" : value === "L" ? "loss" : "win"} key={`${value}-${index}`}>{value}</b>)}</div>}
      </div>
      <small className="stat-card-hint">{statistics.recentPoints} điểm trong {statistics.recentForm.length} trận gần nhất <span className="arrow-glyph">→</span></small>
    </a>
    <article className="stat-card">
      <div className="stat-icon"><Target /></div>
      <span>VUA PHÁ LƯỚI</span>
      <div className="stat-body">
        {statistics.topScorer ? <div className="player-brief"><div className="initial-avatar dark-avatar">{initials(statistics.topScorer.displayName)}</div><div><b>{statistics.topScorer.displayName ?? "Chưa cập nhật tên"}</b><small>Cầu thủ</small></div><strong>{statistics.topScorer.goals}<small>BÀN</small></strong></div> : <small className="overview-stat-empty">Chưa có dữ liệu ghi bàn</small>}
      </div>
      <small>{statistics.topScorer ? "Thống kê mùa giải hiện tại" : "Chưa có dữ liệu"}</small>
    </article>
    <article className="stat-card">
      <div className="stat-icon"><ShieldCheck /></div>
      <span>THỨ HẠNG</span>
      <div className="stat-body"><strong>—</strong></div>
      <small>Chưa có dữ liệu xếp hạng</small>
    </article>
  </section>;
}

function NewsItem({ post }: { post: OverviewNewsPost }) {
  return <div className="news-item"><span className="news-icon danger"><MessageCircle /></span><div><b>{post.title}</b><p>{post.body}</p><small>{publishedTime(post.publishedAt)}</small></div></div>;
}

function NewsCard({ news }: { news: OverviewData["news"] }) {
  const [showAll, setShowAll] = useState(false);
  const hasMore = news.length > NEWS_SUMMARY_LIMIT;
  const visible = showAll ? news : news.slice(0, NEWS_SUMMARY_LIMIT);
  const control = hasMore
    ? <button type="button" aria-expanded={showAll} onClick={() => setShowAll((current) => !current)}>{showAll ? "Thu gọn" : "Xem tất cả"} →</button>
    : <span className="overview-section-control overview-disabled-control">Xem tất cả →</span>;
  return <article className="card"><SectionHead label="ĐỘI BÓNG" title="Tin mới" control={control} /><div className="news-list">{news.length === 0 ? <p className="overview-muted">Chưa có tin mới</p> : visible.map((post) => <NewsItem key={post.id} post={post} />)}</div></article>;
}

function CalendarItem({ team, match, canRead }: { team: TeamAccessContext["team"]; match: MatchSummary; canRead: boolean }) {
  const parts = fixtureDate(match.startsAt);
  const teams = matchTeams(team.name, match);
  const content = <><time dateTime={match.startsAt}>{parts.day}<b>{parts.month}</b></time><span className="fixture-icon"><Trophy /></span><div><b>{teams.join(" vs ")}</b><small>{parts.time} • {match.venue ?? "Chưa cập nhật địa điểm"}</small></div><i>{match.isHome ? "NHÀ" : "KHÁCH"}</i></>;
  return canRead
    ? <a className="fixture-row overview-fixture-link" href={`/teams/${encodeURIComponent(team.slug)}/matches/${encodeURIComponent(match.id)}`}>{content}</a>
    : <div className="fixture-row overview-fixture-link overview-disabled-control">{content}</div>;
}

function CalendarCard({ context, data }: { context: TeamAccessContext; data: OverviewData }) {
  const canRead = hasPermission({ permissions: context.permissions }, "matches.read");
  const matchesHref = `/teams/${encodeURIComponent(context.team.slug)}/matches`;
  const headerControl = canRead
    ? <a className="overview-section-control" href={matchesHref}>Mở lịch →</a>
    : <span className="overview-section-control overview-disabled-control">Mở lịch →</span>;
  const footerControl = canRead
    ? <a className="text-button" href={matchesHref}>Xem toàn bộ lịch <span>→</span></a>
    : <span className="text-button overview-disabled-control">Xem toàn bộ lịch <span>→</span></span>;
  return <article className="card"><SectionHead label="LỊCH ĐỘI" title="Sắp diễn ra" control={headerControl} />{data.calendar.length === 0 ? <p className="overview-muted">Chưa có lịch sắp tới</p> : data.calendar.map((match) => <CalendarItem team={context.team} match={match} canRead={canRead} key={match.id} />)}{footerControl}</article>;
}

export function OverviewView({ context, result, serverNow }: { context: TeamAccessContext; result: OverviewResult; serverNow: string }) {
  if (!result.ok) {
    return <div className="dashboard-view view-stack" data-state="error"><section className="card overview-state"><h2>Không thể tải tổng quan</h2><p>Kết nối dữ liệu đang gián đoạn. Vui lòng tải lại trang.</p></section></div>;
  }
  const data = result.data;
  const state = data.nextMatch === null && data.statistics.completedMatches === 0 && data.news.length === 0 && data.calendar.length === 0 ? "empty" : "ready";
  return <div className="dashboard-view view-stack" data-state={state}>
    <section className="dashboard-hero two-col hero-ratio"><MatchHero context={context} data={data} /><AttendanceCard context={context} data={data} serverNow={serverNow} /></section>
    <Statistics data={data} teamSlug={context.team.slug} />
    <section className="two-col content-ratio"><NewsCard news={data.news} /><CalendarCard context={context} data={data} /></section>
  </div>;
}
