"use client";

import { ArrowRight, CalendarDays, Check, Clock3, MapPin, X } from "lucide-react";
import { useState } from "react";

import { formatVietnamMatchDateTime } from "../../../../../../lib/matches/date-time";
import { UNCERTAIN_ATTENDANCE_NOTE, type AttendanceResponseStatus, type MatchDetail } from "../../../../../../lib/matches/model";
import { useRsvpDeadlineClosed } from "../../rsvp-deadline";

type Props = Readonly<{
  slug: string;
  teamName: string;
  detail: MatchDetail | null;
  canRespond: boolean;
  ownNote: string | null;
  now: string;
}>;

function messageFrom(value: unknown): string {
  return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string"
    ? value.message
    : "Không thể lưu phản hồi. Vui lòng thử lại.";
}

export function RsvpView({ slug, teamName, detail, canRespond, ownNote, now }: Props) {
  const [state, setState] = useState({ pending: false, message: "" });
  const match = detail?.match ?? null;
  const closedByDeadline = useRsvpDeadlineClosed(match?.rsvpDeadline ?? null, now);
  if (!match) return <div className="view-stack match-center" data-state="error"><section className="card match-state"><h2>Không thể tải lời mời</h2><p>Vui lòng tải lại trang để thử lại.</p></section></div>;

  const own = match.ownAttendance;
  const detailPath = `/teams/${encodeURIComponent(slug)}/matches/${encodeURIComponent(match.id)}`;
  const lifecycleClosed = match.status !== "scheduled";
  const responseClosed = lifecycleClosed || closedByDeadline || !canRespond;
  const tentative = own?.status === "available" && ownNote === UNCERTAIN_ATTENDANCE_NOTE;

  async function respond(status: AttendanceResponseStatus, note: string | null) {
    if (!own || responseClosed) return;
    setState({ pending: true, message: "" });
    try {
      const response = await fetch(`${detailPath.replace(/^\/teams/u, "/api/teams")}/attendance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "respond", status, note, expectedUpdatedAt: own.updatedAt }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setState({ pending: false, message: messageFrom(body) });
        return;
      }
      window.location.replace(detailPath);
    } catch {
      setState({ pending: false, message: "Không thể lưu phản hồi. Vui lòng thử lại." });
    }
  }

  return <div className="view-stack match-center match-rsvp-view" data-state={!own ? "not-invited" : responseClosed ? "closed" : "ready"}>
    <section className="card match-rsvp-card">
      <div className="match-rsvp-heading"><span className="card-kicker">LỜI MỜI TRẬN ĐẤU</span><h1>Xác nhận tham gia</h1><p>Phản hồi được ghi nhận cho đúng tài khoản bạn đang đăng nhập.</p></div>
      <div className="match-rsvp-summary">
        <h2>{match.isHome ? teamName : match.opponent} <em>vs.</em> {match.isHome ? match.opponent : teamName}</h2>
        <p><CalendarDays aria-hidden="true" />{formatVietnamMatchDateTime(match.startsAt)}</p>
        <p><MapPin aria-hidden="true" />{match.venue ?? "Chưa cập nhật địa điểm"}</p>
      </div>

      {!own ? <div className="match-rsvp-notice"><h2>Bạn chưa được mời</h2><p>Link này dùng chung cho cả đội. Hãy kiểm tra bạn đang đăng nhập đúng tài khoản cầu thủ đã được Admin mời.</p></div>
        : responseClosed ? <div className="match-rsvp-notice"><h2>{lifecycleClosed ? "Trận đấu đã đóng xác nhận" : closedByDeadline ? "Đã hết hạn xác nhận" : "Bạn không có quyền phản hồi"}</h2><p>Phản hồi hiện tại: <strong>{tentative ? "Có thể" : own.status === "available" ? "Có" : own.status === "unavailable" ? "Không" : "Chưa phản hồi"}</strong>.</p></div>
        : <div className="rsvp-options match-rsvp-choices" aria-label="Chọn tình trạng tham gia">
          <button data-rsvp-choice="available" type="button" disabled={state.pending} className={own.status === "available" && !tentative ? "active yes" : ""} onClick={() => void respond("available", null)}><Check aria-hidden="true" />Có</button>
          <button data-rsvp-choice="tentative" type="button" disabled={state.pending} className={tentative ? "active maybe" : ""} onClick={() => void respond("available", UNCERTAIN_ATTENDANCE_NOTE)}><Clock3 aria-hidden="true" />Có thể</button>
          <button data-rsvp-choice="unavailable" type="button" disabled={state.pending} className={own.status === "unavailable" ? "active no" : ""} onClick={() => void respond("unavailable", null)}><X aria-hidden="true" />Không</button>
        </div>}
      {state.message && <p className="match-message error" role="alert">{state.message}</p>}
      <a className="soft-button match-rsvp-detail-link" href={detailPath}>Xem chi tiết trận <ArrowRight aria-hidden="true" /></a>
    </section>
  </div>;
}
