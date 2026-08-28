"use client";

import {
  CheckCircle2,
  Copy,
  HeartPulse,
  ShieldCheck,
  Shirt,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { AccessibleModal } from "../../../components/accessible-modal";
import type { SquadFilters } from "../../../../lib/squad/filters";
import {
  isUuid,
  type SquadAssignableRole,
  type SquadListResult,
  type SquadPerformanceResult,
  type SquadPlayerPerformance,
  type SquadPlayerSummary,
} from "../../../../lib/squad/model";
import { validateProvisionMemberPayload, type ProvisionMemberSuccess } from "../../../../lib/squad/provisioning";
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

function PlayerCard({
  slug,
  player,
  performance,
  performanceError,
}: {
  slug: string;
  player: SquadPlayerSummary;
  performance?: SquadPlayerPerformance;
  performanceError: boolean;
}) {
  const name = player.displayName ?? "Cầu thủ chưa cập nhật tên";
  const avatarUrl = safeAvatarUrl(player.avatarUrl);
  const effectiveStatus = player.membershipStatus === "inactive" ? "Ngừng hoạt động" : PLAYER_STATUS_LABELS[player.playerStatus];
  const href = `/teams/${encodeURIComponent(slug)}/squad/${encodeURIComponent(player.userId)}`;
  const posCode = (player.officialPosition ?? "").toLocaleUpperCase("vi-VN");
  const posClass = posCode === "GK" ? "gk" : posCode === "DEF" ? "df" : posCode === "MID" ? "mf" : posCode === "ATT" ? "fw" : "";
  const numStr = player.shirtNumber !== null ? (player.shirtNumber < 10 ? `0${player.shirtNumber}` : String(player.shirtNumber)) : "—";
  const formList = performance?.recentForm ?? [];

  return (
    <article className={`player-card athlete-card ${player.playerStatus === "injured" ? "injured" : ""} ${player.membershipStatus === "inactive" ? "inactive" : ""}`}>
      <span className="jersey-watermark" aria-hidden="true">{numStr}</span>
      <a className="player-card-link" href={href} aria-label={`Xem hồ sơ ${name}`}>
        <div className="player-top">
          {avatarUrl
            ? <span className="player-avatar-photo" style={{ backgroundImage: `url(${JSON.stringify(avatarUrl)})` }} aria-hidden="true" />
            : <div className="initial-avatar" aria-hidden="true">{initials(name)}</div>}
          <div>
            <h3>{name}</h3>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              <span className={`position-pill ${posClass}`}>{player.officialPosition ?? "—"}</span>
              <span className="role-chip">{player.role.name}</span>
              {player.playerStatus === "injured" && <span className="injury-chip">Chấn thương</span>}
            </div>
          </div>
          <strong>{player.shirtNumber === null ? "#—" : `#${player.shirtNumber}`}</strong>
        </div>
        <div className="form-strip" aria-label="Phong độ thi đấu">
          {performanceError ? (
            <span className="performance-state error">Không thể tải phong độ</span>
          ) : !performance?.recorded ? (
            <span className="performance-state">Chưa ghi nhận thống kê</span>
          ) : (
            <>
              <span className="performance-label">
                {performance.appearances > 0 ? `Phong độ (${performance.appearances} trận):` : "Đã ghi nhận • Chưa ra sân"}
              </span>
              {formList.map((result, index) => (
                <span key={`${result}-${index}`} className={`form-badge ${result === "W" ? "win" : result === "D" ? "draw" : "loss"}`}>
                  {result}
                </span>
              ))}
            </>
          )}
        </div>
        {performance?.recorded && (
          <p className="performance-totals">
            {performance.minutes} phút • {performance.goals} bàn • {performance.assists} kiến tạo • {performance.mvpCount} MVP
            {performance.averageRating === null ? "" : ` • ${performance.averageRating} điểm TB`}
          </p>
        )}
        <div className="player-stats"><span>GIA NHẬP<strong>{player.joinDate}</strong></span><span>TÌNH TRẠNG<strong>{effectiveStatus}</strong></span><span className="player-card-open" aria-hidden="true">→</span></div>
      </a>
    </article>
  );
}

type ProvisioningState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string; fieldErrors: Record<string, string> }
  | { kind: "success"; result: ProvisionMemberSuccess; copied: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProvisionMemberSuccess(value: unknown): value is ProvisionMemberSuccess {
  if (!isRecord(value) || value.ok !== true || !isUuid(String(value.userId))) return false;
  if (value.account === "attached") {
    return !("temporaryPassword" in value);
  }
  return (
    value.account === "created" &&
    typeof value.temporaryPassword === "string" &&
    value.temporaryPassword.length >= 20
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <small id={id} className="provision-field-error">{message}</small> : null;
}

function ProvisionMemberModal({
  teamId,
  teamSlug,
  roles,
  onClose,
}: {
  teamId: string;
  teamSlug: string;
  roles: readonly SquadAssignableRole[];
  onClose: (reload?: boolean) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [shirtNumber, setShirtNumber] = useState("");
  const [officialPosition, setOfficialPosition] = useState("");
  const [joinDate, setJoinDate] = useState(today());
  const [state, setState] = useState<ProvisioningState>({ kind: "idle" });
  const fieldErrors = state.kind === "error" ? state.fieldErrors : {};
  const disabled = state.kind === "pending" || roles.length === 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateProvisionMemberPayload({
      teamId,
      email,
      displayName,
      roleId,
      shirtNumber: shirtNumber === "" ? null : Number(shirtNumber),
      officialPosition: officialPosition === "" ? null : officialPosition,
      joinDate,
    });
    if (!validation.ok) {
      setState({
        kind: "error",
        message: validation.message,
        fieldErrors: "fieldErrors" in validation ? { ...validation.fieldErrors } : {},
      });
      return;
    }

    setState({ kind: "pending" });
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamSlug)}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validation.value),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = isRecord(data) && typeof data.message === "string" && data.message.length <= 200
          ? data.message
          : "Không thể thêm cầu thủ. Vui lòng thử lại.";
        const serverErrors = isRecord(data) && isRecord(data.fieldErrors)
          ? Object.fromEntries(Object.entries(data.fieldErrors).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
          : {};
        setState({ kind: "error", message, fieldErrors: serverErrors });
        return;
      }
      if (!isProvisionMemberSuccess(data)) {
        setState({ kind: "error", message: "Không thể thêm cầu thủ. Vui lòng thử lại.", fieldErrors: {} });
        return;
      }
      setState({ kind: "success", result: data, copied: false });
    } catch {
      setState({ kind: "error", message: "Không thể thêm cầu thủ. Vui lòng thử lại.", fieldErrors: {} });
    }
  }

  async function copyPassword() {
    if (state.kind !== "success" || state.result.account !== "created") return;
    try {
      await navigator.clipboard.writeText(state.result.temporaryPassword);
      setState({ ...state, copied: true });
    } catch {
      setState({ ...state, copied: false });
    }
  }

  if (state.kind === "success") {
    const createdResult = state.result.account === "created" ? state.result : null;
    const created = createdResult !== null;
    return (
      <AccessibleModal layerClassName="provision-modal-layer" dialogClassName="provision-result-modal" labelledBy="provision-result-title" onClose={() => onClose(true)}>
          <div className="modal-head"><div><span>PRO7 TEAM MANAGER</span><h2 id="provision-result-title">{created ? "Tài khoản đã sẵn sàng" : "Đã thêm cầu thủ"}</h2><p>{created ? "Lưu thông tin đăng nhập trước khi đóng." : "Tài khoản hiện có đã được thêm vào đội."}</p></div><button type="button" onClick={() => onClose(true)} aria-label="Đóng"><X /></button></div>
          {created ? (
            <div className="one-time-credential">
              <CheckCircle2 aria-hidden="true" />
              <p>Mật khẩu tạm thời này chỉ hiển thị một lần. Hãy sao chép và gửi trực tiếp cho cầu thủ.</p>
              <code className="one-time-password">{createdResult.temporaryPassword}</code>
              <button className="soft-button copy-password-button" type="button" onClick={() => void copyPassword()}><Copy size={16} />{state.copied ? "Đã sao chép" : "Sao chép mật khẩu"}</button>
              <small>Đóng cửa sổ sau khi bạn đã lưu mật khẩu; hệ thống không thể hiển thị lại.</small>
            </div>
          ) : (
            <p className="provision-success-message" role="status">Cầu thủ đã được gắn vào đội mà không thay đổi mật khẩu hiện tại.</p>
          )}
          <div className="modal-actions"><button className="lime-button" type="button" onClick={() => onClose(true)}>{created ? "Đóng, tôi đã lưu" : "Hoàn tất"}</button></div>
      </AccessibleModal>
    );
  }

  return (
    <AccessibleModal layerClassName="provision-modal-layer" dialogClassName="provision-member-modal" labelledBy="provision-member-title" onClose={() => onClose()} closeBlocked={state.kind === "pending"}>
        <div className="modal-head"><div><span>PRO7 TEAM MANAGER</span><h2 id="provision-member-title">Thêm cầu thủ</h2><p>Tạo hồ sơ thành viên mới</p></div><button type="button" onClick={() => onClose()} disabled={state.kind === "pending"} aria-label="Đóng"><X /></button></div>
        <form className="provision-member-form" onSubmit={(event) => void submit(event)} noValidate>
          <label>Họ và tên<input name="displayName" placeholder="Ví dụ: Nguyễn Minh Anh" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={state.kind === "pending"} aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby={fieldErrors.displayName ? "provision-error-displayName" : undefined} /><FieldError id="provision-error-displayName" message={fieldErrors.displayName} /></label>
          <label>Email<input name="email" type="email" placeholder="cauthu@example.com" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={state.kind === "pending"} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "provision-error-email" : undefined} /><FieldError id="provision-error-email" message={fieldErrors.email} /></label>
          <div className="form-two">
            <label>Vai trò<select name="roleId" value={roleId} onChange={(event) => setRoleId(event.target.value)} disabled={disabled} aria-invalid={Boolean(fieldErrors.roleId)} aria-describedby={fieldErrors.roleId ? "provision-error-roleId" : undefined}>{roles.length === 0 && <option value="">Không thể tải vai trò</option>}{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><FieldError id="provision-error-roleId" message={fieldErrors.roleId} /></label>
            <label>Ngày gia nhập<input name="joinDate" type="date" max={today()} value={joinDate} onChange={(event) => setJoinDate(event.target.value)} disabled={state.kind === "pending"} aria-invalid={Boolean(fieldErrors.joinDate)} aria-describedby={fieldErrors.joinDate ? "provision-error-joinDate" : undefined} /><FieldError id="provision-error-joinDate" message={fieldErrors.joinDate} /></label>
          </div>
          <div className="form-two">
            <label>Số áo<input name="shirtNumber" type="number" min="1" max="99" placeholder="17" value={shirtNumber} onChange={(event) => setShirtNumber(event.target.value)} disabled={state.kind === "pending"} aria-invalid={Boolean(fieldErrors.shirtNumber)} aria-describedby={fieldErrors.shirtNumber ? "provision-error-shirtNumber" : undefined} /><FieldError id="provision-error-shirtNumber" message={fieldErrors.shirtNumber} /></label>
            <label>Vị trí<select name="officialPosition" value={officialPosition} onChange={(event) => setOfficialPosition(event.target.value)} disabled={state.kind === "pending"} aria-invalid={Boolean(fieldErrors.officialPosition)} aria-describedby={fieldErrors.officialPosition ? "provision-error-officialPosition" : undefined}><option value="">Chưa chọn</option><option value="GK">Thủ môn</option><option value="DEF">Hậu vệ</option><option value="MID">Tiền vệ</option><option value="ATT">Tiền đạo</option></select><FieldError id="provision-error-officialPosition" message={fieldErrors.officialPosition} /></label>
          </div>
          {roles.length === 0 && <p className="provision-message error" role="alert">Không thể tải vai trò có thể gán. Vui lòng tải lại trang.</p>}
          {state.kind === "error" && <p className="provision-message error" role="alert">{state.message}</p>}
          <div className="modal-actions"><button className="soft-button" type="button" onClick={() => onClose()} disabled={state.kind === "pending"}>Hủy</button><button className="lime-button" type="submit" disabled={disabled} aria-busy={state.kind === "pending"}>{state.kind === "pending" ? "Đang thêm…" : "Thêm vào đội"}</button></div>
        </form>
    </AccessibleModal>
  );
}

