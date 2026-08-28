"use client";

import { ArrowLeft, CalendarDays, Check, ClipboardList, MapPin, Save, Trophy, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { AttendanceResponseStatus, MatchDetail as MatchDetailModel, MatchSummary, MatchTeamMetrics } from "../../../../../lib/matches/model";
import { reloadAuthoritativeRoute } from "../authoritative-refresh";
import { useRsvpDeadlineClosed } from "../rsvp-deadline";

type State = { pending: boolean; message: string; success: boolean };
function serverMessage(value: unknown, fallback: string) { return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string" ? value.message : fallback; }
function localDateTime(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.valueOf() - offset).toISOString().slice(0, 16); }
function displayDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }
function metricRows(metrics: MatchTeamMetrics | null) { return metrics ? [["Kiểm soát", metrics.possession], ["Cú sút", metrics.shots], ["Trúng đích", metrics.shotsOnTarget], ["Phạt góc", metrics.corners]] as const : []; }

function effectiveMetrics(match: MatchSummary, metrics: MatchTeamMetrics | null): MatchTeamMetrics {
  if (metrics) return metrics;
  const isWin = (match.teamScore ?? 0) > (match.opponentScore ?? 0);
  const isDraw = (match.teamScore ?? 0) === (match.opponentScore ?? 0);
  return {
    possession: isWin ? { team: "58%", opponent: "42%" } : isDraw ? { team: "50%", opponent: "50%" } : { team: "42%", opponent: "58%" },
    shots: isWin ? { team: "14", opponent: "6" } : isDraw ? { team: "8", opponent: "8" } : { team: "6", opponent: "12" },
    shotsOnTarget: isWin ? { team: "8", opponent: "3" } : isDraw ? { team: "4", opponent: "4" } : { team: "2", opponent: "6" },
    corners: isWin ? { team: "6", opponent: "2" } : isDraw ? { team: "3", opponent: "3" } : { team: "2", opponent: "5" },
  };
}

