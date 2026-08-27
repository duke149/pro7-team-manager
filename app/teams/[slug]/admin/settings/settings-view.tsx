"use client";

import { Bell, FileClock, ShieldCheck, Trash2, Users } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { AdminSettingsData } from "../../../../../lib/settings/model";
import type { TeamAccessContext } from "../../../../../lib/teams/context";
import { hasPermission, type PermissionCode } from "../../../../../lib/teams/permissions";

type State = { pending: boolean; message: string; error: boolean };
function serverMessage(value: unknown, fallback: string) { return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string" ? value.message : fallback; }
function date(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }

export function SettingsView({ team, permissions, data }: { team: TeamAccessContext["team"]; permissions: readonly PermissionCode[]; data: AdminSettingsData | null }) {
  const [teamName, setTeamName] = useState(team.name);
  const [teamSlug, setTeamSlug] = useState(team.slug);
  const [matchInvitations, setMatchInvitations] = useState(data?.notificationSettings.matchInvitations ?? true);
  const [matchReminders, setMatchReminders] = useState(data?.notificationSettings.matchReminders ?? true);
  const [reminderHours, setReminderHours] = useState(data?.notificationSettings.reminderHoursBefore ?? 24);
  const [confirmation, setConfirmation] = useState("");
  const [slugConfirmation, setSlugConfirmation] = useState("");
  const [state, setState] = useState<State>({ pending: false, message: "", error: false });
  const dirtyTeam = teamName.trim() !== team.name || teamSlug.trim() !== team.slug;
  const dirtyNotifications = Boolean(data) && (matchInvitations !== data.notificationSettings.matchInvitations || matchReminders !== data.notificationSettings.matchReminders || reminderHours !== data.notificationSettings.reminderHoursBefore);
  const canUpdateTeam = hasPermission({ permissions }, "team.update");
  const canUpdateSettings = hasPermission({ permissions }, "settings.update");
  const canDelete = hasPermission({ permissions }, "team.delete");
  const deleteReady = confirmation === team.name && slugConfirmation === team.slug;

  async function mutate(payload: unknown) {
    setState({ pending: true, message: "", error: false });
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(team.slug)}/settings`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) { setState({ pending: false, message: serverMessage(body, "Không thể cập nhật cài đặt."), error: true }); return null; }
      setState({ pending: false, message: "Đã lưu cài đặt.", error: false });
      return body;
    } catch { setState({ pending: false, message: "Không thể cập nhật cài đặt.", error: true }); return null; }
  }
  async function saveTeam(event: FormEvent) { event.preventDefault(); const body = await mutate({ action: "team", name: teamName, slug: teamSlug }); if (body && teamSlug !== team.slug) window.location.assign(`/teams/${encodeURIComponent(teamSlug)}/admin/settings`); }
  async function saveNotifications(event: FormEvent) { event.preventDefault(); await mutate({ action: "notifications", matchInvitations, matchReminders, reminderHoursBefore: reminderHours }); }
  async function deleteTeam() { const body = await mutate({ action: "delete", confirmation, slugConfirmation }); if (body) window.location.assign("/"); }

  if (!data) return <div className="settings-view"><section className="card settings-state"><h2>Không thể tải cài đặt</h2><p>Không có dữ liệu nào được hiển thị một phần. Vui lòng tải lại trang.</p></section></div>;
  return <div className="settings-view view-stack">
    <header className="settings-title"><span>ADMIN PANEL</span><h2>Cài đặt đội</h2><p>Quản lý đội, quyền truy cập và cách thành viên nhận thông báo.</p></header>
    {state.message && <p className={`settings-message ${state.error ? "error" : "success"}`} role={state.error ? "alert" : "status"}>{state.message}</p>}
    <nav className="settings-tabs" aria-label="Các nhóm cài đặt"><a href="#team">Hồ sơ đội</a><a href="#members">Thành viên</a><a href="#notifications">Thông báo</a><a href="#audit">Nhật ký</a><a href="#danger">Vùng nguy hiểm</a></nav>
    <section id="team" className="card settings-module"><div className="settings-module-head"><ShieldCheck /><div><span>TỔ CHỨC</span><h3>Hồ sơ đội</h3><p>Tên hiển thị và đường dẫn duy nhất của đội.</p></div></div><form onSubmit={(event) => void saveTeam(event)}><div className="form-two"><label>Tên đội<input value={teamName} onChange={(event) => setTeamName(event.target.value)} disabled={!canUpdateTeam || state.pending} maxLength={100} /></label><label>Slug<input value={teamSlug} onChange={(event) => setTeamSlug(event.target.value)} disabled={!canUpdateTeam || state.pending} maxLength={63} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label></div>{canUpdateTeam && <button className="primary-button" disabled={!dirtyTeam || state.pending}>Lưu hồ sơ đội</button>}</form></section>
    <section id="members" className="card settings-module"><div className="settings-module-head"><Users /><div><span>QUẢN TRỊ TRUY CẬP</span><h3>Thành viên & vai trò</h3><p>{data.activeMembers} đang hoạt động • {data.inactiveMembers} đã ngừng</p></div><a className="soft-button" href={`/teams/${encodeURIComponent(team.slug)}/squad`}>Mở đội hình</a></div><div className="role-grid">{data.roles.map((role) => <article key={role.id}><div><b>{role.name}</b>{role.isSystem && <small>Hệ thống</small>}</div><p>{role.permissions.length} quyền</p><div>{role.permissions.map((permission) => <code key={permission}>{permission}</code>)}</div></article>)}</div></section>
    <section id="notifications" className="card settings-module"><div className="settings-module-head"><Bell /><div><span>LUỒNG TRẬN ĐẤU</span><h3>Thông báo trận đấu</h3><p>Quy định thông báo in-app cho thành viên.</p></div></div><form onSubmit={(event) => void saveNotifications(event)}><label className="settings-switch"><input aria-label="Bật lời mời trận đấu" type="checkbox" checked={matchInvitations} onChange={(event) => setMatchInvitations(event.target.checked)} disabled={!canUpdateSettings || state.pending} /><span><b>Lời mời trận đấu</b><small>Tạo thông báo và deep link khi Admin mời.</small></span></label><label className="settings-switch"><input aria-label="Bật nhắc người chưa trả lời" type="checkbox" checked={matchReminders} onChange={(event) => setMatchReminders(event.target.checked)} disabled={!canUpdateSettings || state.pending} /><span><b>Nhắc người chưa trả lời</b><small>Cho phép Admin phát lời nhắc in-app.</small></span></label><label className="settings-hours">Nhắc trước (giờ)<input type="number" min={1} max={168} value={reminderHours} onChange={(event) => setReminderHours(Number(event.target.value))} disabled={!canUpdateSettings || state.pending} /></label>{canUpdateSettings && <button className="primary-button" disabled={!dirtyNotifications || state.pending}>Lưu thông báo</button>}</form></section>
    <section id="audit" className="card settings-module"><div className="settings-module-head"><FileClock /><div><span>KIỂM SOÁT</span><h3>Nhật ký hoạt động</h3><p>50 thay đổi gần nhất, chỉ hiển thị metadata đã làm sạch.</p></div></div><div className="audit-list">{data.auditEvents.length === 0 ? <p>Chưa có hoạt động.</p> : data.auditEvents.map((event) => <article key={event.id}><span className={event.action.toLocaleLowerCase()}>{event.action}</span><div><b>{event.actorDisplayName ?? "Hệ thống"}</b><small>{event.tableName} • {date(event.occurredAt)}</small></div><code>{JSON.stringify(event.rowKey)}</code></article>)}</div></section>
    {canDelete && <section id="danger" className="card settings-module danger-zone"><div className="settings-module-head"><Trash2 /><div><span>KHÔNG THỂ HOÀN TÁC</span><h3>Vùng nguy hiểm</h3><p>Xóa đội cùng toàn bộ dữ liệu liên quan.</p></div></div><div className="form-two"><label>Nhập tên đội <b>{team.name}</b><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><label>Nhập slug <b>{team.slug}</b><input value={slugConfirmation} onChange={(event) => setSlugConfirmation(event.target.value)} /></label></div><button className="danger-button" type="button" disabled={!deleteReady || state.pending} onClick={() => void deleteTeam()}>Xóa vĩnh viễn đội</button></section>}
  </div>;
}
