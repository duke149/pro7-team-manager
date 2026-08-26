"use client";

import { ArrowLeft, CalendarDays, Ruler, Save, ShieldAlert, Shirt, UserRound, Weight } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { SquadPlayerDetail } from "../../../../../lib/squad/model";

type FieldErrors = Record<string, string>;
type MutationState =
  | { kind: "idle" }
  | { kind: "pending"; operation: "update" | "deactivate" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string; fieldErrors: FieldErrors };

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

function displayDate(value: string | null): string {
  if (!value) return "Chưa cập nhật";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function displayNumber(value: number | null, suffix: string): string {
  return value === null ? "Chưa cập nhật" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value)} ${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function mutationResult(response: Response): Promise<{ ok: true } | { ok: false; message: string; fieldErrors: FieldErrors }> {
  try {
    const body: unknown = await response.json();
    if (response.ok && isRecord(body) && body.ok === true) return { ok: true };
    if (isRecord(body)) {
      const fieldErrors = isRecord(body.fieldErrors)
        ? Object.fromEntries(Object.entries(body.fieldErrors).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {};
      return {
        ok: false,
        message: typeof body.message === "string" ? body.message : "Không thể cập nhật cầu thủ. Vui lòng thử lại.",
        fieldErrors,
      };
    }
  } catch {
    // The API boundary deliberately replaces malformed upstream responses.
  }
  return { ok: false, message: "Không thể cập nhật cầu thủ. Vui lòng thử lại.", fieldErrors: {} };
}

function ProfileValue({ label, value, icon: Icon }: { label: string; value: string; icon: typeof UserRound }) {
  return <div className="player-profile-value"><Icon size={18} /><span>{label}<strong>{value}</strong></span></div>;
}

export function PlayerDetail({
  slug,
  player,
  canManage,
}: {
  slug: string;
  player: SquadPlayerDetail;
  canManage: boolean;
}) {
  const [shirtNumber, setShirtNumber] = useState(player.shirtNumber === null ? "" : String(player.shirtNumber));
  const [officialPosition, setOfficialPosition] = useState(player.officialPosition ?? "");
  const [playerStatus, setPlayerStatus] = useState(player.playerStatus);
  const [joinDate, setJoinDate] = useState(player.joinDate);
  const [adminNotes, setAdminNotes] = useState(player.adminNotes ?? "");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<MutationState>({ kind: "idle" });
  const name = player.displayName ?? "Cầu thủ chưa cập nhật tên";
  const avatarUrl = safeAvatarUrl(player.avatarUrl);
  const isOwner = player.role.isSystem && player.role.slug === "owner";
  const canMutate = canManage && !isOwner;
  const apiPath = `/api/teams/${encodeURIComponent(slug)}/players/${encodeURIComponent(player.userId)}`;

  const payload = () => ({
    roleId: player.role.id,
    shirtNumber: shirtNumber === "" ? null : Number(shirtNumber),
    officialPosition: officialPosition === "" ? null : officialPosition,
    playerStatus,
    joinDate,
    adminNotes: adminNotes.trim() || null,
  });

  async function mutate(operation: "update" | "deactivate") {
    setState({ kind: "pending", operation });
    try {
      const response = await fetch(apiPath, {
        method: operation === "update" ? "PATCH" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(operation === "update" ? payload() : { ...payload(), confirmation }),
      });
      const result = await mutationResult(response);
      setState(result.ok
        ? { kind: "success", message: operation === "update" ? "Đã cập nhật thông tin cầu thủ." : "Cầu thủ đã ngừng hoạt động." }
        : { kind: "error", message: result.message, fieldErrors: result.fieldErrors });
    } catch {
      setState({ kind: "error", message: "Không thể cập nhật cầu thủ. Vui lòng thử lại.", fieldErrors: {} });
    }
  }

  function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate("update");
  }

  return (
    <div className="view-stack squad-detail-view">
      <a className="text-button squad-back-link" href={`/teams/${encodeURIComponent(slug)}/squad`}><ArrowLeft size={16} /> Quay lại đội hình</a>
      <section className="card player-profile-hero">
        <div className="player-profile-avatar">{avatarUrl ? <span className="player-profile-photo" style={{ backgroundImage: `url(${JSON.stringify(avatarUrl)})` }} aria-hidden="true" /> : <span aria-hidden="true">{initials(name)}</span>}</div>
        <div className="player-profile-heading"><span>HỒ SƠ CẦU THỦ</span><h2>{name}</h2><div><span className="position-chip">{player.officialPosition ?? "—"}</span><span className="role-chip">{player.role.name}</span><span className={`membership-chip ${player.membershipStatus}`}>{player.membershipStatus === "active" ? "Đang hoạt động" : "Ngừng hoạt động"}</span></div></div>
        <strong>{player.shirtNumber === null ? "#—" : `#${player.shirtNumber}`}</strong>
      </section>

      <section className="player-detail-layout">
        <div className="card player-safe-profile">
          <div className="section-head"><div><span>THÔNG TIN CÁ NHÂN</span><h2>Thông tin cầu thủ</h2></div></div>
          <div className="player-profile-grid">
            <ProfileValue icon={UserRound} label="Số điện thoại" value={player.phone ?? "Chưa cập nhật"} />
            <ProfileValue icon={CalendarDays} label="Ngày sinh" value={displayDate(player.dateOfBirth)} />
            <ProfileValue icon={Ruler} label="Chiều cao" value={displayNumber(player.heightCm, "cm")} />
            <ProfileValue icon={Weight} label="Cân nặng" value={displayNumber(player.weightKg, "kg")} />
            <ProfileValue icon={Shirt} label="Vị trí ưa thích" value={player.preferredPositions.length ? player.preferredPositions.join(" • ") : "Chưa cập nhật"} />
            <ProfileValue icon={ShieldAlert} label="Tình trạng đội" value={player.membershipStatus === "active" ? "Đang hoạt động" : "Ngừng hoạt động"} />
          </div>
        </div>

        {canMutate && (
          <form className="card player-admin-form" onSubmit={submitUpdate}>
            <div className="section-head"><div><span>QUẢN TRỊ ĐỘI HÌNH</span><h2>Chỉnh sửa thông tin đội</h2></div></div>
            <div className="player-admin-fields">
              <label>Số áo<input name="shirtNumber" type="number" min="1" max="99" value={shirtNumber} onChange={(event) => setShirtNumber(event.target.value)} /></label>
              <label>Vị trí chính<select name="officialPosition" value={officialPosition} onChange={(event) => setOfficialPosition(event.target.value)}><option value="">Chưa xếp</option><option value="GK">GK</option><option value="DEF">DEF</option><option value="MID">MID</option><option value="ATT">ATT</option></select></label>
              <label>Tình trạng<select name="playerStatus" value={playerStatus} onChange={(event) => setPlayerStatus(event.target.value as typeof playerStatus)}><option value="available">Sẵn sàng</option><option value="injured">Chấn thương</option><option value="unavailable">Không sẵn sàng</option></select></label>
              <label>Ngày gia nhập<input name="joinDate" type="date" value={joinDate} onChange={(event) => setJoinDate(event.target.value)} /></label>
              <label className="player-admin-notes">Ghi chú quản trị<textarea name="adminNotes" maxLength={1000} value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} /></label>
            </div>
            {state.kind === "error" && <div className="player-mutation-message error" role="alert"><strong>{state.message}</strong>{Object.entries(state.fieldErrors).map(([field, message]) => <span key={field}>{message}</span>)}</div>}
            {state.kind === "success" && <p className="player-mutation-message success" role="status">{state.message}</p>}
            <button className="primary-button" type="submit" disabled={state.kind === "pending"}>{state.kind === "pending" && state.operation === "update" ? "Đang lưu..." : <><Save size={16} /> Lưu thay đổi</>}</button>
            <div className="player-deactivate-panel">
              <h3>Ngừng hoạt động</h3><p>Nhập DEACTIVATE để xác nhận. Tài khoản không bị xoá.</p>
              <label><span className="sr-only">Nhập DEACTIVATE để xác nhận</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="DEACTIVATE" /></label>
              <button className="danger-button" type="button" disabled={state.kind === "pending" || confirmation !== "DEACTIVATE"} onClick={() => void mutate("deactivate")}>{state.kind === "pending" && state.operation === "deactivate" ? "Đang xử lý..." : "Ngừng hoạt động"}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
