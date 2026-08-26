"use client";

import { CalendarDays, Check, Clock3, MapPin, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { AttendanceResponseStatus, MatchListResult, MatchSummary } from "../../../../lib/matches/model";
import type { TeamAccessContext } from "../../../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../../../lib/teams/permissions";
import { useRsvpDeadlineClosed } from "./rsvp-deadline";

function dateParts(value: string) {
  const date = new Date(value);
  return {
    long: new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date).toLocaleUpperCase("vi-VN"),
    day: new Intl.DateTimeFormat("vi-VN", { day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date),
    month: `TH${new Intl.DateTimeFormat("vi-VN", { month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date)}`,
    time: new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date),
  };
}
function pair(teamName: string, match: MatchSummary) { return match.isHome ? [teamName, match.opponent] : [match.opponent, teamName]; }
function initials(name: string) { return name.trim().split(/\s+/u).slice(-2).map((part) => part[0]?.toLocaleUpperCase("vi-VN")).join("") || "ĐB"; }
function apiMessage(value: unknown, fallback: string) { return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string" ? value.message : fallback; }

function RsvpControls({ slug, match, canRespond, now }: { slug: string; match: MatchSummary; canRespond: boolean; now: string }) {
  const router = useRouter();
  const [state, setState] = useState({ pending: false, message: "" });
  const closed = useRsvpDeadlineClosed(match.rsvpDeadline, now);
  async function respond(status: AttendanceResponseStatus) {
    if (!match.ownAttendance || closed) return;
    setState({ pending: true, message: "" });
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(slug)}/matches/${encodeURIComponent(match.id)}/attendance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "respond", status, note: null, expectedUpdatedAt: match.ownAttendance.updatedAt }) });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) { setState({ pending: false, message: apiMessage(data, "Không thể cập nhật xác nhận.") }); return; }
      setState({ pending: false, message: "" }); router.refresh();
    } catch { setState({ pending: false, message: "Không thể cập nhật xác nhận." }); }
  }
  if (!canRespond || !match.ownAttendance || match.status !== "scheduled") return <p className="match-muted">Bạn chưa nhận được lời mời cho trận này.</p>;
  return <><div className="rsvp-options"><button type="button" disabled={state.pending || closed} className={match.ownAttendance.status === "available" ? "active yes" : ""} onClick={() => void respond("available")}><Check />Có</button><span className={match.ownAttendance.status === "pending" ? "active maybe" : ""}><Clock3 />Chưa xác nhận</span><button type="button" disabled={state.pending || closed} className={match.ownAttendance.status === "unavailable" ? "active no" : ""} onClick={() => void respond("unavailable")}><X />Không</button></div>{closed && <p className="match-muted">Đã hết hạn xác nhận.</p>}{state.message && <p className="match-message error" role="alert">{state.message}</p>}</>;
}

function CreateMatchForm({ slug, close }: { slug: string; close: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const opponentRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    opponentRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter((element) => element.tabIndex >= 0);
      const first = focusable[0]; const last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [close]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const payload = { opponent: String(data.get("opponent") ?? ""), startsAt: new Date(String(data.get("startsAt"))).toISOString(), venue: String(data.get("venue") ?? "").trim() || null, isHome: data.get("isHome") === "true", rsvpDeadline: new Date(String(data.get("rsvpDeadline"))).toISOString() };
      const response = await fetch(`/api/teams/${encodeURIComponent(slug)}/matches`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) { setMessage(apiMessage(responseBody, "Không thể xếp lịch trận đấu.")); setPending(false); return; }
      router.refresh(); close();
    } catch { setMessage("Không thể xếp lịch trận đấu."); setPending(false); }
  }
  return <div className="modal-layer"><section ref={dialogRef} className="modal match-modal" role="dialog" aria-modal="true" aria-labelledby="create-match-title"><div className="modal-head"><div><span>TRẬN ĐẤU</span><h2 id="create-match-title">Xếp lịch trận đấu</h2><p>Nhập thông tin đối thủ và thời gian xác nhận.</p></div><button type="button" onClick={close} aria-label="Đóng"><X /></button></div><form className="match-form" onSubmit={(event) => void submit(event)}><label>Đối thủ<input ref={opponentRef} required maxLength={120} name="opponent" /></label><div className="form-two"><label>Giờ thi đấu<input required type="datetime-local" name="startsAt" /></label><label>Hạn xác nhận<input required type="datetime-local" name="rsvpDeadline" /></label></div><label>Địa điểm<input maxLength={200} name="venue" /></label><label>Sân đấu<select name="isHome" defaultValue="true"><option value="true">Sân nhà</option><option value="false">Sân khách</option></select></label>{message && <p className="match-message error" role="alert">{message}</p>}<div className="modal-actions"><button className="soft-button" type="button" onClick={close}>Hủy</button><button className="primary-button" disabled={pending} type="submit">{pending ? "Đang lưu…" : "Xếp lịch trận đấu"}</button></div></form></section></div>;
}