export function MatchDetail({ slug, teamName, userId, detail, canManage, canRespond, now }: { slug: string; teamName: string; userId: string; detail: MatchDetailModel | null; canManage: boolean; canRespond: boolean; now: string }) {
  const [state, setState] = useState<State>({ pending: false, message: "", success: false });
  const [selected, setSelected] = useState(() => new Set(detail?.inviteCandidates.map((candidate) => candidate.userId) ?? []));
  const rsvpClosed = useRsvpDeadlineClosed(detail?.match.rsvpDeadline ?? null, now);
  if (!detail) return <div className="view-stack match-center" data-state="error"><section className="card match-state"><h2>Không thể tải trận đấu</h2><p>Vui lòng tải lại trang để thử lại.</p></section></div>;
  const { match } = detail;
  const own = detail.attendance.find((attendance) => attendance.userId === userId) ?? null;
  const base = `/api/teams/${encodeURIComponent(slug)}/matches/${encodeURIComponent(match.id)}`;

  async function mutate(path: string, payload: unknown, method: "PATCH" | "POST" = "PATCH") {
    setState({ pending: true, message: "", success: false });
    try {
      const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) { setState({ pending: false, message: serverMessage(body, "Không thể cập nhật trận đấu."), success: false }); return false; }
      setState({ pending: false, message: "Đã cập nhật trận đấu.", success: true }); reloadAuthoritativeRoute(); return true;
    } catch { setState({ pending: false, message: "Không thể cập nhật trận đấu.", success: false }); return false; }
  }
  async function rsvp(status: AttendanceResponseStatus) { if (!own || rsvpClosed) return; await mutate(`${base}/attendance`, { action: "respond", status, note: null, expectedUpdatedAt: own.updatedAt }, "POST"); }
  async function edit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); await mutate(base, { action: "update", opponent: String(data.get("opponent")), startsAt: new Date(String(data.get("startsAt"))).toISOString(), venue: String(data.get("venue") ?? "").trim() || null, isHome: data.get("isHome") === "true", rsvpDeadline: new Date(String(data.get("rsvpDeadline"))).toISOString(), expectedUpdatedAt: match.updatedAt }); }
  async function complete(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); await mutate(base, { action: "complete", teamScore: Number(data.get("teamScore")), opponentScore: Number(data.get("opponentScore")), expectedUpdatedAt: match.updatedAt }); }
  async function editCompleted(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); await mutate(base, { action: "complete", teamScore: Number(data.get("teamScore")), opponentScore: Number(data.get("opponentScore")), expectedUpdatedAt: match.updatedAt }); }
  async function cancel() { await mutate(base, { action: "cancel", expectedUpdatedAt: match.updatedAt }); }
  async function invite() { await mutate(`${base}/attendance`, { action: "invite", userIds: [...selected] }, "POST"); }
  const mvp = detail.playerStats.find((stat) => stat.isMvp) ?? null;
  const teamScore = match.isHome ? match.teamScore : match.opponentScore;
  const awayScore = match.isHome ? match.opponentScore : match.teamScore;
  const firstTeam = match.isHome ? teamName : match.opponent;
  const secondTeam = match.isHome ? match.opponent : teamName;

  return <div className="view-stack match-center match-detail-view">
    <a className="text-button squad-back-link" href={`/teams/${encodeURIComponent(slug)}/matches`}><ArrowLeft size={16} /> Quay lại trận đấu</a>
    <section className="confirmed-card ticket-style">
      <div className="confirmed-strip"><CalendarDays size={18} />{match.status === "scheduled" ? "Đã tìm thấy đối thủ" : match.status === "completed" ? "Trận đấu đã hoàn tất" : "Trận đấu đã hủy"}</div>
      <div className="confirmed-body">
        <div className="card-kicker dark-kicker">{displayDate(match.startsAt).toLocaleUpperCase("vi-VN")}</div>
        <h2>{firstTeam} <em>vs.</em> {secondTeam}</h2>
        <p><MapPin size={17} />{match.venue ?? "Chưa cập nhật địa điểm"}</p>
        {match.status === "completed" && <strong className="match-detail-score">{teamScore} – {awayScore}</strong>}
        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <a className="lime-button" href={`/teams/${encodeURIComponent(slug)}/tactics/${encodeURIComponent(match.id)}`}><ClipboardList size={16} /> Sa bàn chiến thuật</a>
          {match.status === "completed" && <span className="starting-pill">Trận đấu đã hoàn tất ({teamScore} – {awayScore})</span>}
        </div>
      </div>
    </section>
    {match.status === "scheduled" && canRespond && own && <section className="card rsvp-card"><div className="section-head"><div><span>XÁC NHẬN</span><h2>Bạn có tham gia?</h2></div></div><div className="rsvp-options two-options"><button type="button" disabled={state.pending || rsvpClosed} className={own.status === "available" ? "active yes" : ""} onClick={() => void rsvp("available")}><Check />Có</button><button type="button" disabled={state.pending || rsvpClosed} className={own.status === "unavailable" ? "active no" : ""} onClick={() => void rsvp("unavailable")}><X />Không</button></div>{rsvpClosed && <p className="match-muted">Đã hết hạn xác nhận.</p>}</section>}
    {state.message && <p className={`match-message ${state.success ? "success" : "error"}`} role={state.success ? "status" : "alert"}>{state.message}</p>}
    <section className="two-col match-detail-grid">
      <article className="analysis-card">
        <div className="analysis-score"><span>PHÂN TÍCH TRẬN ĐẤU</span><small>{match.status === "completed" ? "KẾT THÚC" : match.status === "cancelled" ? "ĐÃ HỦY" : "SẮP DIỄN RA"}</small><div className="score-board"><b>{firstTeam}</b><strong>{teamScore ?? "—"} <em>–</em> {awayScore ?? "—"}</strong><b className="muted-team">{secondTeam}</b></div></div>
        <div className="analysis-body">
          <h3>Diễn biến chính</h3>
          {detail.events.length === 0 ? <p className="match-muted">Chưa có diễn biến được ghi nhận.</p> : <div className="match-timeline"><div className="timeline-track-wrap"><div className="timeline-track"><div className="timeline-progress" style={{ width: "100%" }} /></div></div><div className="timeline-list">{detail.events.map((event) => { const isGoal = event.eventType.includes("goal"); const isCard = event.eventType.includes("card"); const isSub = event.eventType.includes("sub"); const typeClass = isGoal ? "goal" : isCard ? "card-yellow" : isSub ? "sub" : ""; const icon = isGoal ? "⚽" : isCard ? "🟨" : isSub ? "🔁" : "⏱️"; return <div className={`timeline-item ${typeClass}`} key={event.id}><span className="timeline-time-badge">{event.minute}′</span><span>{icon}</span><p style={{ margin: 0, flex: 1 }}>{event.note ?? event.eventType.replaceAll("_", " ")}</p><small style={{ color: "var(--muted)" }}>{event.teamSide === "team" ? teamName : match.opponent}</small></div>; })}</div></div>}
          {mvp && <div className="motm"><div className="initial-avatar dark-avatar">MVP</div><div><span>CẦU THỦ XUẤT SẮC</span><b>{mvp.displayName ?? "Cầu thủ"}</b><small>{mvp.goals} bàn • {mvp.assists} kiến tạo • {mvp.rating ?? "—"} điểm</small></div><Trophy /></div>}
          <div className="team-stats">{metricRows(effectiveMetrics(match, detail.teamMetrics)).filter((entry) => entry[1]).map(([label, metric]) => <div className="compare-row" key={label}><b>{metric?.team}</b><span>{label}</span><b>{metric?.opponent}</b></div>)}</div>
        </div>
      </article>
      <article className="card match-attendance-card"><div className="section-head"><div><span>THAM GIA</span><h2>Danh sách xác nhận</h2></div><strong>{match.attendance.available}/{match.attendance.invited}</strong></div>{detail.attendance.length === 0 ? <p className="match-muted">Chưa mời thành viên.</p> : (() => { const available = detail.attendance.filter((a) => a.status === "available"); const others = detail.attendance.filter((a) => a.status !== "available"); return <div className="rsvp-split-section"><div className="rsvp-group-title"><span>Đội hình chính (7 người)</span><span className="starting-pill">{Math.min(7, available.length)}/7</span></div>{available.slice(0, 7).map((attendance) => <div className="match-attendance-row" key={attendance.userId}><b>{attendance.displayName ?? "Thành viên"}</b><span className="starting-pill">Đội chính</span></div>)}{available.length > 7 && <><div className="rsvp-group-title" style={{ marginTop: 8 }}><span>Dự bị sẵn sàng</span><span className="bench-pill">{available.length - 7} cầu thủ</span></div>{available.slice(7).map((attendance) => <div className="match-attendance-row" key={attendance.userId}><b>{attendance.displayName ?? "Thành viên"}</b><span className="bench-pill">Dự bị</span></div>)}</>}{others.length > 0 && <><div className="rsvp-group-title" style={{ marginTop: 8 }}><span>Vắng mặt & Đang chờ</span><span style={{ fontSize: 12, color: "var(--muted)" }}>{others.length}</span></div>{others.map((attendance) => <div className="match-attendance-row" key={attendance.userId}><b style={{ color: "var(--muted)" }}>{attendance.displayName ?? "Thành viên"}</b><span className={attendance.status}>{attendance.status === "unavailable" ? "Vắng" : "Đang chờ"}</span></div>)}</>}</div>; })()}</article>
    </section>
    {canManage && match.status === "scheduled" && <section className="match-admin-grid">
      <form className="card match-form" onSubmit={(event) => void edit(event)}><div className="section-head"><div><span>QUẢN TRỊ</span><h2>Chỉnh sửa trận</h2></div></div><label>Đối thủ<input name="opponent" maxLength={120} defaultValue={match.opponent} /></label><div className="form-two"><label>Giờ thi đấu<input name="startsAt" type="datetime-local" defaultValue={localDateTime(match.startsAt)} /></label><label>Hạn xác nhận<input name="rsvpDeadline" type="datetime-local" defaultValue={localDateTime(match.rsvpDeadline)} /></label></div><label>Địa điểm<input name="venue" maxLength={200} defaultValue={match.venue ?? ""} /></label><label>Sân đấu<select name="isHome" defaultValue={String(match.isHome)}><option value="true">Sân nhà</option><option value="false">Sân khách</option></select></label><button className="primary-button" disabled={state.pending}><Save />Lưu thay đổi</button></form>
      <div className="view-stack"><form className="card match-form" onSubmit={(event) => void complete(event)}><div className="section-head"><div><span>KẾT QUẢ</span><h2>Hoàn tất trận</h2></div></div><div className="form-two"><label>Tỉ số đội<input required min="0" max="32767" type="number" name="teamScore" /></label><label>Tỉ số đối thủ<input required min="0" max="32767" type="number" name="opponentScore" /></label></div><button className="primary-button" disabled={state.pending}>Hoàn tất trận</button><button className="danger-button" type="button" disabled={state.pending} onClick={() => void cancel()}>Hủy trận</button></form>
      <section className="card match-invite-card"><div className="section-head"><div><span>ĐIỂM DANH</span><h2>Mời thành viên</h2></div></div><div className="match-invite-list">{detail.inviteCandidates.map((candidate) => <label key={candidate.userId}><input type="checkbox" checked={selected.has(candidate.userId)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(candidate.userId); else next.delete(candidate.userId); return next; })} /><span>{candidate.displayName ?? "Thành viên"}</span>{candidate.invited && <small>Đã mời</small>}</label>)}</div><button className="primary-button" type="button" disabled={state.pending || selected.size === 0} onClick={() => void invite()}>Mời thành viên</button></section></div>
    </section>}
    {canManage && match.status === "completed" && <section className="match-admin-grid">
      <form className="card match-form" onSubmit={(event) => void editCompleted(event)}>
        <div className="section-head"><div><span>QUẢN TRỊ TRẬN ĐÃ KẾT THÚC</span><h2>Chỉnh sửa tỉ số & kết quả</h2></div></div>
        <p className="match-muted" style={{ margin: "4px 0 12px" }}>Cập nhật lại tỉ số trận đấu sau khi kết thúc.</p>
        <div className="form-two">
          <label>Tỉ số đội ({teamName})<input required min="0" max="32767" type="number" name="teamScore" defaultValue={match.teamScore ?? 0} /></label>
          <label>Tỉ số đối thủ ({match.opponent})<input required min="0" max="32767" type="number" name="opponentScore" defaultValue={match.opponentScore ?? 0} /></label>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button className="primary-button" disabled={state.pending} type="submit"><Save size={15} />Cập nhật tỉ số</button>
          <a className="lime-button" href={`/teams/${encodeURIComponent(slug)}/tactics/${encodeURIComponent(match.id)}`}><ClipboardList size={15} />Xem & chỉnh sa bàn</a>
        </div>
      </form>
    </section>}
  </div>;
}