export function SquadView({
  team,
  permissions,
  filters,
  result,
  performance,
  assignableRoles = [],
  showProvisioning = false,
}: {
  team: TeamAccessContext["team"];
  permissions: readonly PermissionCode[];
  filters: SquadFilters;
  result: SquadListResult;
  performance: SquadPerformanceResult;
  assignableRoles?: readonly SquadAssignableRole[];
  showProvisioning?: boolean;
}) {
  const players = result.ok ? result.players : [];
  const canManage = hasPermission({ permissions }, "players.manage") && hasPermission({ permissions }, "members.manage");
  const [provisioningOpen, setProvisioningOpen] = useState(showProvisioning && canManage);
  const state = !result.ok ? "error" : players.length === 0 ? "empty" : "ready";
  const performanceByUserId = performance.ok
    ? new Map(performance.players.map((item) => [item.userId, item] as const))
    : null;
  const performanceError = !performance.ok
    || players.some((player) => !performanceByUserId?.has(player.userId));

  function closeProvisioning(reload = false) {
    setProvisioningOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    if (reload) window.location.reload();
  }
  return (
    <div className="view-stack">
      <SquadToolbar slug={team.slug} filters={filters} />
      <SquadSummary players={players} />
      <section className="player-grid" aria-live="polite" data-state={state}>
        {!result.ok && <article className="player-card squad-empty-state squad-error-state"><div><h2>Không thể tải đội hình</h2><p>Vui lòng tải lại trang để thử kết nối dữ liệu một lần nữa.</p></div></article>}
        {result.ok && players.length === 0 && <article className="player-card squad-empty-state"><div><h2>Chưa có cầu thủ</h2><p>Không có cầu thủ phù hợp với bộ lọc hiện tại.</p></div></article>}
        {players.map((player) => (
          <PlayerCard
            key={player.userId}
            slug={team.slug}
            player={player}
            performance={performanceByUserId?.get(player.userId)}
            performanceError={performanceError}
          />
        ))}
        {canManage && <a className="add-player-card" href={`/teams/${encodeURIComponent(team.slug)}/squad?add=player`}><span><UserPlus /></span><b>Thêm cầu thủ</b><small>Đăng ký thành viên mới</small></a>}
      </section>
      {provisioningOpen && canManage && (
        <ProvisionMemberModal
          teamId={team.id}
          teamSlug={team.slug}
          roles={assignableRoles}
          onClose={closeProvisioning}
        />
      )}
    </div>
  );
}

export const EMPTY_FILTERS: SquadFilters = Object.freeze({ q: "", searchPattern: null, position: "all", status: "active", sort: "name", direction: "asc" });