export function MatchesView({ team, permissions, result, now }: { team: TeamAccessContext["team"]; userId: string; permissions: readonly PermissionCode[]; result: MatchListResult; now: string }) {
  const [creating, setCreating] = useState(false);
  const canManage = hasPermission({ permissions }, "matches.manage");
  const canRespond = hasPermission({ permissions }, "matches.respond");
  const matches = result.ok ? result.matches : [];
  const upcoming = matches.filter((match) => match.status === "scheduled" && match.startsAt >= now);
  const next = upcoming[0] ?? matches.find((match) => match.status === "scheduled") ?? null;
  const recent = [...matches].filter((match) => match.status === "completed").sort((a, b) => b.startsAt.localeCompare(a.startsAt) || b.id.localeCompare(a.id))[0] ?? null;
  const state = !result.ok ? "error" : matches.length === 0 ? "empty" : "ready";
  const nextTeams = next ? pair(team.name, next) : null;
  const recentTeams = recent ? pair(team.name, recent) : null;
  return <div className="view-stack match-center" data-state={state}>
    {!result.ok ? <section className="card match-state"><h2>Không thể tải trận đấu</h2><p>Kết nối dữ liệu đang gián đoạn. Vui lòng tải lại trang.</p></section> : matches.length === 0 ? <section className="card match-state"><h2>Chưa có trận đấu</h2><p>Lịch thi đấu của đội đang trống.</p>{canManage && <button className="primary-button" onClick={() => setCreating(true)}><Plus />Xếp lịch trận đấu</button>}</section> : <>
      <section className="two-col match-top-grid">
        {next && nextTeams ? <article className="confirmed-card"><div className="confirmed-strip"><Check size={18} />Đã tìm thấy đối thủ</div><div className="confirmed-body"><div className="card-kicker dark-kicker"><CalendarDays size={14} /> {dateParts(next.startsAt).long}</div><h2>{nextTeams[0]} <em>vs.</em> {nextTeams[1]}</h2><p><MapPin size={17} /> {next.venue ?? "Chưa cập nhật địa điểm"}</p><div className="crest-line"><span>{initials(nextTeams[0])}</span><b>VS</b><span className="metro">{initials(nextTeams[1])}</span></div><a className="text-button match-detail-link" href={`/teams/${encodeURIComponent(team.slug)}/matches/${encodeURIComponent(next.id)}`}>Xem chi tiết →</a></div></article> : <article className="confirmed-card match-state"><h2>Chưa có trận sắp tới</h2></article>}
        <article className="card rsvp-card"><div className="section-head"><div><span>XÁC NHẬN</span><h2>Bạn có tham gia?</h2></div></div>{next ? <><RsvpControls slug={team.slug} match={next} canRespond={canRespond} now={now} /><div className="roster-progress"><span><strong>{next.attendance.available}</strong>/{next.attendance.invited} đã xác nhận <b>{next.attendance.pending} đang chờ</b></span><i><b style={{ width: `${next.attendance.invited ? Math.round(next.attendance.available / next.attendance.invited * 100) : 0}%` }} /></i></div></> : <p className="match-muted">Chưa có trận để xác nhận.</p>}</article>
      </section>
      <section className="two-col match-analysis-grid">
        <article className="analysis-card">{recent && recentTeams ? <><div className="analysis-score"><span>PHÂN TÍCH • TRẬN GẦN NHẤT</span><small>KẾT THÚC</small><div className="score-board"><b>{recentTeams[0]}</b><strong>{recent.isHome ? recent.teamScore : recent.opponentScore} <em>–</em> {recent.isHome ? recent.opponentScore : recent.teamScore}</strong><b className="muted-team">{recentTeams[1]}</b></div></div><div className="analysis-body"><h3>Kết quả từ dữ liệu trận đấu</h3><p className="match-muted">Mở chi tiết để xem diễn biến, cầu thủ xuất sắc và thống kê.</p><a className="text-button" href={`/teams/${encodeURIComponent(team.slug)}/matches/${encodeURIComponent(recent.id)}`}>Xem phân tích →</a></div></> : <div className="analysis-body match-state"><h2>Chưa có phân tích</h2><p>Hoàn tất một trận để xem kết quả gần nhất.</p></div>}</article>
        <article className="card fixtures-card"><div className="section-head"><div><span>LỊCH THI ĐẤU</span><h2>Các trận sắp tới</h2></div></div>{upcoming.map((match) => { const parts = dateParts(match.startsAt); const teams = pair(team.name, match); return <a className="fixture match-fixture-link" key={match.id} href={`/teams/${encodeURIComponent(team.slug)}/matches/${encodeURIComponent(match.id)}`}><b><strong>{parts.day}</strong>{parts.month}</b><span><strong>{teams.join(" vs ")}</strong><small>{parts.time} • {match.venue ?? "Chưa cập nhật địa điểm"}</small></span>{match.isHome && <em>NHÀ</em>}</a>; })}{canManage && <button className="dashed-button" onClick={() => setCreating(true)}><Plus />Xếp lịch trận đấu</button>}</article>
      </section>
    </>}
    {creating && canManage && <CreateMatchForm slug={team.slug} close={() => setCreating(false)} />}
  </div>;
}
